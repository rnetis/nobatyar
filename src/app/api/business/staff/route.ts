import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBusinessSession, requireManagerSession } from '@/lib/auth'
import { checkStaffLimit } from '@/lib/plan-limits'

/** Staff CRUD (PRD §24 Staff Management) */
export async function GET() {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const staff = await db.staff.findMany({
    where: { tenantId: session.tenantId },
    include: { branch: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ staff })
}

export async function POST(req: Request) {
  const session = await requireManagerSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { name, title, branchId, serviceIds } = body as { name?: string; title?: string; branchId?: string; serviceIds?: string[] }
  if (!name) return NextResponse.json({ error: 'نام الزامی است' }, { status: 400 })
  const limitError = await checkStaffLimit(session.tenantId)
  if (limitError) return NextResponse.json({ error: limitError }, { status: 403 })
  const scopeError = await validateStaffScope(session.tenantId, branchId, serviceIds)
  if (scopeError) return NextResponse.json({ error: scopeError }, { status: 400 })
  const member = await db.staff.create({
    data: {
      tenantId: session.tenantId,
      branchId: branchId || null,
      name,
      title: title || null,
      serviceIds: JSON.stringify(serviceIds || []),
    },
  })
  await db.auditLog.create({
    data: { tenantId: session.tenantId, actor: session.name, role: session.role, action: 'STAFF_CREATE', entityType: 'Staff', entityId: member.id },
  })
  return NextResponse.json({ staff: member })
}

export async function PATCH(req: Request) {
  const session = await requireManagerSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { id, name, title, branchId, serviceIds, status } = body as { id?: string; name?: string; title?: string; branchId?: string | null; serviceIds?: string[]; status?: string }
  if (!id) return NextResponse.json({ error: 'شناسه الزامی است' }, { status: 400 })
  const existing = await db.staff.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'کارمند یافت نشد' }, { status: 404 })
  }
  const scopeError = await validateStaffScope(session.tenantId, branchId || undefined, serviceIds)
  if (scopeError) return NextResponse.json({ error: scopeError }, { status: 400 })
  if (status === 'ACTIVE' && existing.status !== 'ACTIVE') {
    const limitError = await checkStaffLimit(session.tenantId)
    if (limitError) return NextResponse.json({ error: limitError }, { status: 403 })
  }
  const member = await db.staff.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: String(name) } : {}),
      ...(title !== undefined ? { title: String(title) } : {}),
      ...(branchId !== undefined ? { branchId: branchId || null } : {}),
      ...(serviceIds !== undefined ? { serviceIds: JSON.stringify(serviceIds) } : {}),
      ...(status !== undefined ? { status: String(status) } : {}),
    },
  })
  return NextResponse.json({ staff: member })
}

export async function DELETE(req: Request) {
  const session = await requireManagerSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'شناسه الزامی است' }, { status: 400 })
  const existing = await db.staff.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'کارمند یافت نشد' }, { status: 404 })
  }
  await db.staff.update({ where: { id }, data: { status: 'INACTIVE' } })
  return NextResponse.json({ ok: true })
}

/** branch and services referenced by a staff member must belong to the same tenant (no cross-tenant links) */
async function validateStaffScope(tenantId: string, branchId?: string | null, serviceIds?: string[]): Promise<string | null> {
  if (branchId) {
    const b = await db.branch.findUnique({ where: { id: branchId } })
    if (!b || b.tenantId !== tenantId) return 'شعبه یافت نشد'
  }
  if (serviceIds !== undefined) {
    if (!Array.isArray(serviceIds) || serviceIds.some((x) => typeof x !== 'string')) return 'فهرست خدمات نامعتبر است'
    if (serviceIds.length) {
      const n = await db.service.count({ where: { id: { in: serviceIds }, tenantId } })
      if (n !== new Set(serviceIds).size) return 'خدمت نامعتبر است'
    }
  }
  return null
}
