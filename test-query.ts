import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    try {
        const dailyStats = await prisma.$queryRaw`
                SELECT 
                    DATE(b.createdAt) as date, 
                    COUNT(*) as count,
                    (SELECT c.name FROM Category c 
                     JOIN Business b2 ON b2.categoryId = c.id 
                     WHERE DATE(b2.createdAt) = DATE(b.createdAt) 
                     GROUP BY b2.categoryId 
                     ORDER BY COUNT(*) DESC LIMIT 1) as topCategory,
                    (SELECT d.name FROM District d 
                     JOIN Business b3 ON b3.districtId = d.id 
                     WHERE DATE(b3.createdAt) = DATE(b.createdAt) 
                     GROUP BY b3.districtId 
                     ORDER BY COUNT(*) DESC LIMIT 1) as topDistrict
                FROM Business b
                WHERE b.createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                GROUP BY DATE(b.createdAt)
                ORDER BY date DESC
            `
        console.log('Success:', dailyStats)
    } catch (err) {
        console.error('Error:', err)
    } finally {
        await prisma.$disconnect()
    }
}

main()
