import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'

export async function POST(request: Request) {
    try {
        const { username, password } = await request.json()

        if (!username || !password) {
            return NextResponse.json({ error: 'Kullanıcı adı ve şifre gereklidir' }, { status: 400 })
        }

        const user = await prisma.user.findUnique({
            where: { username }
        })

        if (!user) {
            return NextResponse.json({ error: 'Geçersiz credentials' }, { status: 401 })
        }

        const passwordMatch = await bcrypt.compare(password, user.password)

        if (!passwordMatch) {
            return NextResponse.json({ error: 'Geçersiz credentials' }, { status: 401 })
        }

        // Create JWT
        const jwtSecret = process.env.JWT_SECRET
        if (!jwtSecret) {
            console.error('CRITICAL: JWT_SECRET is not defined in environment variables!')
            return NextResponse.json({ error: 'Sistem yapılandırma hatası' }, { status: 500 })
        }

        const secret = new TextEncoder().encode(jwtSecret)
        const token = await new SignJWT({ userId: user.id, username: user.username })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('24h')
            .sign(secret)

        const response = NextResponse.json({ success: true, user: { username: user.username } })

        // Set cookie
        response.cookies.set('auth_token', token, {
            httpOnly: true,
            secure: false, // IP üzerinden HTTP ile erişildiği için false olmalı
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 // 1 day
        })

        return response
    } catch (error) {
        console.error('Login error:', error)
        return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
    }
}
