import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBusinessSession } from '@/lib/auth'

/** Tenant audit log (PRD §15 rules, §58 AC-008) */
export async function GET(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const url = new URL(req.url)
  const take = Math.min(200, Number(url.searchParams.get('take') || 80))
  const logs = await db.auditLog.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: 'desc' },
    take,
  })
  return NextResponse.json({ logs })
}
