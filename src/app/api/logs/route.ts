import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
    try {
        const logs = await prisma.scrapeLog.findMany({
            take: 100,
            orderBy: { createdAt: 'desc' },
            include: {
                job: {
                    include: {
                        category: true,
                        district: true
                    }
                }
            }
        })

        const serializedLogs = logs.map(log => ({
            ...log,
            id: log.id.toString(),
            jobId: log.jobId.toString()
        }))

        return NextResponse.json(serializedLogs)
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
    }
}
