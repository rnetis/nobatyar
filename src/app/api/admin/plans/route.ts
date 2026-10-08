import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminSession } from '@/lib/auth'

const FEATURES = ['multi_branch', 'sms', 'api', 'reports', 'priority_queue', 'custom_branding', 'webhooks', 'advanced_analytics']

/** Plan & feature-flag management (PRD §27, §28) */
export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const plans = await db.plan.findMany({
    include: { _count: { select: { tenants: true } } },
    orderBy: { sortOrder: 'asc' },
  })
  return NextResponse.json({ plans, features: FEATURES })
}

export async function PATCH(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { id, name, tagline, priceMonthly, maxBranches, maxStaff, maxBookings, smsQuota, features } = body as Record<string, unknown>
  if (!id) return NextResponse.json({ error: 'شناسه الزامی است' }, { status: 400 })
  const plan = await db.plan.update({
    where: { id: id as string },
    data: {
      ...(name !== undefined ? { name: String(name) } : {}),
      ...(tagline !== undefined ? { tagline: String(tagline) } : {}),
      ...(priceMonthly !== undefined ? { priceMonthly: Number(priceMonthly) } : {}),
      ...(maxBranches !== undefined ? { maxBranches: Number(maxBranches) } : {}),
      ...(maxStaff !== undefined ? { maxStaff: Number(maxStaff) } : {}),
      ...(maxBookings !== undefined ? { maxBookings: Number(maxBookings) } : {}),
      ...(smsQuota !== undefined ? { smsQuota: Number(smsQuota) } : {}),
      ...(features !== undefined ? { features: JSON.stringify(features) } : {}),
    },
  })
  await db.auditLog.create({
    data: { actor: session.name, role: session.role, action: 'PLAN_UPDATE', entityType: 'Plan', entityId: plan.id },
  })
  return NextResponse.json({ plan })
}
