import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
    try {
        const [totalBusinesses, todayCount, districtCount, categories] = await Promise.all([
            prisma.business.count(),
            prisma.business.count({
                where: {
                    createdAt: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0))
                    }
                }
            }),
            prisma.district.count(),
            prisma.category.findMany({
                include: {
                    _count: {
                        select: { businesses: true }
                    }
                },
                take: 10,
                orderBy: {
                    businesses: {
                        _count: 'desc'
                    }
                }
            })
        ])

        return NextResponse.json({
            totalBusinesses,
            todayCount,
            districtCount,
            categories: categories.map((cat: any) => ({
                name: cat.name,
                count: cat._count.businesses,
                percent: totalBusinesses > 0 ? (cat._count.businesses / totalBusinesses) * 100 : 0
            }))
        })
    } catch (error) {
        console.error('API Error:', error)
        return NextResponse.json({ error: 'Database connection failed' }, { status: 500 })
    }
}
