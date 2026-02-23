import { NextResponse } from 'next/server'
import { scraperEngine } from '@/lib/scraper-engine'

export async function POST() {
    await scraperEngine.stop()
    return NextResponse.json({ message: 'Scraper durdurma komutu gönderildi.' })
}
