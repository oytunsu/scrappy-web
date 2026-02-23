export const config = {
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001',
    isDev: process.env.NODE_ENV === 'development',
}
