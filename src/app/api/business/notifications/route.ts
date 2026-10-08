import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBusinessSession } from '@/lib/auth'

/** SMS/notification outbox log (PRD §19) */
export async function GET(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const url = new URL(req.url)
  const take = Math.min(100, Number(url.searchParams.get('take') || 50))
  const notifications = await db.notification.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: 'desc' },
    take,
    include: { appointment: { select: { code: true } } },
  })
  return NextResponse.json({ notifications })
}
