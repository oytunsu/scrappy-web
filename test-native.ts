import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
dotenv.config()

async function main() {
    console.log('Testing NATIVE connection with URL:', process.env.DATABASE_URL)

    // Try passing the URL directly in the constructor for Prisma 7
    const prisma = new PrismaClient()

    try {
        const count = await prisma.business.count()
        console.log('Success! Count:', count)
    } catch (e) {
        console.error('Native connection failed:', e)
    } finally {
        await prisma.$disconnect()
    }
}

main()
