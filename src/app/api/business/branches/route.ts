import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBusinessSession } from '@/lib/auth'

export async function GET() {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const branches = await db.branch.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { services: true, staff: true, queues: true } } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ branches })
}

export async function POST(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { name, address, phone, hours, status } = body as Record<string, unknown>
  if (!name || typeof name !== 'string') return NextResponse.json({ error: 'نام شعبه الزامی است' }, { status: 400 })
  const existing = await db.branch.count({ where: { tenantId: session.tenantId, name } })
  if (existing > 0) return NextResponse.json({ error: 'شعبه‌ای با این نام قبلاً ساخته شده' }, { status: 409 })
  const branch = await db.branch.create({
    data: {
      tenantId: session.tenantId,
      name: String(name),
      address: (address !== undefined && typeof address === 'string') ? String(address) : null,
      phone: (phone !== undefined && typeof phone === 'string') ? String(phone) : null,
      hours: (hours !== undefined && typeof hours === 'string') ? String(hours) : '{}',
      status: ['ACTIVE', 'INACTIVE'].includes(String(status)) ? String(status) : 'ACTIVE',
    },
  })
  await db.auditLog.create({
    data: { tenantId: session.tenantId, actor: session.name, role: session.role, action: 'BRANCH_CREATE', entityType: 'Branch', entityId: branch.id, detail: JSON.stringify({ name: branch.name }) },
  })
  return NextResponse.json({ branch })
}

export async function PATCH(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { id, name, address, phone, hours, status } = body as Record<string, unknown>
  if (!id) return NextResponse.json({ error: 'شناسه شعبه الزامی است' }, { status: 400 })
  const existing = await db.branch.findUnique({ where: { id: id as string } })
  if (!existing || existing.tenantId !== session.tenantId) return NextResponse.json({ error: 'شعبه یافت نشد' }, { status: 404 })
  const updated = await db.branch.update({
    where: { id: id as string },
    data: {
      ...(name !== undefined ? { name: String(name) } : {}),
      ...(address !== undefined ? { address: String(address) } : {}),
      ...(phone !== undefined ? { phone: String(phone) } : {}),
      ...(hours !== undefined && typeof hours === 'string' ? { hours: String(hours) } : {}),
      ...(status !== undefined ? { status: ['ACTIVE', 'INACTIVE'].includes(String(status)) ? String(status) : existing.status } : {}),
    },
  })
  await db.auditLog.create({
    data: { tenantId: session.tenantId, actor: session.name, role: session.role, action: 'BRANCH_UPDATE', entityType: 'Branch', entityId: updated.id },
  })
  return NextResponse.json({ branch: updated })
}

export async function DELETE(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'شناسه شعبه الزامی است' }, { status: 400 })
  const existing = await db.branch.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== session.tenantId) return NextResponse.json({ error: 'شعبه یافت نشد' }, { status: 404 })
  const [services, staff, appointments] = await Promise.all([
    db.service.count({ where: { branchId: id } }),
    db.staff.count({ where: { branchId: id } }),
    db.appointment.count({ where: { branchId: id } }),
  ])
  if (services > 0 || staff > 0 || appointments > 0) {
    await db.branch.update({ where: { id }, data: { status: 'INACTIVE' } })
    await db.auditLog.create({
      data: { tenantId: session.tenantId, actor: session.name, role: session.role, action: 'BRANCH_DELETE', entityType: 'Branch', entityId: id, detail: JSON.stringify({ name: existing.name, services, staff, appointments, note: 'شعبه غیرفعال شد' }) },
    })
    return NextResponse.json({ ok: true, softDeleted: true, message: 'شعبه غیرفعال شد (شعبه دارای خدمت/کارمند/نوبت است).' })
  }
  await db.branch.delete({ where: { id } })
  await db.auditLog.create({
    data: { tenantId: session.tenantId, actor: session.name, role: session.role, action: 'BRANCH_DELETE', entityType: 'Branch', entityId: id, detail: JSON.stringify({ name: existing.name }) },
  })
  return NextResponse.json({ ok: true, softDeleted: false })
}
