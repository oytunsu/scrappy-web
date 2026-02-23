import { NextResponse } from 'next/server'
import { scraperEngine } from '@/lib/scraper-engine'

export async function GET() {
    const status = scraperEngine.getStatus()
    return NextResponse.json(status)
}
