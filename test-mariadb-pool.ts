import { PrismaClient } from '@prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import mariadb from 'mariadb'
import dotenv from 'dotenv'
dotenv.config()

async function main() {
    const url = new URL(process.env.DATABASE_URL!)
    console.log('Connecting to:', url.hostname)

    const pool = mariadb.createPool({
        host: url.hostname,
        port: parseInt(url.port || '3306'),
        user: url.username,
        password: url.password,
        database: url.pathname.substring(1),
        connectionLimit: 1
    })

    const adapter = new PrismaMariaDb(pool)
    const prisma = new PrismaClient({ adapter })

    try {
        const count = await prisma.business.count()
        console.log('Success! Count:', count)
    } catch (e) {
        console.error('Failed:', e)
    } finally {
        await prisma.$disconnect()
        await pool.end()
    }
}

main()
