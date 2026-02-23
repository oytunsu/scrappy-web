import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST() {
    try {
        // Silme sırası: FK kısıtlamalarına takılmamak için en alt tablodan yukarıya doğru
        // 1. Logları sil
        await prisma.scrapeLog.deleteMany({})

        // 2. Business (işletme) kayıtlarını sil
        await prisma.business.deleteMany({})

        // 3. ScrapeJob kayıtlarını sil
        await prisma.scrapeJob.deleteMany({})

        // 4. District (ilçe) kayıtlarını sil
        await prisma.district.deleteMany({})

        // 5. City (il) kayıtlarını sil
        await prisma.city.deleteMany({})

        // 6. Category (kategori) kayıtlarını sil
        await prisma.category.deleteMany({})

        return NextResponse.json({
            success: true,
            message: 'Veritabanı (User tablosu hariç) başarıyla temizlendi.'
        })
    } catch (error: any) {
        console.error('DB Clear Error:', error)
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 })
    }
}
