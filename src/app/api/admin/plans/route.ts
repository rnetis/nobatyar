import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminSession, requireSuperAdminSession } from '@/lib/auth'

const FEATURES = ['multi_branch', 'sms', 'api', 'reports', 'priority_queue', 'custom_branding', 'webhooks', 'advanced_analytics']

/** Plan & feature-flag management (PRD §27, §28) — full CRUD */
export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const plans = await db.plan.findMany({
    include: { _count: { select: { tenants: true } } },
    orderBy: { sortOrder: 'asc' },
  })
  return NextResponse.json({ plans, features: FEATURES })
}

export async function POST(req: Request) {
  const session = await requireSuperAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { name, tagline, priceMonthly, maxBranches, maxStaff, maxBookings, smsQuota, features, isPopular } = body as Record<string, unknown>
  if (!name || typeof name !== 'string') return NextResponse.json({ error: 'نام پلن الزامی است' }, { status: 400 })
  const existing = await db.plan.findFirst({ where: { slug: name.toLowerCase().replace(/\s+/g, '-').slice(0, 64) } })
  if (existing) return NextResponse.json({ error: 'پلنی با این نام قبلاً ساخته شده' }, { status: 409 })
  const plan = await db.plan.create({
    data: {
      name: String(name),
      slug: name.toLowerCase().replace(/\s+/g, '-').slice(0, 64),
      tagline: (tagline !== undefined && typeof tagline === 'string') ? String(tagline) : null,
      priceMonthly: Number(priceMonthly) || 0,
      maxBranches: Math.max(1, Number(maxBranches) || 1),
      maxStaff: Math.max(1, Number(maxStaff) || 1),
      maxBookings: Math.max(1, Number(maxBookings) || 100),
      smsQuota: Math.max(0, Number(smsQuota) || 0),
      features: JSON.stringify(features || []),
      isPopular: !!isPopular,
      sortOrder: 0,
    },
  })
  await db.auditLog.create({
    data: { actor: session.name, role: session.role, action: 'PLAN_CREATE', entityType: 'Plan', entityId: plan.id, detail: JSON.stringify({ name: plan.name }) },
  })
  return NextResponse.json({ plan })
}

export async function PATCH(req: Request) {
  const session = await requireSuperAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { id, name, tagline, priceMonthly, maxBranches, maxStaff, maxBookings, smsQuota, features, isPopular, sortOrder } = body as Record<string, unknown>
  if (!id) return NextResponse.json({ error: 'شناسه پلن الزامی است' }, { status: 400 })
  const plan = await db.plan.findUnique({ where: { id: id as string } })
  if (!plan) return NextResponse.json({ error: 'پلن یافت نشد' }, { status: 404 })
  const updated = await db.plan.update({
    where: { id: id as string },
    data: {
      ...(name !== undefined ? { name: String(name) } : {}),
      ...(tagline !== undefined ? { tagline: String(tagline) } : {}),
      ...(priceMonthly !== undefined ? { priceMonthly: Number(priceMonthly) } : {}),
      ...(maxBranches !== undefined ? { maxBranches: Math.max(1, Number(maxBranches)) } : {}),
      ...(maxStaff !== undefined ? { maxStaff: Math.max(1, Number(maxStaff)) } : {}),
      ...(maxBookings !== undefined ? { maxBookings: Math.max(1, Number(maxBookings)) } : {}),
      ...(smsQuota !== undefined ? { smsQuota: Math.max(0, Number(smsQuota)) } : {}),
      ...(features !== undefined ? { features: JSON.stringify(features) } : {}),
      ...(isPopular !== undefined ? { isPopular: Boolean(isPopular) } : {}),
      ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) } : {}),
    },
  })
  await db.auditLog.create({
    data: { actor: session.name, role: session.role, action: 'PLAN_UPDATE', entityType: 'Plan', entityId: updated.id },
  })
  return NextResponse.json({ plan: updated })
}

export async function DELETE(req: Request) {
  const session = await requireSuperAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'شناسه پلن الزامی است' }, { status: 400 })
  const plan = await db.plan.findUnique({ where: { id } })
  if (!plan) return NextResponse.json({ error: 'پلن یافت نشد' }, { status: 404 })
  const withTenants = await db.tenant.count({ where: { planId: id } })
  if (withTenants > 0) {
    // soft-delete: mark plan inactive but keep in DB for historical reporting
    await db.plan.update({ where: { id }, data: { name: `${plan.name} (غیرفعال)`, slug: `${plan.slug}-inactive` } })
    await db.auditLog.create({
      data: { actor: session.name, role: session.role, action: 'PLAN_DELETE', entityType: 'Plan', entityId: id, detail: JSON.stringify({ name: plan.name, tenants: withTenants }) },
    })
    return NextResponse.json({ ok: true, softDeleted: true, message: 'پلن غیرفعال شد (مستأجرهای قبلی دسترسی خود را حفظ می‌کنند).' })
  }
  await db.plan.delete({ where: { id } })
  await db.auditLog.create({
    data: { actor: session.name, role: session.role, action: 'PLAN_DELETE', entityType: 'Plan', entityId: id, detail: JSON.stringify({ name: plan.name }) },
  })
  return NextResponse.json({ ok: true, softDeleted: false })
}
