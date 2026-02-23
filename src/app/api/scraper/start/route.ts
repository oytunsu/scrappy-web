import { NextResponse } from 'next/server'
import { scraperEngine } from '@/lib/scraper-engine'

export async function POST() {
    const status = scraperEngine.getStatus()

    if (status.isRunning) {
        return NextResponse.json({ message: 'Scraper zaten çalışıyor.' }, { status: 400 })
    }

    // Arka planda başlat (wait etmiyoruz çünkü uzun sürüyor)
    scraperEngine.start()

    return NextResponse.json({ message: 'Scraper başlatıldı.' })
}
