import { PrismaClient } from '@prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'

dotenv.config()

const DATABASE_URL = process.env.DATABASE_URL || 'mariadb://user@127.0.0.1:3306/db'

async function main() {
    const adapter = new PrismaMariaDb(DATABASE_URL)
    const prisma = new PrismaClient({ adapter })

    const username = process.env.ADMIN_USERNAME || 'admin'
    const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!'

    console.log(`Creating admin user: ${username}...`)

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.upsert({
        where: { username },
        update: {
            password: hashedPassword
        },
        create: {
            username,
            password: hashedPassword
        }
    })

    console.log('Admin user created/updated successfully!')
    console.log('User ID:', user.id)

    await prisma.$disconnect()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
