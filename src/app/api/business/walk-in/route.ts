import { NextResponse } from 'next/server'
import { requireBusinessSession } from '@/lib/auth'
import { createWalkIn } from '@/lib/queue-engine'

/** Walk-in booking — operator registers an in-person customer (PRD §24) */
export async function POST(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { name, mobile, branchId, serviceId, priority } = body as {
    name?: string; mobile?: string; branchId?: string; serviceId?: string; priority?: string
  }
  if (!name?.trim() || !mobile || !/^09\d{9}$/.test(mobile) || !branchId || !serviceId) {
    return NextResponse.json({ error: 'اطلاعات ناقص یا نامعتبر' }, { status: 400 })
  }

  // tenant scoping
  const { db } = await import('@/lib/db')
  const branch = await db.branch.findUnique({ where: { id: branchId } })
  const service = await db.service.findUnique({ where: { id: serviceId } })
  if (!branch || branch.tenantId !== session.tenantId || !service || service.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'شعبه یا خدمت یافت نشد' }, { status: 404 })
  }

  const result = await createWalkIn({
    tenantId: session.tenantId,
    branchId,
    serviceId,
    customerName: name.trim(),
    mobile,
    priority,
    actor: session.name,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
