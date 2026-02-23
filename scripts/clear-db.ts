import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    await prisma.business.deleteMany()
    console.log('All businesses cleared.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
