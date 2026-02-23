import { PrismaClient } from '@prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

// Next.js hot-reload singleton
const globalForPrisma = global as unknown as {
    prisma: PrismaClient | undefined
}

const DATABASE_URL = process.env.DATABASE_URL || 'mariadb://root@127.0.0.1:3306/scrapper_dev'

// Prisma ve Adapter kurulumunu SADECE BİR KEZ yap
if (!globalForPrisma.prisma) {
    // Adapter'ı burada oluşturuyoruz ki sadece bir kez çalışsın
    // Prisma MariaDB adapter, bağlantı dizesini doğrudan kabul eder ve kendi havuzunu yönetir
    const adapter = new PrismaMariaDb(DATABASE_URL)

    globalForPrisma.prisma = new PrismaClient({
        adapter,
        log: ['error', 'warn'],
    })
}

export const prisma = globalForPrisma.prisma!

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
}
