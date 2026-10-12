import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSuperAdminSession, setSessionCookie } from '@/lib/auth'
import type { SmsProviderId } from '@/lib/sms'

/** Tenant management (PRD §26 — full CRUD: list, create, update, delete, undelete, impersonate) */
export async function GET(req: Request) {
  const session = await requireSuperAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (id) {
    const tenant = await db.tenant.findUnique({
      where: { id },
      include: {
        plan: { select: { id: true, name: true, priceMonthly: true } },
        _count: { select: { users: true, branches: true, services: true, appointments: true, customers: true } },
      },
    })
    if (!tenant) return NextResponse.json({ error: 'مستأجر یافت نشد' }, { status: 404 })
    return NextResponse.json({ tenant })
  }
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
  const session = await requireSuperAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { name, category, planId, ownerName, ownerEmail, ownerMobile, smsConfig, id, notificationTemplates } = body as {
    name?: string; category?: string; planId?: string; ownerName?: string; ownerEmail?: string; ownerMobile?: string
    smsConfig?: Record<string, unknown>; id?: string; notificationTemplates?: Record<string, string>
  }

  // SMS config path: update existing tenant's provider + templates
  if (id && (smsConfig !== undefined || notificationTemplates !== undefined)) {
    const tenant = await db.tenant.findUnique({ where: { id } })
    if (!tenant) return NextResponse.json({ error: 'مستأجر یافت نشد' }, { status: 404 })
    const data: Record<string, unknown> = {}
    if (smsConfig !== undefined) {
      const normalized = sanitizeSmsConfig(smsConfig)
      data.smsConfig = JSON.stringify(normalized)
    }
    if (notificationTemplates !== undefined) {
      data.notificationTemplates = JSON.stringify(normalizeTemplates(notificationTemplates))
    }
    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'هیچ پارامتری الزامی نیست' }, { status: 400 })
    const updated = await db.tenant.update({ where: { id }, data })
    await db.auditLog.create({
      data: { actor: session.name, role: session.role, action: 'TENANT_SMS_CONFIG', entityType: 'Tenant', entityId: id, detail: JSON.stringify({ smsConfig: !!smsConfig, notificationTemplates: !!notificationTemplates }) },
    })
    return NextResponse.json({ tenant: pickTenant(updated) })
  }

  // Create path: new tenant (optionally with initial SMS config)
  if (!name) return NextResponse.json({ error: 'نام مرکز الزامی است' }, { status: 400 })
  const slug = `t-${crypto.randomUUID().slice(0, 8)}`
  const tenant = await db.tenant.create({
    data: {
      name: String(name),
      slug,
      category: (category || 'خدمات'),
      logoText: (name || 'M').slice(0, 1),
      planId: planId || null,
      smsConfig: smsConfig ? JSON.stringify(sanitizeSmsConfig(smsConfig)) : '{}',
    },
  })
  let createdOwnerPassword: string | undefined
  if (ownerEmail) {
    const normalizedOwnerEmail = ownerEmail.toLowerCase()
    const existingOwner = await db.user.findUnique({ where: { email: normalizedOwnerEmail } })
    if (existingOwner) return NextResponse.json({ error: 'کاربری با این ایمیل قبلاً ثبت شده است' }, { status: 409 })
    const { hashPassword } = await import('@/lib/auth')
    const initialPassword = crypto.randomUUID().slice(0, 8) + crypto.randomUUID().slice(0, 8) + 'Aa1!'
    await db.user.create({
      data: {
        tenantId: tenant.id,
        name: (ownerName || 'مدیر مرکز').trim(),
        email: normalizedOwnerEmail,
        mobile: (ownerMobile || '').trim() || null,
        passwordHash: hashPassword(initialPassword),
        role: 'TENANT_OWNER',
      },
    })
    createdOwnerPassword = initialPassword
  }
  await db.auditLog.create({
    data: { actor: session.name, role: session.role, action: 'TENANT_CREATE', entityType: 'Tenant', entityId: tenant.id, detail: JSON.stringify({ name: tenant.name, slug }) },
  })
  return NextResponse.json({ tenant, initialPassword: createdOwnerPassword })
}

function sanitizeSmsConfig(cfg: Record<string, unknown>): { provider: SmsProviderId; config: Record<string, unknown> } {
  const provider = (cfg.provider as string) || 'disabled'
  if (!['sms.ir', 'httpsms', 'disabled'].includes(provider)) {
    throw new Error('ارائه‌دهنده پیامک نامعتبر است')
  }
  const config: Record<string, unknown> = {}
  const raw = (cfg.config ?? {}) as Record<string, unknown>
  if (provider === 'sms.ir') {
    if (raw.apiKey) config.apiKey = String(raw.apiKey)
    if (raw.lineNumber) config.lineNumber = String(raw.lineNumber)
  } else if (provider === 'httpsms') {
    if (raw.apiKey) config.apiKey = String(raw.apiKey)
    if (raw.from) config.from = String(raw.from)
  }
  return { provider: provider as SmsProviderId, config }
}

function normalizeTemplates(tpl: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tpl).filter(([, v]) => typeof v === 'string' && v.trim().length > 0),
  )
}

function pickTenant(t: { id: string; name: string; slug: string; smsProvider: string; smsConfig: string; notificationTemplates: string }) {
  return t
}

/** PATCH tenant fields (update/suspend/activate/change_plan/impersonate/delete/undelete/purge). */
export async function PATCH(req: Request) {
  const session = await requireSuperAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { id, action, planId, name, category, phone, address, queuePrefix, reasonRequired, notifPolicy, cancelPolicy, smsProvider, smsConfig, notificationTemplates } = body as Record<string, unknown>
  if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'پارامترهای ناقص' }, { status: 400 })
  if (typeof action !== 'string' || !action) return NextResponse.json({ error: 'پارامترهای ناقص' }, { status: 400 })
  const tenant = await db.tenant.findUnique({ where: { id } })
  if (!tenant) return NextResponse.json({ error: 'مستأجر یافت نشد' }, { status: 404 })

  if (action === 'update') {
    const parsePolicy = (raw: string | null | undefined): Record<string, unknown> => {
      try { return JSON.parse(raw || '{}') as Record<string, unknown> } catch { return {} }
    }
    const updated = await db.tenant.update({
      where: { id: id as string },
      data: {
        ...(name !== undefined ? { name: String(name) } : {}),
        ...(category !== undefined ? { category: String(category) } : {}),
        ...(phone !== undefined ? { phone: String(phone) } : {}),
        ...(address !== undefined ? { address: String(address) } : {}),
        ...(queuePrefix !== undefined ? { queuePrefix: String(queuePrefix).slice(0, 4) || 'A' } : {}),
        ...(reasonRequired !== undefined ? { reasonRequired: Boolean(reasonRequired) } : {}),
        ...(smsProvider !== undefined ? { smsProvider: String(smsProvider) } : {}),
      ...(smsConfig !== undefined ? { smsConfig: JSON.stringify(smsConfig) } : {}),
      ...(notificationTemplates !== undefined ? { notificationTemplates: JSON.stringify(notificationTemplates) } : {}),
        ...(notifPolicy !== undefined ? { notifPolicy: JSON.stringify({ ...parsePolicy(tenant.notifPolicy), ...(notifPolicy as Record<string, unknown>) }) } : {}),
        ...(cancelPolicy !== undefined ? { cancelPolicy: JSON.stringify({ ...parsePolicy(tenant.cancelPolicy), ...(cancelPolicy as Record<string, unknown>) }) } : {}),
      },
    })
    await db.auditLog.create({
      data: { actor: session.name, role: session.role, action: 'TENANT_UPDATE', entityType: 'Tenant', entityId: id, detail: JSON.stringify({ id: id as string }) },
    })
    return NextResponse.json({ tenant: updated })
  }

  if (action === 'suspend') {
    await db.tenant.update({ where: { id: id as string }, data: { status: 'SUSPENDED' } })
    await db.auditLog.create({ data: { actor: session.name, role: session.role, action: 'TENANT_SUSPEND', entityType: 'Tenant', entityId: id } })
    return NextResponse.json({ ok: true })
  }

  if (action === 'activate') {
    await db.tenant.update({ where: { id: id as string }, data: { status: 'ACTIVE' } })
    await db.auditLog.create({ data: { actor: session.name, role: session.role, action: 'TENANT_ACTIVATE', entityType: 'Tenant', entityId: id } })
    return NextResponse.json({ ok: true })
  }

  if (action === 'change_plan') {
    await db.tenant.update({ where: { id: id as string }, data: { planId: (planId as string) || null } })
    await db.auditLog.create({ data: { actor: session.name, role: session.role, action: 'PLAN_CHANGE', entityType: 'Tenant', entityId: id, detail: JSON.stringify({ planId }) } })
    return NextResponse.json({ ok: true })
  }

  if (action === 'impersonate') {
    const asOwnerId = typeof (body as { impersonateAs?: unknown }).impersonateAs === 'string'
      ? (body as { impersonateAs: string }).impersonateAs
      : undefined
    let owner: Awaited<ReturnType<typeof db.user.findFirst>> = null
    if (asOwnerId) {
      owner = await db.user.findFirst({ where: { id: asOwnerId, tenantId: id as string, role: { in: ['TENANT_OWNER', 'TENANT_ADMIN'] }, status: 'ACTIVE' } })
    }
    if (!owner) {
      owner = await db.user.findFirst({ where: { tenantId: id as string, role: { in: ['TENANT_OWNER', 'TENANT_ADMIN'] }, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } })
    }
    if (!owner) return NextResponse.json({ error: 'کاربر مدیری برای این مرکز یافت نشد' }, { status: 404 })
    await db.auditLog.create({
      data: { tenantId: id as string, actor: session.name, role: session.role, action: 'TENANT_IMPERSONATE', entityType: 'Tenant', entityId: id as string, detail: JSON.stringify({ as: owner.email, impersonatedById: session.userId, asId: owner.id }) },
    })
    await setSessionCookie({ userId: owner.id, name: owner.name, role: owner.role, tenantId: owner.tenantId, impersonating: true })
    return NextResponse.json({ ok: true, redirect: '#/panel' })
  }

  if (action === 'delete') {
    // soft-delete: suspend + rename so it's visually flagged; audit trail keeps the original
    await db.tenant.update({ where: { id: id as string }, data: { status: 'SUSPENDED', name: `[حذف‌شده] ${tenant.name}` } })
    await db.auditLog.create({
      data: { actor: session.name, role: session.role, action: 'TENANT_DELETE', entityType: 'Tenant', entityId: id, detail: JSON.stringify({ name: tenant.name, reason: (body as { reason?: string })?.reason || null }) },
    })
    return NextResponse.json({ ok: true, message: 'مستأجر تعلیق شد (حذف نرم). برای پاک‌سازی نهایی داده‌ها، لیست کاربران/شعب/خدمت‌ها را مدیریت کنید.' })
  }

  if (action === 'undelete') {
    // resurrect a previously soft-deleted tenant by re-activating
    if (tenant.status !== 'SUSPENDED') return NextResponse.json({ error: 'این مستأجر قبلاً حذف نشده است' }, { status: 400 })
    const restoredName = (typeof name === 'string' && name.trim()) || tenant.name.replace(/^\[حذف‌شده\]\s*/, '') || tenant.name
    await db.tenant.update({ where: { id: id as string }, data: { status: 'ACTIVE', name: restoredName } })
    await db.auditLog.create({ data: { actor: session.name, role: session.role, action: 'TENANT_UNDELETE', entityType: 'Tenant', entityId: id, detail: JSON.stringify({ name: tenant.name }) } })
    return NextResponse.json({ ok: true, message: 'مستأجر بازسازی شد.' })
  }

  if (action === 'purge') {
    // Hard delete: purge the whole tenant subtree, children-first (FKs enforced).
    await db.queueEntry.deleteMany({ where: { queue: { tenantId: id } } })
    await db.queue.deleteMany({ where: { tenantId: id } })
    await db.notification.deleteMany({ where: { tenantId: id } })
    await db.appointment.deleteMany({ where: { tenantId: id } })
    await db.customer.deleteMany({ where: { tenantId: id } })
    await db.staff.deleteMany({ where: { tenantId: id } })
    await db.service.deleteMany({ where: { tenantId: id } })
    await db.branch.deleteMany({ where: { tenantId: id } })
    await db.user.deleteMany({ where: { tenantId: id } })
    await db.auditLog.create({
      data: { actor: session.name, role: session.role, action: 'TENANT_PURGE', entityType: 'Tenant', entityId: id, detail: JSON.stringify({ name: tenant.name, slug: tenant.slug }) },
    })
    await db.tenant.delete({ where: { id } })
    return NextResponse.json({ ok: true, message: 'مستأجر و تمام داده‌های آن به‌طور کامل حذف شد.' })
  }

  return NextResponse.json({ error: 'عملیات نامعتبر' }, { status: 400 })
}
