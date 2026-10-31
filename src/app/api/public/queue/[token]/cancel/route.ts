import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cancelAppointment } from '@/lib/queue-engine'
import { rateLimit, clientIp } from '@/lib/rate-limit'

/**
 * Customer self-cancel from the live-queue page (possession of the secret token is the credential).
 * Enforces the tenant's cancelPolicy {allowCustomerCancel, minMinutesBefore, sendCancelSms}, which was
 * configurable in the settings UI but never applied anywhere.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = rateLimit(`cancel:${clientIp(req)}`, 10, 10 * 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'تعداد درخواست‌ها زیاد است' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })

  const { token } = await params
  if (!/^[a-f0-9]{16,64}$/i.test(token)) return NextResponse.json({ error: 'لینک نامعتبر است' }, { status: 400 })

  const appt = await db.appointment.findUnique({ where: { liveToken: token }, include: { tenant: true } })
  if (!appt) return NextResponse.json({ error: 'نوبتی با این لینک یافت نشد' }, { status: 404 })

  let policy: { allowCustomerCancel?: boolean; minMinutesBefore?: number } = {}
  try { policy = JSON.parse(appt.tenant.cancelPolicy || '{}') } catch { /* defaults */ }
  if (policy.allowCustomerCancel === false) {
    return NextResponse.json({ error: 'لغو نوبت توسط مشتری برای این مرکز فعال نیست؛ لطفاً تماس بگیرید' }, { status: 403 })
  }
  if (!['PENDING', 'CONFIRMED', 'WAITING'].includes(appt.status)) {
    return NextResponse.json({ error: 'این نوبت دیگر قابل لغو نیست' }, { status: 409 })
  }
  // lead-time rule applies to pre-booked slots only; a walk-in who is already here may always leave
  const minMinutes = Number.isFinite(policy.minMinutesBefore) ? Number(policy.minMinutesBefore) : 120
  if (appt.source === 'ONLINE' && appt.scheduledAt.getTime() - Date.now() < minMinutes * 60_000) {
    return NextResponse.json({ error: `لغو نوبت حداقل ${minMinutes} دقیقه قبل از زمان نوبت امکان‌پذیر است` }, { status: 409 })
  }

  const r = await cancelAppointment({ appointmentId: appt.id, actor: 'مشتری', bypassReason: true })
  if (!r.ok) return NextResponse.json({ error: r.error || 'خطا در لغو نوبت' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
