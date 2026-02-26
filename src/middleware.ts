import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

export async function middleware(request: NextRequest) {
    const token = request.cookies.get('auth_token')?.value
    const { pathname } = request.nextUrl
    const jwtSecret = process.env.JWT_SECRET

    // Safety check for JWT_SECRET
    if (!jwtSecret) {
        console.error('CRITICAL: JWT_SECRET is not defined in environment variables!')
        // If it's an API request, return unauthorized JSON, otherwise redirect to a safe page or continue with alert
        if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth')) {
            return NextResponse.json({ error: 'Internal Configuration Error' }, { status: 500 })
        }
        return NextResponse.next()
    }

    const secret = new TextEncoder().encode(jwtSecret)

    // Login sayfası ve API'lar hariç koruma
    if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
        if (token) {
            try {
                await jwtVerify(token, secret)
                return NextResponse.redirect(new URL('/', request.url))
            } catch (e) {
                // Token invalid, continue to login
            }
        }
        return NextResponse.next()
    }

    // Dashboard koruması
    if (!token) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    try {
        await jwtVerify(token, secret)
        return NextResponse.next()
    } catch (e) {
        return NextResponse.redirect(new URL('/login', request.url))
    }
}

export const config = {
    matcher: [
        /*
         * Korunacak yollar:
         * - Root (Dashboard)
         * - Tüm API yolları (/api/auth hariç)
         * - Tüm dashboard alt sayfaları
         */
        '/',
        '/api/:path*',
        '/((?!api|auth|_next/static|_next/image|favicon.ico).*)',
    ],
}
