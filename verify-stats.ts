
import { prisma } from './src/lib/prisma';

async function verifyStats() {
    try {
        const total = await prisma.business.count();
        const categories = await prisma.category.findMany({
            include: {
                _count: {
                    select: { businesses: true }
                }
            }
        });

        const sumByCategory = categories.reduce((sum, cat) => sum + cat._count.businesses, 0);

        console.log(`Total Businesses (Direct Count): ${total}`);
        console.log(`Sum of Businesses in Categories: ${sumByCategory}`);

        const last7Days: any[] = await prisma.$queryRaw`
            SELECT DATE(createdAt) as date, COUNT(*) as count
            FROM Business
            GROUP BY DATE(createdAt)
            ORDER BY date DESC
            LIMIT 7
        `;

        console.log('\n--- Daily Counts (createdAt) ---');
        last7Days.forEach(d => console.log(`${d.date.toISOString().split('T')[0]}: ${d.count}`));

        const todayUpdates = await prisma.business.count({
            where: {
                updatedAt: {
                    gte: new Date(new Date().setHours(0, 0, 0, 0))
                }
            }
        });

        const todayCreates = await prisma.business.count({
            where: {
                createdAt: {
                    gte: new Date(new Date().setHours(0, 0, 0, 0))
                }
            }
        });

        console.log(`\n--- Today Statistics ---`);
        console.log(`Newly Added (createdAt): ${todayCreates}`);
        console.log(`Last Updated (updatedAt): ${todayUpdates}`);

        const countsByDistrict = await prisma.district.findMany({
            include: {
                _count: {
                    select: { businesses: true }
                }
            },
            take: 5,
            orderBy: {
                businesses: {
                    _count: 'desc'
                }
            }
        });

        console.log('\n--- Top Districts ---');
        countsByDistrict.forEach(d => console.log(`${d.name}: ${d._count.businesses}`));

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

verifyStats();
