import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const [totalBusinesses, todayCount, districtCount, categories, dailyStats] = await Promise.all([
            prisma.business.count(),
            prisma.business.count({
                where: {
                    updatedAt: {
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
            }),
            // Günlük istatistikler için Raw SQL (MariaDB uyumlu - ONLY_FULL_GROUP_BY fix)
            prisma.$queryRaw`
                SELECT 
                    date, 
                    count,
                    (SELECT c.name FROM Category c 
                     JOIN Business b2 ON b2.categoryId = c.id 
                     WHERE DATE(b2.createdAt) = date 
                     GROUP BY b2.categoryId 
                     ORDER BY COUNT(*) DESC LIMIT 1) as topCategory,
                    (SELECT d.name FROM District d 
                     JOIN Business b3 ON b3.districtId = d.id 
                     WHERE DATE(b3.createdAt) = date 
                     GROUP BY b3.districtId 
                     ORDER BY COUNT(*) DESC LIMIT 1) as topDistrict
                FROM (
                    SELECT DATE(createdAt) as date, COUNT(*) as count
                    FROM Business
                    WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                    GROUP BY DATE(createdAt)
                ) as daily_counts
                ORDER BY date DESC
            `
        ])

        return NextResponse.json({
            totalBusinesses,
            todayCount,
            districtCount,
            categories: categories.map((cat: any) => ({
                name: cat.name,
                count: cat._count.businesses,
                percent: totalBusinesses > 0 ? (cat._count.businesses / totalBusinesses) * 100 : 0
            })),
            dailyStats: (dailyStats as any[]).map(stat => ({
                date: stat.date,
                count: Number(stat.count),
                topCategory: stat.topCategory || 'N/A',
                topDistrict: stat.topDistrict || 'N/A'
            }))
        })
    } catch (error: any) {
        console.error('API Error:', error)
        return NextResponse.json({ error: 'Database connection failed' }, { status: 500 })
    }
}
