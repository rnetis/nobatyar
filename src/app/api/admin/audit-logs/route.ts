import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminSession } from '@/lib/auth'

/** Platform audit log (PRD §58 AC-008) */
export async function GET(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const url = new URL(req.url)
  const take = Math.min(300, Number(url.searchParams.get('take') || 120))
  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    include: { tenant: { select: { name: true } } },
  })
  return NextResponse.json({ logs })
}
