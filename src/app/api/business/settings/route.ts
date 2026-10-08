import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBusinessSession } from '@/lib/auth'

/** Tenant notification & cancellation settings (PRD §17, §21) */
export async function GET() {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const tenant = await db.tenant.findUnique({
    where: { id: session.tenantId },
    include: { plan: true },
  })
  if (!tenant) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  return NextResponse.json({
    tenant: {
      id: tenant.id, name: tenant.name, slug: tenant.slug, category: tenant.category,
      phone: tenant.phone, address: tenant.address, queuePrefix: tenant.queuePrefix,
      reasonRequired: tenant.reasonRequired, smsProvider: tenant.smsProvider,
      plan: tenant.plan ? { name: tenant.plan.name, maxBookings: tenant.plan.maxBookings, maxStaff: tenant.plan.maxStaff, maxBranches: tenant.plan.maxBranches, smsQuota: tenant.plan.smsQuota } : null,
    },
    notifPolicy: JSON.parse(tenant.notifPolicy || '{}'),
    cancelPolicy: JSON.parse(tenant.cancelPolicy || '{}'),
  })
}

export async function PATCH(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { notifPolicy, cancelPolicy, reasonRequired } = body as {
    notifPolicy?: Record<string, unknown>; cancelPolicy?: Record<string, unknown>; reasonRequired?: boolean
  }
  const tenant = await db.tenant.findUnique({ where: { id: session.tenantId } })
  if (!tenant) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const updated = await db.tenant.update({
    where: { id: session.tenantId },
    data: {
      ...(notifPolicy ? { notifPolicy: JSON.stringify({ ...JSON.parse(tenant.notifPolicy || '{}'), ...notifPolicy }) } : {}),
      ...(cancelPolicy ? { cancelPolicy: JSON.stringify({ ...JSON.parse(tenant.cancelPolicy || '{}'), ...cancelPolicy }) } : {}),
      ...(reasonRequired !== undefined ? { reasonRequired: !!reasonRequired } : {}),
    },
  })
  await db.auditLog.create({
    data: { tenantId: session.tenantId, actor: session.name, role: session.role, action: 'SETTINGS_UPDATE', entityType: 'Tenant', entityId: session.tenantId },
  })
  return NextResponse.json({
    notifPolicy: JSON.parse(updated.notifPolicy || '{}'),
    cancelPolicy: JSON.parse(updated.cancelPolicy || '{}'),
    reasonRequired: updated.reasonRequired,
  })
}
