import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBusinessSession } from '@/lib/auth'
import { createWalkIn } from '@/lib/queue-engine'
import { staffCanServe } from '@/lib/availability'
import { checkBookingLimit } from '@/lib/plan-limits'
import { normalizeMobile } from '@/lib/phone'

/** Walk-in booking — operator registers an in-person customer (PRD §24) */
export async function POST(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { name, branchId, serviceId, staffId, priority } = body as {
    name?: string; branchId?: string; serviceId?: string; staffId?: string | null; priority?: string
  }
  const mobile = normalizeMobile((body as { mobile?: unknown }).mobile)
  if (!name?.trim() || !mobile || !branchId || !serviceId) {
    return NextResponse.json({ error: 'اطلاعات ناقص یا نامعتبر' }, { status: 400 })
  }

  // tenant scoping
  const branch = await db.branch.findUnique({ where: { id: branchId } })
  const service = await db.service.findUnique({ where: { id: serviceId } })
  if (!branch || branch.tenantId !== session.tenantId || !service || service.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'شعبه یا خدمت یافت نشد' }, { status: 404 })
  }
  if (branch.status !== 'ACTIVE' || service.status !== 'ACTIVE' || (service.branchId && service.branchId !== branch.id)) {
    return NextResponse.json({ error: 'این خدمت در این شعبه فعال نیست' }, { status: 400 })
  }
  if (staffId && !(await staffCanServe(db, { staffId, tenantId: session.tenantId, branchId, serviceId }))) {
    return NextResponse.json({ error: 'کارمند انتخاب‌شده این خدمت را ارائه نمی‌دهد' }, { status: 400 })
  }
  const limit = await checkBookingLimit(session.tenantId)
  if (limit) return NextResponse.json({ error: limit }, { status: 403 })

  const result = await createWalkIn({
    tenantId: session.tenantId,
    branchId,
    serviceId,
    staffId: staffId || null,
    customerName: name.trim().slice(0, 80),
    mobile,
    priority,
    actor: session.name,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
