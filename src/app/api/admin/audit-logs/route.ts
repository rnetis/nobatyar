import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminSession, requireSuperAdminSession } from '@/lib/auth'

/** Platform audit log (PRD §58 AC-008) */
export async function GET(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const url = new URL(req.url)
  const take = Math.min(300, Number(url.searchParams.get('take') || 120))
  const id = url.searchParams.get('id')
  if (id) {
    const log = await db.auditLog.findUnique({ where: { id } })
    if (!log) return NextResponse.json({ error: 'رخداد یافت نشد' }, { status: 404 })
    return NextResponse.json({ log })
  }
  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    include: { tenant: { select: { name: true } } },
  })
  return NextResponse.json({ logs })
}

export async function DELETE(req: Request) {
  const session = await requireSuperAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'شناسه رخداد الزامی است' }, { status: 400 })
  const log = await db.auditLog.findUnique({ where: { id } })
  if (!log) return NextResponse.json({ error: 'رخداد یافت نشد' }, { status: 404 })
  await db.auditLog.update({
    where: { id },
    data: { deleted: true, deletedAt: new Date(), deletedBy: session.name },
  })
  await db.auditLog.create({
    data: {
      actor: session.name,
      role: session.role,
      action: 'AUDIT_DELETE',
      entityType: 'AuditLog',
      entityId: id,
      detail: JSON.stringify({ deletedLogId: id, deletedAction: log.action }),
    },
  })
  return NextResponse.json({ ok: true, deleted: true })
}
