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
                    const ratingEl = document.querySelector('div.F7nice span[aria-hidden="true"], .fontDisplayLarge, .TTX38c');
                    const ratingText = ratingEl?.textContent || '0';
                    const rating = parseFloat(ratingText.replace(',', '.')) || 0;

                    // Review count fix: Do not use the rating span. Usually the second span in F7nice.
                    let reviewCount = 0;
                    const ratingContainer = document.querySelector('div.F7nice');
                    if (ratingContainer) {
                        const spans = Array.from(ratingContainer.querySelectorAll('span'));
                        // Filter out the rating span (aria-hidden=true) and find the one that looks like a count (e.g. "(79)")
                        const countSpan = spans.find(s => s.getAttribute('aria-hidden') !== 'true' && (s.textContent || '').includes('('));
                        if (countSpan) {
                            const match = countSpan.textContent?.replace(/\D/g, '');
                            if (match) reviewCount = parseInt(match);
                        }
                    }

                    // Fallback for review count
                    if (reviewCount === 0) {
                        const reviewEl = document.querySelector('span[aria-label*="review"], span[aria-label*="yorum"], button[aria-label*="yorum"], button[aria-label*="review"]');
                        if (reviewEl) {
                            const label = reviewEl.getAttribute('aria-label') || reviewEl.textContent || '';
                            // "4 yorum" veya "4 reviews" gibi metinlerden sadece sayıyı al, puandan (yıldızdan) uzak dur.
                            if (!label.toLowerCase().includes('yıldız') && !label.toLowerCase().includes('star')) {
                                const match = label.replace(/\D/g, '');
                                if (match) reviewCount = parseInt(match);
                            }
                        }
                    }

                    // Google'da bazen "Adres: " gibi prefixler olur, iconlardan dolayı başta ekstra sembol kalabilir.
                    let address = getElementText('button[data-item-id="address"], .RcC65b[data-item-id="address"]');
                    if (address.toLowerCase().includes('adres')) address = cleanText(address.replace(/adres/i, '').replace(/^[:\s]+/, ''));

                    let phone = getElementText('button[data-item-id*="phone"], .RcC65b[data-item-id*="phone"]');

                    const website = document.querySelector('a[data-item-id="authority"], .IT5z3c')?.getAttribute('href') || '';

                    let priceInfo = 'N/A';
                    const priceEl = document.querySelector('span[aria-label*="Price"], span[aria-label*="Fiyat"], span[aria-label*="price"], .fontBodyMedium span[aria-label*="TL"]');
                    if (priceEl) {
                        const label = priceEl.getAttribute('aria-label') || '';
                        priceInfo = cleanText(label.includes(':') ? label.split(':').pop() : label);
                    }

                    if (priceInfo === 'N/A') {
                        const allSpans = Array.from(document.querySelectorAll('span'));
                        const priceSpan = allSpans.find(s => (s.innerText || '').includes('₺') && (s.innerText || '').length < 15);
                        if (priceSpan) priceInfo = cleanText((priceSpan as any).innerText);
                    }

                    let finalOperatingHours: any[] = [];

                    const hoursButton = document.querySelector('div[data-item-id="oh"], button[data-item-id="oh"], .t39OBd, .OMl5r');
                    const hoursTable = document.querySelector('table.eKPiq, table.y074mc, table.eK4R0e');

                    if (hoursTable) {
                        const rows = Array.from(hoursTable.querySelectorAll('tr'));
                        finalOperatingHours = rows.map(row => {
                            const day = (row.querySelector('td:first-child, td.ylH6lf') as HTMLElement)?.innerText || (row.children[0] as HTMLElement)?.innerText || '';
                            const time = (row.querySelector('td:last-child, td.mxowUb') as HTMLElement)?.innerText || (row.children[1] as HTMLElement)?.innerText || '';
                            return { day: day.trim(), hours: time.trim() };
                        }).filter(h => h.day && h.hours);
                    } else if (hoursButton) {
                        const ariaLabel = hoursButton.getAttribute('aria-label') || '';
                        const innerText = (hoursButton as HTMLElement).innerText || '';

                        // Aria-label genelde tam haftalık listeyi içerir
                        if (ariaLabel.length > 20 && (ariaLabel.includes(';') || ariaLabel.includes(','))) {
                            const dayTerms = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
                            const daysRegex = new RegExp(`(${dayTerms.join('|')})`, 'gi');

                            let rawParts = ariaLabel.replace(/haftanın saatleri/ig, '').replace(/Gizle|Göster|Hide|Show/ig, '').trim();

                            let matches: { day: string, index: number }[] = [];
                            let m;
                            while ((m = daysRegex.exec(rawParts)) !== null) {
                                matches.push({ day: m[0], index: m.index });
                            }

                            for (let i = 0; i < matches.length; i++) {
                                const start = matches[i].index;
                                const end = (i + 1 < matches.length) ? matches[i + 1].index : rawParts.length;
                                const fullText = rawParts.substring(start, end).trim();
                                const day = matches[i].day;
                                let hours = fullText.replace(day, '').trim().replace(/^[-:,\s]+/, '').replace(/;$/, '').trim();
                                if (hours) finalOperatingHours.push({ day, hours });
                            }
                        }

                        // Eğer hala boşsa ve kısa bir text varsa (örn: "24 saat açık") - Bunu OperatingHours'a değil, yedek bir alana koyalım ki 
                        // aşağıdaki "retry" mantığını bozmasın. Çünkü kullanıcı tam listeyi istiyor.
                        if (finalOperatingHours.length === 0 && innerText.length > 0 && innerText.length < 100) {
                            // Sadece "Kapalı..." gibi kısa metin varsa retry'ı tetiklemek için operatingHours'u boş bırakıyoruz
                            // Ama aria-label'da tam liste varsa zaten yukarıda dolmuş olacak.
                        }
                    }

                    // Bu blok artık yukarıdaki mantığa entegre edildiği için temizleyebiliriz veya yedek bırakabiliriz.
                    // finalOperatingHours zaten yukarıda doldu.

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

                // --- ÇALIŞMA SAATLERİ GARANTİLEME ---
                if (!overviewData.operatingHours || overviewData.operatingHours.length < 5) {
                    try {
                        // Daha geniş buton seçicileri
                        const hBtn = await page.$('button[data-item-id="oh"], .t39OBd, .OMl5r, [aria-label*="çalışma saatleri"], [aria-label*="hours"], div[role="button"] span[aria-label*="Çalışma saatleri"]');
                        if (hBtn) {
                            // Eğer butonun kendisi değil kapsayıcısı lazımsa (div[role="button"])
                            const clickTarget = await page.evaluateHandle((el) => {
                                if (el.tagName === 'SPAN') return el.parentElement;
                                return el;
                            }, hBtn);

                            await (clickTarget as any).click();
                            await page.waitForTimeout(1500);
                            const retryHours = await page.evaluate(() => {
                                // Google'ın farklı tablo sınıfları
                                const hoursTable = document.querySelector('table.eKPiq, table.y074mc, table.eK4R0e, .G86p4 table');
                                if (hoursTable) {
                                    const rows = Array.from(hoursTable.querySelectorAll('tr'));
                                    return rows.map(row => {
                                        const day = (row.querySelector('td:first-child, td.ylH6lf') as HTMLElement)?.innerText || (row.children[0] as HTMLElement)?.innerText || '';
                                        const time = (row.querySelector('td:last-child, td.mxowUb') as HTMLElement)?.innerText || (row.children[1] as HTMLElement)?.innerText || '';
                                        return { day: day.trim(), hours: time.trim() };
                                    }).filter(h => h.day && h.hours);
                                }
                                return [];
                            });
                            if (retryHours && retryHours.length > 0) {
                                overviewData.operatingHours = retryHours;
                            }
                        }
                    } catch (e) { }
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
                    // Genişletilmiş buton seçicileri (Küçük-büyük harf duyarsızlığı için regex benzeri veya çoklu kelime)
                    const photoButton = await page.$('button[data-value="Photo"], button[aria-label*="otoğraf"], button[aria-label*="hoto"], .aoRNLd, .Dx2nRe, .ao3oP');
                    if (photoButton) {
                        await photoButton.click();
                        await page.waitForSelector('.m6QErb', { timeout: 10000 }).catch(() => { });
                        await page.waitForTimeout(3000); // Görsellerin asenkron gelmesi için

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
                            const items = document.querySelectorAll('img[src*="googleusercontent.com/p/"], div[style*="background-image"], a.MIgS0d');

                            items.forEach(el => {
                                let src = '';
                                if (el.tagName === 'IMG') {
                                    src = (el as HTMLImageElement).src;
                                } else if (el.tagName === 'A') {
                                    const innerImg = el.querySelector('img');
                                    if (innerImg) src = innerImg.src;
                                    else {
                                        const style = (el as HTMLElement).style.backgroundImage;
                                        const match = style.match(/url\(['"]?([^'"]+)['"]?\)/);
                                        if (match) src = match[1];
                                    }
                                } else {
                                    const style = (el as HTMLElement).style.backgroundImage;
                                    const match = style.match(/url\(['"]?([^'"]+)['"]?\)/);
                                    if (match) src = match[1];
                                }

                                if (src && src.includes('googleusercontent.com/p/') && !src.includes('cleardot.gif')) {
                                    const cleanUrl = src.split('=')[0] + '=s1600';
                                    urls.push(cleanUrl);
                                }
                            });
                            return [...new Set(urls)].slice(0, 15);
                        });
                        // Galeri'den çık (ESC ve X butonu ile garantiye al)
                        await page.keyboard.press('Escape');
                        await page.waitForTimeout(500);
                        const closeBtn = await page.$('button[aria-label*="Kapat"], button[aria-label*="Close"], button.S9kv8e');
                        if (closeBtn) await closeBtn.click();
                        await page.waitForTimeout(1000);
                    }
                } catch (e) {
                    this.addLog(`! Galeri çekimi başarısız veya atlandı`);
                }

                // *** KRİTİK: Galeri sonrası sayfa state'i bozulmuş olabilir.
                // Sayfayı orijinal business URL'sine geri yönlendir ve yeniden yükle.
                try {
                    await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await page.waitForTimeout(2500);
                    this.addLog(`- Sayfa yeniden yüklendi (galeri sonrası temizlik)`);
                } catch (e) {
                    this.addLog(`! Sayfa yeniden yüklenemedi, yorumlar atlanabilir`);
                }

                // 2. Yorumları Çekmek İçin Tıkla ve Bekle
                let rawReviews: any[] = [];
                try {
                    // Basit ve güvenilir: Sadece role="tab" elemanlarında ara
                    const clickResult = await page.evaluate(() => {
                        const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
                        for (const tab of tabs) {
                            const text = (tab.textContent || '').toLowerCase().trim();
                            const aria = (tab.getAttribute('aria-label') || '').toLowerCase();
                            // Yasal açıklama butonlarını atla
                            if (aria.includes('yasal') || aria.includes('açıklama') || aria.includes('legal')) continue;
                            // Yorum sekmesini bul
                            if (text.includes('yorum') || aria.includes('yorum') || text.includes('review') || aria.includes('review')) {
                                (tab as HTMLElement).click();
                                return { found: true, name: text.substring(0, 30) };
                            }
                        }
                        return { found: false, name: '' };
                    });

                    if (clickResult.found) {
                        this.addLog(`- Yorumlar sekmesine tıklandı: "${clickResult.name}"`);

                        // Yorumların yüklenmesini bekle
                        await page.waitForSelector('.jftiEf', { timeout: 10000 }).catch(() => {
                            this.addLog("! Yorumlar listesi 10sn içinde gelmedi");
                        });
                        await page.waitForTimeout(2000);

                        // "Daha fazla" butonlarına bas (yorum metinlerini genişlet)
                        try {
                            const moreBtns = await page.$$('button[aria-label*="Daha fazla"], button[aria-label*="Show more"], button.w8nwRe.kyuRq');
                            for (const btn of moreBtns) {
                                await btn.click();
                                await page.waitForTimeout(300);
                            }
                        } catch (e) { }

                        // Kaydırarak daha fazla yorum yükle
                        for (let j = 0; j < 3; j++) {
                            await page.mouse.wheel(0, 4000);
                            await page.waitForTimeout(1500);
                        }


                        rawReviews = await page.evaluate(() => {
                            const cleanText = (text: string | null | undefined) => {
                                if (!text) return '';
                                return text.replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
                            };

                            const revs: any[] = [];
                            const seenReviews = new Set();
                            const reviewBlocks = document.querySelectorAll('div.jftiEf');

                            for (const block of Array.from(reviewBlocks)) {
                                if (revs.length >= 15) break;

                                // Author selector expanded - Daha agresif arama
                                const authorEl = block.querySelector('.d4r55, .X43Kjb, .al6Kxe, .TSUbDb, .W67Drf, .f0S8F, [class*="author"]');
                                let author = cleanText((authorEl as any)?.innerText || authorEl?.textContent);

                                // Yedek: Eğer hala boşsa ilk span'a bak
                                if (!author) {
                                    const possibleAuthor = block.querySelector('button div[class*="font"]');
                                    if (possibleAuthor) author = cleanText((possibleAuthor as any).innerText);
                                }

                                // Rating Extraction
                                const ratingEl = block.querySelector('span.kvMYJc, span[aria-label*="yıldız"], span[aria-label*="star"], span.kvS7H, .kx8fBe, [aria-label*="/5"]');
                                const ratingStr = ratingEl?.getAttribute('aria-label') || ratingEl?.textContent || '';
                                let rRating = 0;
                                const rMatch = ratingStr.match(/(\d+)/);
                                if (rMatch) {
                                    rRating = parseInt(rMatch[1]);
                                }

                                const textEl = block.querySelector('.wiI7pd, .MyEned > span, .wiW3ob, .MyVUIb, .K70oRd, .content');
                                const text = cleanText((textEl as any)?.innerText || textEl?.textContent);
                                const time = cleanText((block.querySelector('.rsqaWe, .xRkHEb, .P87Y0b, .OD9uAe') as any)?.innerText);

                                // Avatar Selection
                                const avatarImg = block.querySelector('img.NBa79, img.NBa79c, img[src*="googleusercontent.com/a/"], .WEBjve img');
                                const avatar = avatarImg?.getAttribute('src') || '';

                                const reviewImages: string[] = [];
                                const photoEls = block.querySelectorAll('button[style*="background-image"], a.mYFivd[style*="background-image"], .Tya61d');
                                photoEls.forEach(el => {
                                    const style = (el as HTMLElement).style.backgroundImage;
                                    const match = style.match(/url\(['"]?([^'"]+)['"]?\)/);
                                    if (match) {
                                        const url = match[1].split('=')[0] + '=s1600';
                                        reviewImages.push(url);
                                    }
                                });

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
