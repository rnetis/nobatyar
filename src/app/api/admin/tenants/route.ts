import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminSession, setSessionCookie } from '@/lib/auth'

/** Tenant management (PRD §26 — create, suspend, activate, change plan, impersonate) */
export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const tenants = await db.tenant.findMany({
    include: {
      plan: { select: { id: true, name: true, priceMonthly: true } },
      _count: { select: { users: true, branches: true, services: true, appointments: true, customers: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ tenants })
}

export async function POST(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { name, category, planId, ownerName, ownerEmail } = body as {
    name?: string; category?: string; planId?: string; ownerName?: string; ownerEmail?: string
  }
  if (!name) return NextResponse.json({ error: 'نام مرکز الزامی است' }, { status: 400 })
  const slug = `t-${crypto.randomUUID().slice(0, 8)}`
  let createdOwnerPassword: string | undefined
  const tenant = await db.tenant.create({
    data: {
      name,
      slug,
      category: category || 'خدمات',
      logoText: name.slice(0, 1),
      planId: planId || null,
    },
  })
  if (ownerEmail) {
    // Generate a strong one-time initial password; it is returned ONCE in this
    // response so the platform admin can hand it to the business owner.
    const initialPassword = crypto.randomUUID().slice(0, 8) + crypto.randomUUID().slice(0, 8) + 'Aa1!'
    const { hashPassword } = await import('@/lib/auth')
    await db.user.create({
      data: {
        tenantId: tenant.id,
        name: ownerName || 'مدیر مرکز',
        email: ownerEmail.toLowerCase(),
        passwordHash: hashPassword(initialPassword),
        role: 'TENANT_OWNER',
      },
    })
    createdOwnerPassword = initialPassword
  }
  await db.auditLog.create({
    data: { actor: session.name, role: session.role, action: 'TENANT_CREATE', entityType: 'Tenant', entityId: tenant.id, detail: JSON.stringify({ name, slug }) },
  })
  return NextResponse.json({ tenant, initialPassword: createdOwnerPassword })
}

export async function PATCH(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { id, action, planId } = body as { id?: string; action?: string; planId?: string }
  if (!id || !action) return NextResponse.json({ error: 'پارامترهای ناقص' }, { status: 400 })
  const tenant = await db.tenant.findUnique({ where: { id } })
  if (!tenant) return NextResponse.json({ error: 'مستأجر یافت نشد' }, { status: 404 })

  switch (action) {
    case 'suspend': {
      await db.tenant.update({ where: { id }, data: { status: 'SUSPENDED' } })
      await db.auditLog.create({ data: { actor: session.name, role: session.role, action: 'TENANT_SUSPEND', entityType: 'Tenant', entityId: id } })
      break
    }
    case 'activate': {
      await db.tenant.update({ where: { id }, data: { status: 'ACTIVE' } })
      await db.auditLog.create({ data: { actor: session.name, role: session.role, action: 'TENANT_ACTIVATE', entityType: 'Tenant', entityId: id } })
      break
    }
    case 'change_plan': {
      await db.tenant.update({ where: { id }, data: { planId: planId || null } })
      await db.auditLog.create({ data: { actor: session.name, role: session.role, action: 'PLAN_CHANGE', entityType: 'Tenant', entityId: id, detail: JSON.stringify({ planId }) } })
      break
    }
    case 'impersonate': {
      // PRD §26: limited, audited, visible
      const owner = await db.user.findFirst({
        where: { tenantId: id, role: { in: ['TENANT_OWNER', 'TENANT_ADMIN'] }, status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
      })
      if (!owner) return NextResponse.json({ error: 'کاربر مدیری برای این مرکز یافت نشد' }, { status: 404 })
      await db.auditLog.create({
        data: { tenantId: id, actor: session.name, role: session.role, action: 'TENANT_IMPERSONATE', entityType: 'Tenant', entityId: id, detail: JSON.stringify({ as: owner.email }) },
      })
      await setSessionCookie({
        userId: owner.id,
        name: owner.name,
        role: owner.role,
        tenantId: owner.tenantId,
        impersonating: true,
      })
      return NextResponse.json({ ok: true, redirect: '#/panel' })
    }
    default:
      return NextResponse.json({ error: 'عملیات نامعتبر' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
