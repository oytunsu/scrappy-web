import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const search = searchParams.get('search') || ''
    const skip = (page - 1) * limit

    try {
        const where = search ? {
            OR: [
                { businessName: { contains: search } },
                { phone: { contains: search } },
                { businessId: { contains: search } }
            ]
        } : {}

        const [items, total] = await Promise.all([
            prisma.business.findMany({
                where,
                take: limit,
                skip,
                orderBy: { timestamp: 'desc' },
                include: {
                    category: true,
                    district: true
                }
            }),
            prisma.business.count({ where })
        ])

        // Convert BigInt to Number for JSON serialization
        const serializedItems = items.map(item => ({
            ...item,
            id: item.id.toString(),
            rating: item.rating ? Number(item.rating) : null
        }))

        return NextResponse.json({
            items: serializedItems,
            total,
            pages: Math.ceil(total / limit)
        })
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch businesses' }, { status: 500 })
    }
}
