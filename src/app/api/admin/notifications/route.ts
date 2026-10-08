import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminSession } from '@/lib/auth'

/** Platform SMS log (all tenants) */
export async function GET(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const url = new URL(req.url)
  const take = Math.min(200, Number(url.searchParams.get('take') || 100))
  const notifications = await db.notification.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    include: { tenant: { select: { name: true } }, appointment: { select: { code: true } } },
  })
  return NextResponse.json({ notifications })
}
