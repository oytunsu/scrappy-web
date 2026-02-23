import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

export async function proxy(request: NextRequest) {
    const token = request.cookies.get('auth_token')?.value
    const { pathname } = request.nextUrl
    const jwtSecret = process.env.JWT_SECRET

    // Safety check for JWT_SECRET
    if (!jwtSecret) {
        console.error('CRITICAL: JWT_SECRET is not defined!')
        return NextResponse.next() // Or handle as error
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
         * Match all request paths except for the ones starting with:
         * - api (API routes except auth)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
    ],
}
