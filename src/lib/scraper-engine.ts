import { Page, Browser } from 'playwright'
import { chromium } from 'playwright-extra'
import stealth from 'puppeteer-extra-plugin-stealth'
import fs from 'fs'
import path from 'path'
import { prisma } from './prisma'
import { SCRAPER_CONFIG } from './scraper-config'
import crypto from 'crypto'

chromium.use(stealth())

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

        this.addLog('Motor Başlatıldı. Akıllı görev listesi kontrol ediliyor...')

        try {
            // Görevleri senkronize et (Yeni ilçe/kategori eklenmişse tabloya ekle)
            await this.syncJobs()

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
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                locale: 'tr-TR',
                timezoneId: 'Europe/Istanbul'
            })

            const page = await context.newPage()

            // Akıllı Döngü: En eski taranmış veya hiç taranmamış görevi bul
            while (!this.shouldStop) {
                const nextJob = await prisma.scrapeJob.findFirst({
                    where: {
                        category: { name: { in: SCRAPER_CONFIG.categories } },
                        district: { name: { in: SCRAPER_CONFIG.districts } }
                    },
                    orderBy: [
                        { lastRun: 'asc' }, // nulls first (hiç taranmamışlar başa)
                        { id: 'asc' }
                    ],
                    include: {
                        category: true,
                        district: true
                    }
                })

                if (!nextJob) {
                    this.addLog('Yapılacak görev bulunamadı veya yapılandırma boş.')
                    break
                }

                this.status.currentDistrict = nextJob.district.name
                this.status.currentCategory = nextJob.category.name
                const query = `${nextJob.category.name}, ${nextJob.district.name}, ${SCRAPER_CONFIG.city}`

                const lastRunText = nextJob.lastRun
                    ? ` (Son Tarama: ${new Date(nextJob.lastRun).toLocaleDateString()})`
                    : ' (Hiç taranmadı)'

                this.addLog(`>>> Görev: ${query}${lastRunText}`)

                try {
                    await prisma.scrapeJob.update({
                        where: { id: nextJob.id },
                        data: { status: 'RUNNING' }
                    })

                    const foundCount = await this.scrapeGoogleMaps(page, query, nextJob.category.name, nextJob.district.name)

                    await prisma.scrapeJob.update({
                        where: { id: nextJob.id },
                        data: {
                            status: 'COMPLETED',
                            lastRun: new Date(),
                            totalFound: foundCount
                        }
                    })
                } catch (err: any) {
                    this.addLog(`İş Hatası (${query}): ${err.message}`)
                    await prisma.scrapeJob.update({
                        where: { id: nextJob.id },
                        data: { status: 'FAILED' }
                    }).catch(() => { })
                }

                if (this.shouldStop) break

                // Görevler arası kısa bir nefes aldır
                await page.waitForTimeout(3000)
            }

            if (!this.shouldStop) {
                this.addLog('Tüm görev havuzu başarıyla işlendi.')
            }
        } catch (err: any) {
            this.addLog(`Kritik Hata: ${err.message}`)
        } finally {
            if (this.browser) await this.browser.close()
            this.browser = null
            this.status.isRunning = false
            this.addLog('Motor durduruldu.')
        }
    }

    private async syncJobs() {
        try {
            const city = await prisma.city.upsert({
                where: { name: SCRAPER_CONFIG.city },
                update: {},
                create: {
                    name: SCRAPER_CONFIG.city,
                    slug: this.slugify(SCRAPER_CONFIG.city)
                }
            })

            for (const districtName of SCRAPER_CONFIG.districts) {
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

                for (const categoryName of SCRAPER_CONFIG.categories) {
                    const categorySlug = this.slugify(categoryName)
                    const category = await prisma.category.upsert({
                        where: { name: categoryName },
                        update: {},
                        create: {
                            name: categoryName,
                            slug: categorySlug
                        }
                    })

                    await prisma.scrapeJob.upsert({
                        where: { categoryId_districtId: { categoryId: category.id, districtId: district.id } },
                        update: {},
                        create: {
                            categoryId: category.id,
                            districtId: district.id,
                            status: 'PENDING'
                        }
                    })
                }
            }
        } catch (err: any) {
            console.error('Job Sync Error:', err.message)
            this.addLog(`! [Hata] Görev listesi senkronize edilemedi: ${err.message}`)
        }
    }

    private async scrapeGoogleMaps(page: Page, query: string, categoryName: string, districtName: string): Promise<number> {
        // hl=tr parametresi Google'ın Türkçe dönmesini sağlar.
        const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=tr`
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })

        try {
            // Google Consent sayfası için (Avrupa sunucularında varsayılan gelir)
            if (page.url().includes('consent.google.com')) {
                const form = await page.waitForSelector('form[action*="consent.google.com"]', { timeout: 3000 }).catch(() => null);
                if (form) {
                    const acceptBtn = await page.$('button:has-text("Tümünü kabul et"), button:has-text("Accept all"), button:has-text("Alle akzeptieren"), button:has-text("Tout accepter"), button[jsname="b3VHJd"]') || await page.$('button[type="submit"]');
                    if (acceptBtn) {
                        await Promise.all([
                            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => { }),
                            acceptBtn.click()
                        ]);
                    }
                }
            } else {
                // Inline pop-ups
                let acceptBtn = await page.$('button:has-text("Tümünü kabul et"), button:has-text("Accept all"), button:has-text("Alle akzeptieren"), button[jsname="b3VHJd"]');
                if (!acceptBtn) {
                    acceptBtn = await page.$('button[aria-label*="Accept"], button[aria-label*="Kabul"]');
                }
                if (acceptBtn) {
                    await acceptBtn.click();
                    await page.waitForTimeout(2000);
                }
            }
        } catch { }

        // Load content wait before scroll mapping
        try {
            await page.waitForSelector('a[href*="/maps/place/"]', { timeout: 5000 }).catch(() => { });
        } catch (e) { }

        // --- DERİN TARAMA (SMART SCROLL) ---
        this.addLog("- Bölge derin taranıyor (sonsuz kaydırma)...")
        let lastHeight = 0
        let scrollAttempts = 0
        const maxScrolls = 25 // Maksimum 25 kaydırma (Yaklaşık 100-200 firma)

        while (scrollAttempts < maxScrolls) {
            await page.mouse.wheel(0, 5000)
            await page.waitForTimeout(2000)

            const currentHeight = await page.evaluate(() => {
                const scrollable = document.querySelector('div[role="feed"]')
                return scrollable ? scrollable.scrollHeight : document.body.scrollHeight
            })

            if (currentHeight === lastHeight) {
                // Eğer sayfa boyu değişmediyse 2 kez daha dene (yavaş yükleme durumu için)
                await page.waitForTimeout(2000)
                const retryHeight = await page.evaluate(() => {
                    const scrollable = document.querySelector('div[role="feed"]')
                    return scrollable ? scrollable.scrollHeight : document.body.scrollHeight
                })
                if (retryHeight === lastHeight) break
            }

            lastHeight = currentHeight
            scrollAttempts++
        }

        const businessDataList = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'))
            return items.map(a => {
                const container = a.closest('.Nv26el') || a.parentElement;
                const name = container?.querySelector('.qBF1Pd')?.textContent || '';
                return {
                    link: (a as HTMLAnchorElement).href,
                    name: name.trim()
                }
            }).filter(item => item.link && item.name)
        })

        // Linkleri ve isimleri tekilleştir
        const uniqueData = Array.from(new Map(businessDataList.map(item => [item.link, item])).values())

        if (uniqueData.length === 0) {
            try {
                this.addLog("! 0 firma bulundu. Hata ayıklama için public klasörüne ekran görüntüsü kaydediliyor...")
                const debugDir = path.resolve(process.cwd(), 'public')
                if (!fs.existsSync(debugDir)) { fs.mkdirSync(debugDir, { recursive: true }) }
                const debugPath = path.join(debugDir, `debug-0-firma-${this.slugify(districtName)}.png`)
                await page.screenshot({ path: debugPath, fullPage: true })
                this.addLog(`-> URL'den tarayıcı ile kontrol edebilirsiniz: /debug-0-firma-${this.slugify(districtName)}.png`)
            } catch (e) {
                this.addLog("Ekran görüntüsü alınamadı.")
            }
        } else {
            this.addLog(`${uniqueData.length} firma bulundu. Akıllı tarama başladı...`)
        }

        for (const item of uniqueData) {
            if (this.shouldStop) break

            try {
                // --- ERKEN TEŞHİS (DETAYA GİRMEDEN KONTROL) ---
                const safeName = item.name.trim()
                const safeDistrict = districtName.trim()
                const businessId = crypto.createHash('md5').update(safeName + safeDistrict).digest('hex')
                const existing = await prisma.business.findUnique({
                    where: { businessId },
                    select: { id: true }
                })
                const prefixLog = `[${new Date().toLocaleTimeString()}]`

                if (existing) {
                    this.addLog(`--- [SKIP] ${item.name} (Veritabanında mevcut)`)
                    continue
                }

                // Sadece veritabanında yoksa detaya gir
                await page.goto(item.link, { waitUntil: 'domcontentloaded', timeout: 30000 })
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

                    // Yöntem 1: Rating alanının kardeş span'ı (en güvenilir)
                    const ratingArea = document.querySelector('.F7nice');
                    if (ratingArea && ratingArea.parentElement) {
                        const siblings = Array.from(ratingArea.parentElement.children);
                        for (const sib of siblings) {
                            const t = (sib.textContent || '').trim();
                            if (t.includes('₺') && t.length < 20) {
                                priceInfo = cleanText(t);
                                break;
                            }
                        }
                    }

                    // Yöntem 2: aria-label ile arama (fallback)
                    if (priceInfo === 'N/A') {
                        const priceEl = document.querySelector('span[aria-label*="Price"], span[aria-label*="Fiyat"], span[aria-label*="price"]');
                        if (priceEl) {
                            const label = priceEl.getAttribute('aria-label') || '';
                            priceInfo = cleanText(label.includes(':') ? label.split(':').pop() : label);
                        }
                    }

                    // Yöntem 3: ₺ sembolü ile tüm span'larda ara (fallback)
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
                            const clickTarget = await page.evaluateHandle((el) => {
                                if (el.tagName === 'SPAN') return el.parentElement;
                                return el;
                            }, hBtn);

                            await (clickTarget as any).click();
                            await page.waitForTimeout(2500);
                            const retryHours = await page.evaluate(() => {
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

                        // İkinci deneme: Hala boşsa tekrar bekle ve dene
                        if (!overviewData.operatingHours || overviewData.operatingHours.length < 5) {
                            await page.waitForTimeout(2000);
                            const retry2 = await page.evaluate(() => {
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
                            if (retry2 && retry2.length > (overviewData.operatingHours?.length || 0)) {
                                overviewData.operatingHours = retry2;
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
                        await page.waitForTimeout(2000);
                    } else {
                        // Fallback: Fotoğraflar tabı yoksa hero image'ı tıkla
                        const heroImg = await page.$('button[jsaction*="pane.heroHeaderImage"], .ZKCDEc, img[src*="googleusercontent.com/p/"]');
                        if (heroImg) {
                            await heroImg.click();
                            await page.waitForTimeout(2000);
                        }
                    }

                    galleryImages = await page.evaluate(() => {
                        const urls: string[] = [];

                        // Yöntem 1: a.MIgS0d elementleri (Google Maps'in güncel galeri yapısı)
                        const galleryLinks = document.querySelectorAll('a.MIgS0d');
                        galleryLinks.forEach(el => {
                            // İç div'lerdeki background-image'ı kontrol et
                            const innerDivs = el.querySelectorAll('div[style*="background-image"]');
                            innerDivs.forEach(div => {
                                const style = (div as HTMLElement).style.backgroundImage;
                                const match = style.match(/url\(['"]?([^'"]+)['"]?\)/);
                                if (match && match[1].includes('googleusercontent.com')) {
                                    const cleanUrl = match[1].split('=')[0] + '=s1600';
                                    urls.push(cleanUrl);
                                }
                            });
                            // Ayrıca doğrudan a elementinin style'ını da kontrol et
                            const aStyle = (el as HTMLElement).style.backgroundImage;
                            if (aStyle) {
                                const match = aStyle.match(/url\(['"]?([^'"]+)['"]?\)/);
                                if (match && match[1].includes('googleusercontent.com')) {
                                    const cleanUrl = match[1].split('=')[0] + '=s1600';
                                    urls.push(cleanUrl);
                                }
                            }
                        });

                        // Yöntem 2: Klasik img tag'ları (fallback)
                        if (urls.length === 0) {
                            const imgs = document.querySelectorAll('img[src*="googleusercontent.com/p/"]');
                            imgs.forEach(img => {
                                const src = (img as HTMLImageElement).src;
                                if (src && !src.includes('cleardot.gif')) {
                                    const cleanUrl = src.split('=')[0] + '=s1600';
                                    urls.push(cleanUrl);
                                }
                            });
                        }

                        // Yöntem 3: Herhangi bir background-image (fallback)
                        if (urls.length === 0) {
                            const bgDivs = document.querySelectorAll('div[style*="background-image"]');
                            bgDivs.forEach(div => {
                                const style = (div as HTMLElement).style.backgroundImage;
                                const match = style.match(/url\(['"]?([^'"]+)['"]?\)/);
                                if (match && match[1].includes('googleusercontent.com/p/')) {
                                    const cleanUrl = match[1].split('=')[0] + '=s1600';
                                    urls.push(cleanUrl);
                                }
                            });
                        }

                        return [...new Set(urls)].slice(0, 4);
                    });
                    // Galeri'den çık (ESC ve X butonu ile garantiye al)
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(500);
                    const closeBtn = await page.$('button[aria-label*="Kapat"], button[aria-label*="Close"], button.S9kv8e');
                    if (closeBtn) await closeBtn.click();
                    await page.waitForTimeout(1000);
                } catch (e) {
                    this.addLog(`! Galeri çekimi başarısız veya atlandı`);
                }


                // *** KRİTİK: Galeri sonrası sayfa state'i bozulmuş olabilir.
                // Sayfayı orijinal business URL'sine geri yönlendir ve yeniden yükle.
                try {
                    await page.goto(item.link, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await page.waitForTimeout(2500);
                    this.addLog(`- Sayfa yeniden yüklendi (galeri sonrası temizlik)`);
                } catch (e) {
                    this.addLog(`! Sayfa yeniden yüklenemedi, yorumlar atlanabilir`);
                }
                // 2. Menü Öğelerini Çek
                let menuItems: any[] = [];
                try {
                    const menuTabClick = await page.evaluate(() => {
                        const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
                        for (const tab of tabs) {
                            const text = (tab.textContent || '').toLowerCase().trim();
                            if (text === 'menü' || text === 'menu') {
                                (tab as HTMLElement).click();
                                return { found: true };
                            }
                        }
                        return { found: false };
                    });

                    if (menuTabClick.found) {
                        await page.waitForSelector('.K4UgGe', { timeout: 5000 }).catch(() => { });
                        await page.waitForTimeout(2000);

                        menuItems = await page.evaluate(() => {
                            const items: any[] = [];
                            const buttons = document.querySelectorAll('.K4UgGe');
                            buttons.forEach(btn => {
                                const name = (btn.getAttribute('aria-label') || '').trim();
                                const img = btn.querySelector('img');
                                const imgSrc = img ? (img.src || '') : '';
                                // "Fotoğraf X/Y" gibi genel olanları atla, sadece yemek isimli olanları al
                                if (name && !name.match(/^Foto\u011fraf \d+/) && !name.match(/^Photo \d+/) && imgSrc.includes('googleusercontent.com')) {
                                    const cleanUrl = imgSrc.split('=')[0] + '=s800';
                                    items.push({ name, imageUrl: cleanUrl });
                                }
                            });
                            return items.slice(0, 10);
                        });

                        if (menuItems.length > 0) {
                            this.addLog(`- Menü: ${menuItems.length} öğe bulundu`);
                        }
                    }
                } catch (e) {
                    // Menü çekimi opsiyonel - hata olursa devam et
                }

                // Yorumlar için sayfayı "Genel Bakış"a geri döndür
                try {
                    await page.evaluate(() => {
                        const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
                        for (const tab of tabs) {
                            const text = (tab.textContent || '').toLowerCase().trim();
                            if (text.includes('genel') || text.includes('overview')) {
                                (tab as HTMLElement).click();
                                break;
                            }
                        }
                    });
                    await page.waitForTimeout(1000);
                } catch (e) { }

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
                        for (let j = 0; j < 1; j++) {
                            await page.mouse.wheel(0, 3000);
                            await page.waitForTimeout(1000);
                        }

                        // Yorum çekme fonksiyonu (tekrar kullanılabilir)
                        const extractReviews = () => page.evaluate(() => {
                            const cleanText = (text: string | null | undefined) => {
                                if (!text) return '';
                                return text.replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
                            };

                            const revs: any[] = [];
                            const seenReviews = new Set();
                            const reviewBlocks = document.querySelectorAll('div.jftiEf');

                            for (const block of Array.from(reviewBlocks)) {
                                if (revs.length >= 5) break;

                                const authorEl = block.querySelector('.d4r55, .X43Kjb, .al6Kxe, .TSUbDb, .W67Drf, .f0S8F, [class*="author"]');
                                let author = cleanText((authorEl as any)?.innerText || authorEl?.textContent);

                                if (!author) {
                                    const possibleAuthor = block.querySelector('button div[class*="font"]');
                                    if (possibleAuthor) author = cleanText((possibleAuthor as any).innerText);
                                }

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

                        // İlk deneme
                        rawReviews = await extractReviews();

                        // Eğer 0 yorum çekildiyse, Google Maps henüz yüklememiş olabilir - tekrar dene
                        if (rawReviews.length === 0) {
                            this.addLog("! İlk denemede 0 yorum, 3sn bekleyip tekrar deneniyor...");
                            await page.waitForTimeout(3000);
                            // "Daha fazla" butonlarına tekrar bas
                            try {
                                const moreBtns2 = await page.$$('button[aria-label*="Daha fazla"], button[aria-label*="Show more"], button.w8nwRe.kyuRq');
                                for (const btn of moreBtns2) {
                                    await btn.click();
                                    await page.waitForTimeout(300);
                                }
                            } catch (e) { }
                            rawReviews = await extractReviews();
                        }
                    }

                } catch (e) {
                    console.log("Review extraction skipped");
                }

                // Ana görseli galeri listesinden çıkar (tekrar olmasın)
                const mainImageBase = (overviewData.imageUrl || '').split('=')[0];
                const filteredGallery = mainImageBase
                    ? galleryImages.filter(url => url.split('=')[0] !== mainImageBase)
                    : galleryImages;

                const data = {
                    ...overviewData,
                    directionLink: item.link,
                    galleryImages: filteredGallery.slice(0, 4),
                    rawReviews,
                    menuItems
                };

                if (data && data.name) {
                    const safeName = data.name.trim()
                    const safeDistrict = districtName.trim()
                    const businessId = crypto.createHash('md5').update(safeName + safeDistrict).digest('hex')
                    const isUpdate = await this.saveToDb({ ...data, businessId, query }, categoryName, districtName)
                    this.status.processedCount++
                    const prefix = isUpdate ? '↻ [UPDATE]' : '+ [NEW]'
                    this.addLog(`${prefix} ${data.name} | R:${data.rating} | Y:${data.reviewCount} | (Çekilen: ${data.rawReviews?.length || 0}) | F:${data.priceInfo || 'N/A'}`)
                }
            } catch (err: any) {
                this.addLog(`! [Hata] Firma atlandı (${item.link}): ${err.message}`)
                continue
            }
        }
        return uniqueData.length
    }

    private async saveToDb(data: any, categoryName: string, districtName: string): Promise<boolean> {
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

            // Önce var olup olmadığını kontrol et
            const existing = await prisma.business.findUnique({
                where: { businessId: data.businessId },
                select: { id: true }
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
                    menuItems: data.menuItems || [],
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
                    menuItems: data.menuItems || [],
                    categoryId: category.id,
                    districtId: district.id,
                    query: data.query,
                    timestamp: new Date()
                }
            })

            return !!existing
        } catch (err: any) {
            console.error('DB Error:', err.message)
            this.addLog(`! [Hata] DB Kayıt Hatası: ${err.message}`)
            return false
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
