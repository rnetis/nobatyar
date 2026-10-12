import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBusinessSession } from '@/lib/auth'
import { buildTemplateVars, queueNotification, type NotificationType } from '@/lib/sms'

const RESENDABLE_TYPES: NotificationType[] = ['BOOKING_CREATED', 'QUEUE_CHANGED', 'RESCHEDULED', 'CANCELLED', 'YOUR_TURN', 'CALLED', 'NO_SHOW']

export async function GET(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const url = new URL(req.url)
  const take = Math.min(100, Number(url.searchParams.get('take') || 50))
  const notifications = await db.notification.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: 'desc' },
    take,
    include: { appointment: { select: { code: true } } },
  })
  return NextResponse.json({ notifications })
}

/** Resend a single notification (re-sends via the same channel). */
export async function POST(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { id, type } = body as { id?: string; type?: string }
  if (!id) return NextResponse.json({ error: 'شناسه پیامک الزامی است' }, { status: 400 })
  const existing = await db.notification.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== session.tenantId) return NextResponse.json({ error: 'پیامک یافت نشد' }, { status: 404 })

  const resendType = (RESENDABLE_TYPES.includes(type as NotificationType) ? type : existing.type) as NotificationType
  if (!RESENDABLE_TYPES.includes(resendType)) {
    return NextResponse.json({ error: 'این پیامک قابل ارسال مجدد نیست' }, { status: 400 })
  }

  // Build vars from the linked appointment when available; generic fallback otherwise
  let varsUse = buildTemplateVars({
    customerName: 'مشتری گرامی',
    businessName: 'کسب‌وکار',
    appointmentCode: 'نوبت',
    scheduledAt: existing.createdAt,
  })
  if (existing.appointmentId) {
    const appt = await db.appointment.findUnique({
      where: { id: existing.appointmentId },
      include: { customer: true, service: true, branch: true, tenant: true },
    })
    if (appt) {
      varsUse = buildTemplateVars({
        customerName: appt.customer.name,
        businessName: appt.tenant.name,
        branchName: appt.branch.name,
        serviceName: appt.service.name,
        appointmentCode: appt.code,
        scheduledAt: appt.scheduledAt,
        liveToken: appt.liveToken,
        queue: null,
      })
    }
  }
  await queueNotification({
    tenantId: session.tenantId,
    appointmentId: existing.appointmentId || undefined,
    type: resendType,
    recipient: existing.recipient,
    vars: varsUse,
    material: true,
  })
  return NextResponse.json({ ok: true, message: 'پیامک دوباره ارسال شد.', notificationId: id })
}

/** Mark a notification acknowledged (soft readAt flag; delivery status untouched). */
export async function PATCH(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { id, action } = body as { id?: string; action?: string }
  if (!id) return NextResponse.json({ error: 'شناسه پیامک الزامی است' }, { status: 400 })
  const existing = await db.notification.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== session.tenantId) return NextResponse.json({ error: 'پیامک یافت نشد' }, { status: 404 })
  if (action === 'ack') {
    await db.notification.update({
      where: { id },
      data: { readAt: existing.readAt || new Date() },
    })
    await db.auditLog.create({
      data: { tenantId: session.tenantId, actor: session.name, role: session.role, action: 'NOTIFICATION_ACK', entityType: 'Notification', entityId: id, detail: JSON.stringify({ notificationId: id, recipient: existing.recipient }) },
    })
    return NextResponse.json({ ok: true, acknowledged: true })
  }
  return NextResponse.json({ error: 'دستور نامعتبر' }, { status: 400 })
}
