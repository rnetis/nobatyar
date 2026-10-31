import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBusinessSession, requireManagerSession } from '@/lib/auth'

export async function GET(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const take = Math.min(200, Number(url.searchParams.get('take') || 80))
  if (id) {
    const log = await db.auditLog.findUnique({ where: { id } })
    if (!log || log.tenantId !== session.tenantId) return NextResponse.json({ error: 'رخداد یافت نشد' }, { status: 404 })
    return NextResponse.json({ log })
  }
  const logs = await db.auditLog.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: 'desc' },
    take,
  })
  return NextResponse.json({ logs })
}

export async function DELETE(req: Request) {
  const session = await requireManagerSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'شناسه رخداد الزامی است' }, { status: 400 })
  const log = await db.auditLog.findUnique({ where: { id } })
  if (!log || log.tenantId !== session.tenantId) return NextResponse.json({ error: 'رخداد یافت نشد' }, { status: 404 })
  await db.auditLog.update({
    where: { id },
    data: { deleted: true, deletedAt: new Date(), deletedBy: session.name },
  })
  await db.auditLog.create({
    data: {
      tenantId: session.tenantId,
      actor: session.name,
      role: session.role,
      action: 'AUDIT_HIDE',
      entityType: 'AuditLog',
      entityId: id,
      detail: JSON.stringify({ hiddenLogId: id, hiddenAction: log.action, hiddenEntityId: log.entityId }),
    },
  })
  return NextResponse.json({ ok: true, hidden: true })
}
