import { chromium, Page, Browser } from 'playwright'
import { prisma } from './prisma'
import { SCRAPER_CONFIG } from './scraper-config'
import crypto from 'crypto'

export interface ScraperStatus {
    isRunning: boolean
    currentCategory: string
    currentDistrict: string
    processedCount: number
    logs: string[]
    startTime?: Date
}

class ScraperEngine {
    private static instance: ScraperEngine
    private status: ScraperStatus = {
        isRunning: false,
        currentCategory: '',
        currentDistrict: '',
        processedCount: 0,
        logs: []
    }
    private browser: Browser | null = null
    private shouldStop: boolean = false

    private constructor() { }

    public static getInstance(): ScraperEngine {
        if (!ScraperEngine.instance) {
            ScraperEngine.instance = new ScraperEngine()
        }
        return ScraperEngine.instance
    }

    public getStatus(): ScraperStatus {
        return { ...this.status }
    }

    private addLog(msg: string) {
        const timestamp = new Date().toLocaleTimeString()
        const logEntry = `[${timestamp}] ${msg}`
        this.status.logs.push(logEntry)
        if (this.status.logs.length > 50) this.status.logs.shift()
        console.log(logEntry)
    }

    private slugify(text: string): string {
        return text
            .toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w-]+/g, '')
            .replace(/--+/g, '-')
    }

    public async stop() {
        this.shouldStop = true
        this.addLog('Durdurma sinyali gönderildi...')
    }

    public async start() {
        // Eğer isRunning true ama browser null ise, bu bir stale state durumudur (crash vs). Sıfırla.
        if (this.status.isRunning && !this.browser) {
            this.status.isRunning = false;
        }

        if (this.status.isRunning) return;

        this.status.isRunning = true
        this.shouldStop = false
        this.status.startTime = new Date()
        this.status.processedCount = 0
        this.status.logs = []

        this.addLog('Motor Başlatıldı. Tam veri seti çekiliyor...')

        try {
            console.log('[Scraper] Launching browser...')
            this.browser = await chromium.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-software-rasterizer'
                ]
            })
            console.log('[Scraper] Browser launched successfully')

            const context = await this.browser.newContext({
                viewport: { width: 1280, height: 800 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            })

            const page = await context.newPage()

            for (const district of SCRAPER_CONFIG.districts) {
                if (this.shouldStop) break
                this.status.currentDistrict = district

                for (const category of SCRAPER_CONFIG.categories) {
                    if (this.shouldStop) break
                    this.status.currentCategory = category

                    const query = `${category}, ${district}, ${SCRAPER_CONFIG.city}`
                    this.addLog(`Sorgu: ${query}`)

                    try {
                        await this.scrapeGoogleMaps(page, query, category, district)
                    } catch (err: any) {
                        this.addLog(`Hata (${query}): ${err.message}`)
                    }
                }
            }

            this.addLog('Tüm bölgeler tarandı.')
        } catch (err: any) {
            this.addLog(`Kritik Hata: ${err.message}`)
        } finally {
            if (this.browser) await this.browser.close()
            this.browser = null
            this.status.isRunning = false
            this.addLog('Motor durduruldu.')
        }
    }

    private async scrapeGoogleMaps(page: Page, query: string, categoryName: string, districtName: string) {
        const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })

        try {
            const cookieButton = await page.$('button[aria-label*="Accept"], button[aria-label*="Kabul"]')
            if (cookieButton) await cookieButton.click()
        } catch { }

        // Scroll to load results
        for (let i = 0; i < 4; i++) {
            await page.mouse.wheel(0, 5000)
            await page.waitForTimeout(2000)
        }

        const businessLinks = await page.$$eval('a[href*="/maps/place/"]', (anchors: any[]) =>
            anchors.map(a => a.href)
        )

        const uniqueLinks = [...new Set(businessLinks)]
        this.addLog(`${uniqueLinks.length} firma bulundu. Detaylı tarama başladı...`)

        for (const link of uniqueLinks) {
            if (this.shouldStop) break

            try {
                await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 })
                await page.waitForTimeout(2500)

                // 1. Özet Verileri (İsim, Telefon vs) DOM'dan Çek
                const overviewData = await page.evaluate(() => {
                    const cleanText = (text: string | null | undefined) => {
                        if (!text) return '';
                        return text
                            .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202F\u2026]/g, '') // Görünmez karakterler ve fazla noktalar
                            .replace(/[–—]/g, '-') // Tüm tire çeşitlerini standart tireye çevir
                            .replace(/[\n\r\t]+/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();
                    };

                    const getElementText = (selector: string) => {
                        const el = document.querySelector(selector);
                        if (!el) return '';
                        const text = (el as HTMLElement).innerText || el.textContent || '';
                        return cleanText(text).replace(/^[\s\W]+/, ''); // Başındaki gereksiz boşlukları/noktalama işaretlerini at
                    };

                    const name = cleanText(document.querySelector('h1')?.textContent) || '';
                    const ratingText = document.querySelector('div.F7nice span[aria-hidden="true"]')?.textContent || '0';
                    const rating = parseFloat(ratingText.replace(',', '.')) || 0;

                    const reviewEl = document.querySelector('div.F7nice span[aria-label*="review"], div.F7nice span[aria-label*="yorum"]');
                    let reviewCount = 0;
                    if (reviewEl) {
                        const label = reviewEl.getAttribute('aria-label') || '';
                        const match = label.replace(/\./g, '').replace(/,/g, '').match(/(\d+)/);
                        if (match) reviewCount = parseInt(match[1]);
                    }

                    // Google'da bazen "Adres: " gibi prefixler olur, iconlardan dolayı başta ekstra sembol kalabilir.
                    let address = getElementText('button[data-item-id="address"]');
                    if (address.toLowerCase().includes('adres')) address = cleanText(address.replace(/adres/i, '').replace(/^[:\s]+/, ''));

                    let phone = getElementText('button[data-item-id*="phone"]');

                    const website = document.querySelector('a[data-item-id="authority"]')?.getAttribute('href') || '';

                    let priceInfo = 'N/A';
                    const priceEl = document.querySelector('span[aria-label*="Price"], span[aria-label*="Fiyat"], span[aria-label*="price"]');
                    if (priceEl) {
                        const label = priceEl.getAttribute('aria-label') || '';
                        priceInfo = cleanText(label.includes(':') ? label.split(':').pop() : label);
                    }

                    if (priceInfo === 'N/A') {
                        const allSpans = Array.from(document.querySelectorAll('span'));
                        const priceSpan = allSpans.find(s => (s.innerText || '').includes('₺') && (s.innerText || '').length < 15);
                        if (priceSpan) priceInfo = cleanText((priceSpan as any).innerText);
                    }

                    let operatingHours = 'N/A';

                    // Yöntem 1: Aria-label bul (Genelde 'Saatler: ...' şeklindedir)
                    const hoursButton = document.querySelector('div[data-item-id="oh"], button[data-item-id="oh"]') || document.querySelector('.t39OBd');
                    if (hoursButton) {
                        const ariaLabel = hoursButton.getAttribute('aria-label') || '';
                        if (ariaLabel.length > 5 && (ariaLabel.toLowerCase().includes('saat') || ariaLabel.toLowerCase().includes('hour'))) {
                            operatingHours = cleanText(ariaLabel.replace(/Gizle|Göster|Hide|Show/ig, '').replace(/haftanın saatleri/ig, ''));
                        } else {
                            // Yöntem 2: Tablo / Detay içinde ara
                            const hoursTable = document.querySelector('table.eKPiq'); // Bazen saatler tablo içindedir
                            if (hoursTable) {
                                operatingHours = cleanText((hoursTable as HTMLElement).innerText);
                            } else {
                                // Yöntem 3: Kapsayıcı butonun içindeki tüm metni al fakat sağındaki oklardan kurtul
                                const rawText = (hoursButton as HTMLElement).innerText || '';
                                if (rawText.length > 5) {
                                    operatingHours = cleanText(rawText.replace(//g, '').replace(//g, ''));
                                }
                            }
                        }
                    }

                    // İşletmelerde çalışma saatleri özel div'lere gömülmüş olabilir. (Yöntem 4: Genel arama)
                    if (operatingHours === 'N/A' || operatingHours.length < 5 || operatingHours.length > 500) {
                        const allDivs = Array.from(document.querySelectorAll('div, span')); // Sadece div değil spanlara da bak

                        // İçinde "saat", "açık", "kapalı", "00" gibi terimler barındıran ancak sadece 100 karakterden kısa (spesifik) olan metinleri bul.
                        const timeMatches = allDivs.map(d => (d as HTMLElement).innerText || '').filter(txt => {
                            if (txt.length > 150) return false; // Çok uzun, büyük ihtimalle sayfanın tamamını kaplayan bir üst katmandır (Senaryodaki hata)
                            return ((txt.includes(':00') || txt.includes(':30')) && (txt.includes('Açık') || txt.includes('Kapalı') || txt.includes('saat') || txt.includes('Open') || txt.includes('Closed')));
                        });

                        // En makul büyüklükte (ne çok kısa ne çok uzun) olan makul saat metnini seç
                        if (timeMatches.length > 0) {
                            // En uzun anlamlı saati seçer, bu sayede "Açık" deyip geçilmesini önleriz.
                            operatingHours = cleanText(timeMatches.sort((a, b) => b.length - a.length)[0]);
                        }
                    }

                    // Hala başarısız olduysa veya çok devasa bir string kaçtıysa güvenli silme
                    // Hala başarısız olduysa veya çok devasa bir string kaçtıysa güvenli silme
                    let finalOperatingHours: any = [];
                    if (operatingHours.length > 250) {
                        finalOperatingHours = [];
                    } else if (operatingHours !== 'N/A') {
                        // Birbirine yapışık gün-saat verilerini (Pazartesi10:00-01:00Salı) birbirinden ayır
                        operatingHours = operatingHours
                            .replace(/([a-zA-ZğüşöçIİĞÜŞÖÇ])([0-9]{1,2}:)/g, '$1 $2') // Harf ile Saat arasına boşluk koy (Pazartesi10:00 -> Pazartesi 10:00)
                            .replace(/([0-9])([a-zA-ZğüşöçIİĞÜŞÖÇ])/g, '$1, $2') // Saat bitişi ile yeni Gün arasına virgül koy (01:00Salı -> 01:00, Salı)
                            .replace(/Yeni saat önerin/ig, '') // Sonda kalan çöp metni temizle
                            .replace(/\s+/g, ' ') // Fazla boşlukları temizle
                            .trim();
                        // Sondaki veya baştaki olası virgülleri at
                        operatingHours = operatingHours.replace(/^[, ]+/, '').replace(/[, ]+$/, '');

                        // ÖNEMLİ: Daha uzun olan gün isimlerini (Pazartesi, Cumartesi) önce yazmalıyız ki kısalarla karışmasın.
                        const daysRegex = /(Pazartesi|Cumartesi|Çarşamba|Perşembe|Salı|Pazar|Cuma|Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday)/gi;

                        let matches: { day: string, index: number }[] = [];
                        let match;
                        while ((match = daysRegex.exec(operatingHours)) !== null) {
                            matches.push({ day: match[0], index: match.index });
                        }

                        for (let i = 0; i < matches.length; i++) {
                            const start = matches[i].index;
                            const end = (i + 1 < matches.length) ? matches[i + 1].index : operatingHours.length;
                            const fullText = operatingHours.substring(start, end).trim();
                            const day = matches[i].day;
                            let hours = fullText.replace(day, '').trim()
                                .replace(/[–—]/g, '-') // Özel Google tirelerini normal tireye çevir
                                .replace(/[^\x00-\x7F]/g, (char) => char === '–' || char === '—' ? '-' : '') // Kalan ASCII olmayan karakterleri süpür (saatler dışında)
                                .replace(/^[-:,\s]+/, '') // Baştaki çöpleri sil
                                .replace(/[, ]+$/, '');   // Sondaki çöpleri sil

                            if (hours.length > 0) {
                                finalOperatingHours.push({ day, hours });
                            }
                        }
                    }

                    if (finalOperatingHours.length === 0) finalOperatingHours = [];

                    const bodyText = document.body.innerText;
                    const reportedMatch = bodyText.match(/(\d+)\s+(?:kullanıcı bildirdi|users reported)/i);
                    const priceReportedCount = reportedMatch ? parseInt(reportedMatch[1]) : 0;

                    let imageUrl = document.querySelector('button[data-value="Photo"] img, div[role="region"] img, img[src*="googleusercontent.com/p/"]')?.getAttribute('src') || '';

                    // cleardot.gif lazy load placeholder ise temizle (daha sonra dışarıda bekleyip tekrar denenebilir ama 2.5s bekleme zaten var)
                    if (imageUrl.includes('cleardot.gif')) {
                        imageUrl = '';
                    }

                    return {
                        name, rating, reviewCount, address, phone, website,
                        priceInfo, priceReportedCount, operatingHours: finalOperatingHours, imageUrl
                    };
                });

                if (!overviewData || !overviewData.name) {
                    this.addLog(`! [Uyarı] İsim bulunamadı (Sayfa yüklenemedi veya format farklı), atlandı`);
                    continue;
                }

                // EĞER ImageURL boş çıktıysa (lazy load bekliyorsa), 2 saniye daha bekle ve sadece resmi tekrar dene
                if (!overviewData.imageUrl) {
                    await page.waitForTimeout(2000);
                    const retryImage = await page.evaluate(() => {
                        const img = document.querySelector('button[data-value="Photo"] img, div[role="region"] img, img[src*="googleusercontent.com/p/"]');
                        const src = img?.getAttribute('src') || '';
                        return src.includes('cleardot.gif') ? '' : src;
                    });
                    if (retryImage) {
                        overviewData.imageUrl = retryImage;
                    }
                }

                // --- Gallery Extraction ---
                let galleryImages: string[] = [];
                try {
                    const photoButton = await page.$('button[data-value="Photo"], button[aria-label*="Fotoğraflar"], button[aria-label*="Photos"], .aoRNLd');
                    if (photoButton) {
                        await photoButton.click();
                        await page.waitForTimeout(3000);

                        // Gallery içindeki grid'i bul ve kaydır
                        const galleryContainer = await page.$('.m6QErb.DxyBCb');
                        if (galleryContainer) {
                            for (let k = 0; k < 3; k++) {
                                await page.mouse.wheel(0, 3000);
                                await page.waitForTimeout(1000);
                            }
                        }

                        galleryImages = await page.evaluate(() => {
                            const urls: string[] = [];
                            const items = document.querySelectorAll('img[src*="googleusercontent.com/p/"], div[style*="background-image"]');

                            items.forEach(el => {
                                let src = '';
                                if (el.tagName === 'IMG') {
                                    src = (el as HTMLImageElement).src;
                                } else {
                                    const style = (el as HTMLElement).style.backgroundImage;
                                    const match = style.match(/url\(['"]?([^'"]+)['"]?\)/);
                                    if (match) src = match[1];
                                }

                                if (src && src.includes('googleusercontent.com/p/') && !src.includes('cleardot.gif')) {
                                    // Kaliteyi artır (s1600 orijinal boyutun makul bir sınırı)
                                    const cleanUrl = src.split('=')[0] + '=s1600';
                                    urls.push(cleanUrl);
                                }
                            });
                            return [...new Set(urls)].slice(0, 15);
                        });
                        // Galeri'den çık (ESC)
                        await page.keyboard.press('Escape');
                        await page.waitForTimeout(1000);
                    }
                } catch (e) {
                    console.log("Gallery extraction skipped or failed");
                }

                // 2. Yorumları Çekmek İçin Tıkla ve Bekle
                let rawReviews: any[] = [];
                try {
                    const clicked = await page.evaluate(() => {
                        const tabs = Array.from(document.querySelectorAll('[role="tab"], button'));
                        for (const tab of tabs) {
                            const text = tab.textContent || '';
                            const aria = tab.getAttribute('aria-label') || '';
                            if (text.includes('Yorum') || aria.includes('Yorum') || text.includes('Review') || aria.includes('Review')) {
                                (tab as HTMLElement).click();
                                return true;
                            }
                        }
                        return false;
                    });

                    if (clicked) {
                        await page.waitForTimeout(3000);
                        for (let j = 0; j < 2; j++) {
                            await page.mouse.wheel(0, 4000);
                            await page.waitForTimeout(1000);
                        }

                        rawReviews = await page.evaluate(() => {
                            const cleanText = (text: string | null | undefined) => {
                                if (!text) return '';
                                return text.replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
                            };
                            const revs: any[] = [];
                            const seenReviews = new Set();

                            // Yanlışlıkla kopya elementleri seçmemek için sadece tek bir kapsayıcı seçici:
                            const reviewBlocks = document.querySelectorAll('div.jftiEf');

                            for (const block of Array.from(reviewBlocks)) {
                                if (revs.length >= 10) break;

                                const author = cleanText((block.querySelector('.d4r55, .X43Kjb') as any)?.innerText || (block.querySelector('.TSUbDb') as any)?.innerText);
                                const ratingStr = block.querySelector('span.kvMYJc, span[aria-label*="yıldız"], span[aria-label*="star"]')?.getAttribute('aria-label') || '';
                                let rRating = 0;
                                const rMatch = ratingStr.match(/(\d+)/);
                                if (rMatch) rRating = parseInt(rMatch[1]);

                                const text = cleanText((block.querySelector('.wiI7pd, .MyEned > span') as any)?.innerText);
                                const time = cleanText((block.querySelector('.rsqaWe, .xRkHEb') as any)?.innerText);
                                const avatar = block.querySelector('img.NBa79, img[src*="googleusercontent.com/a/"]')?.getAttribute('src') || '';

                                // Yorum fotoğraflarını çek
                                const reviewImages: string[] = [];
                                const photoEls = block.querySelectorAll('button[style*="background-image"]');
                                photoEls.forEach(el => {
                                    const style = (el as HTMLElement).style.backgroundImage;
                                    const match = style.match(/url\(['"]?([^'"]+)['"]?\)/);
                                    if (match) {
                                        const url = match[1].split('=')[0] + '=s1600';
                                        reviewImages.push(url);
                                    }
                                });

                                // Olası duplicate yorumları atlamak için imza
                                const reviewSignature = `${author}-${text.substring(0, 10)}`;

                                if (author && (text || rRating > 0) && !seenReviews.has(reviewSignature)) {
                                    seenReviews.add(reviewSignature);
                                    revs.push({ author, rating: rRating, text, time, avatar, images: reviewImages });
                                }
                            }
                            return revs;
                        });
                    }
                } catch (e) {
                    console.log("Review extraction skipped");
                }

                const data = {
                    ...overviewData,
                    directionLink: link,
                    galleryImages,
                    rawReviews
                };

                if (data && data.name) {
                    const businessId = crypto.createHash('md5').update(data.name + districtName).digest('hex')
                    await this.saveToDb({ ...data, businessId, query }, categoryName, districtName)
                    this.status.processedCount++
                    this.addLog(`+ [DB] ${data.name} | R:${data.rating} | Y:${data.reviewCount} | (Çekilen: ${data.rawReviews?.length || 0}) | F:${data.priceInfo}`)
                }
            } catch (err: any) {
                this.addLog(`! [Hata] Firma atlandı (${link}): ${err.message}`)
                continue
            }
        }
    }

    private async saveToDb(data: any, categoryName: string, districtName: string) {
        try {
            const city = await prisma.city.upsert({
                where: { name: SCRAPER_CONFIG.city },
                update: {},
                create: {
                    name: SCRAPER_CONFIG.city,
                    slug: this.slugify(SCRAPER_CONFIG.city)
                }
            })

            const districtSlug = this.slugify(districtName)
            const district = await prisma.district.upsert({
                where: { cityId_slug: { cityId: city.id, slug: districtSlug } },
                update: {},
                create: {
                    name: districtName,
                    slug: districtSlug,
                    cityId: city.id
                }
            })

            const categorySlug = this.slugify(categoryName)
            const category = await prisma.category.upsert({
                where: { name: categoryName },
                update: {},
                create: {
                    name: categoryName,
                    slug: categorySlug
                }
            })

            await prisma.business.upsert({
                where: { businessId: data.businessId },
                update: {
                    businessName: data.name,
                    rating: data.rating,
                    reviewCount: data.reviewCount,
                    address: data.address,
                    directionLink: data.directionLink,
                    priceInfo: data.priceInfo,
                    priceReportedCount: data.priceReportedCount,
                    operatingHours: data.operatingHours,
                    phone: data.phone,
                    imageUrl: data.imageUrl,
                    images: data.galleryImages || [],
                    website: data.website,
                    reviews: data.rawReviews || [],
                    categoryId: category.id,
                    districtId: district.id,
                    query: data.query,
                    timestamp: new Date()
                },
                create: {
                    businessId: data.businessId,
                    businessName: data.name,
                    rating: data.rating,
                    reviewCount: data.reviewCount,
                    address: data.address,
                    directionLink: data.directionLink,
                    priceInfo: data.priceInfo,
                    priceReportedCount: data.priceReportedCount,
                    operatingHours: data.operatingHours,
                    phone: data.phone,
                    imageUrl: data.imageUrl,
                    images: data.galleryImages || [],
                    website: data.website,
                    reviews: data.rawReviews || [],
                    categoryId: category.id,
                    districtId: district.id,
                    query: data.query,
                    timestamp: new Date()
                }
            })
        } catch (err: any) {
            console.error('DB Error:', err.message)
            this.addLog(`! [Hata] DB Kayıt Hatası: ${err.message}`)
        }
    }
}

// Next.js hot-reload singleton
const globalForScraper = global as unknown as {
    scraperEngine: ScraperEngine | undefined
}

export const scraperEngine = globalForScraper.scraperEngine || ScraperEngine.getInstance()

if (process.env.NODE_ENV !== 'production') {
    globalForScraper.scraperEngine = scraperEngine
}
