import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
    try {
        const districts = await prisma.district.findMany({
            include: {
                _count: {
                    select: { businesses: true }
                },
                city: true
            },
            orderBy: {
                name: 'asc'
            }
        })

        const categories = await prisma.category.findMany({
            include: {
                _count: {
                    select: { businesses: true }
                }
            },
            orderBy: {
                name: 'asc'
            }
        })

        return NextResponse.json({
            districts: districts.map((d: any) => ({
                id: d.id,
                name: d.name,
                city: d.city.name,
                count: d._count.businesses
            })),
            categories: categories.map((c: any) => ({
                id: c.id,
                name: c.name,
                count: c._count.businesses
            }))
        })
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch filter data' }, { status: 500 })
    }
}
