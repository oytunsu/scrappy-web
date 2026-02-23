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
        if (this.status.isRunning) return

        this.status.isRunning = true
        this.shouldStop = false
        this.status.startTime = new Date()
        this.status.processedCount = 0
        this.status.logs = []

        this.addLog('Motor Başlatıldı. Tam veri seti çekiliyor...')

        try {
            this.browser = await chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            })

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

                const data = await page.evaluate(() => {
                    const cleanText = (text: string | null | undefined) => {
                        if (!text) return '';
                        return text
                            .replace(/[\n\r\t]+/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();
                    };

                    const getElementText = (selector: string) => {
                        const el = document.querySelector(selector);
                        return el ? cleanText((el as any).innerText || (el as any).textContent) : '';
                    };

                    // 1. Name
                    const name = cleanText(document.querySelector('h1')?.textContent) || '';

                    // 2. Rating
                    const ratingText = document.querySelector('div.F7nice span[aria-hidden="true"]')?.textContent || '0';
                    const rating = parseFloat(ratingText.replace(',', '.')) || 0;

                    // 3. Review Count
                    const reviewEl = document.querySelector('div.F7nice span[aria-label*="review"], div.F7nice span[aria-label*="yorum"]');
                    let reviewCount = 0;
                    if (reviewEl) {
                        const label = reviewEl.getAttribute('aria-label') || '';
                        const match = label.replace(/\./g, '').replace(/,/g, '').match(/(\d+)/);
                        if (match) reviewCount = parseInt(match[1]);
                    }

                    // 4. Address
                    const address = getElementText('button[data-item-id="address"]');

                    // 5. Phone
                    const phone = getElementText('button[data-item-id*="phone"]');

                    // 6. Website
                    const website = document.querySelector('a[data-item-id="authority"]')?.getAttribute('href') || '';

                    // 7. Price Info
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

                    // 8. Operating Hours
                    let operatingHours = 'N/A';
                    const hoursEl = document.querySelector('div[data-item-id*="oh"], [aria-label*="Saatler"], [aria-label*="Hours"]');
                    if (hoursEl) {
                        operatingHours = cleanText((hoursEl as any).innerText || hoursEl.getAttribute('aria-label') || hoursEl.textContent);
                    }

                    // 9. Reported Count
                    const bodyText = document.body.innerText;
                    const reportedMatch = bodyText.match(/(\d+)\s+(?:kullanıcı bildirdi|users reported)/i);
                    const priceReportedCount = reportedMatch ? parseInt(reportedMatch[1]) : 0;

                    return {
                        name,
                        rating,
                        reviewCount,
                        address,
                        phone,
                        website,
                        directionLink: window.location.href,
                        priceInfo,
                        priceReportedCount,
                        operatingHours,
                        imageUrl: document.querySelector('button[data-value="Photo"] img, div[role="region"] img')?.getAttribute('src') || ''
                    }
                })

                if (data && data.name) {
                    const businessId = crypto.createHash('md5').update(data.name + districtName).digest('hex')
                    await this.saveToDb({ ...data, businessId, query }, categoryName, districtName)
                    this.status.processedCount++
                    this.addLog(`+ [DB] ${data.name} | R:${data.rating} | Y:${data.reviewCount} | F:${data.priceInfo}`)
                }
            } catch (err) {
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
                    website: data.website,
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
                    website: data.website,
                    categoryId: category.id,
                    districtId: district.id,
                    query: data.query,
                    timestamp: new Date()
                }
            })
        } catch (err: any) {
            console.error('DB Error:', err.message)
        }
    }
}

export const scraperEngine = ScraperEngine.getInstance()
