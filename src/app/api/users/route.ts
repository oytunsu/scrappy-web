import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'

export async function GET() {
    try {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                username: true,
                createdAt: true
            }
        })
        return NextResponse.json(users)
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { username, password } = body

        if (!username || !password) {
            return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
        }

        const hashedPassword = await bcrypt.hash(password, 10)

        const user = await prisma.user.create({
            data: { username, password: hashedPassword },
            select: { id: true, username: true, createdAt: true }
        })

        return NextResponse.json(user)
    } catch (error: any) {
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'Username already exists' }, { status: 400 })
        }
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }
}
