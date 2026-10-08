import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBusinessSession } from '@/lib/auth'

/** Services CRUD (PRD §24 Service Management) */
export async function GET() {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const services = await db.service.findMany({
    where: { tenantId: session.tenantId },
    include: { branch: { select: { id: true, name: true } }, _count: { select: { appointments: true } } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ services })
}

export async function POST(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { name, description, duration, price, capacity, branchId } = body as Record<string, unknown>
  if (!name || typeof name !== 'string') return NextResponse.json({ error: 'نام خدمت الزامی است' }, { status: 400 })
  const service = await db.service.create({
    data: {
      tenantId: session.tenantId,
      branchId: (branchId as string) || null,
      name,
      description: (description as string) || null,
      duration: Number(duration) || 30,
      price: Number(price) || 0,
      capacity: Math.max(1, Number(capacity) || 1),
    },
  })
  await db.auditLog.create({
    data: { tenantId: session.tenantId, actor: session.name, role: session.role, action: 'SERVICE_CREATE', entityType: 'Service', entityId: service.id, detail: JSON.stringify({ name }) },
  })
  return NextResponse.json({ service })
}

export async function PATCH(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { id, name, description, duration, price, capacity, branchId, status } = body as Record<string, unknown>
  if (!id) return NextResponse.json({ error: 'شناسه الزامی است' }, { status: 400 })
  const existing = await db.service.findUnique({ where: { id: id as string } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'خدمت یافت نشد' }, { status: 404 })
  }
  const service = await db.service.update({
    where: { id: id as string },
    data: {
      ...(name !== undefined ? { name: String(name) } : {}),
      ...(description !== undefined ? { description: String(description) } : {}),
      ...(duration !== undefined ? { duration: Number(duration) } : {}),
      ...(price !== undefined ? { price: Number(price) } : {}),
      ...(capacity !== undefined ? { capacity: Math.max(1, Number(capacity)) } : {}),
      ...(branchId !== undefined ? { branchId: (branchId as string) || null } : {}),
      ...(status !== undefined ? { status: String(status) } : {}),
    },
  })
  await db.auditLog.create({
    data: { tenantId: session.tenantId, actor: session.name, role: session.role, action: 'SERVICE_UPDATE', entityType: 'Service', entityId: service.id },
  })
  return NextResponse.json({ service })
}

export async function DELETE(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'شناسه الزامی است' }, { status: 400 })
  const existing = await db.service.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'خدمت یافت نشد' }, { status: 404 })
  }
  const apptCount = await db.appointment.count({ where: { serviceId: id } })
  if (apptCount > 0) {
    await db.service.update({ where: { id }, data: { status: 'INACTIVE' } })
    return NextResponse.json({ ok: true, archived: true, message: 'خدمت دارای نوبت ثبت‌شده است؛ غیرفعال شد.' })
  }
  await db.service.delete({ where: { id } })
  return NextResponse.json({ ok: true, archived: false })
}
