import { PrismaClient } from '@prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

// Next.js hot-reload singleton
const globalForPrisma = global as unknown as {
    prisma: PrismaClient | undefined
}

const DATABASE_URL = process.env.DATABASE_URL || 'mysql://user:pass@localhost:3306/db'

const maskedUrl = DATABASE_URL.replace(/:.+@/, ':****@')
console.log(`[Prisma] Connecting to: ${maskedUrl}`)

// Prisma ve Adapter kurulumunu SADECE BİR KEZ yap
if (!globalForPrisma.prisma) {
    try {
        const adapter = new PrismaMariaDb(DATABASE_URL)
        globalForPrisma.prisma = new PrismaClient({
            adapter,
            log: ['error', 'warn'],
        })
        console.log('[Prisma] Client initialized successfully')
    } catch (err: any) {
        console.error('[Prisma] Initialization error:', err.message)
    }
}

export const prisma = globalForPrisma.prisma!

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
}
