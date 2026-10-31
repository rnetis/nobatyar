import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isSlotAvailable, parseGregorianKey, staffCanServe } from '@/lib/availability'
import { enqueueAppointment, broadcastQueueState } from '@/lib/queue-engine'
import { queueNotification, buildTemplateVars } from '@/lib/sms'
import { generateUniqueCode } from '@/lib/booking-code'
import { checkBookingLimit } from '@/lib/plan-limits'
import { normalizeMobile } from '@/lib/phone'
import { rateLimit, clientIp } from '@/lib/rate-limit'

class BookingError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

/**
 * Create booking without login (PRD §7, AC-001, AC-007)
 * POST { tenantSlug, branchId, serviceId, staffId?, date, time, name, mobile, note?, idempotencyKey? }
 *
 * Slot re-check, customer upsert, code allocation, appointment insert and queue entry all happen in
 * ONE transaction (serialised by SQLite), so two simultaneous requests can no longer both pass the
 * availability check and double-book the same slot.
 */
export async function POST(req: Request) {
  const ip = clientIp(req)
  const rl = rateLimit(`book:${ip}`, 12, 10 * 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'درخواست نامعتبر' }, { status: 400 })
  }

  const { tenantSlug, branchId, serviceId, staffId, date, time, name, note, idempotencyKey } = body as {
    tenantSlug?: string; branchId?: string; serviceId?: string; staffId?: string | null
    date?: string; time?: string; name?: string; note?: string; idempotencyKey?: string
  }
  const cleanName = typeof name === 'string' ? name.trim().slice(0, 80) : ''
  const mobile = normalizeMobile(body.mobile)

  if (!tenantSlug || !branchId || !serviceId || !date || !time || !cleanName) {
    return NextResponse.json({ error: 'تمام فیلدهای الزامی را تکمیل کنید' }, { status: 400 })
  }
  if (!mobile) {
    return NextResponse.json({ error: 'شماره موبایل معتبر نیست (مثال: 09123456789)' }, { status: 400 })
  }
  if (!parseGregorianKey(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return NextResponse.json({ error: 'تاریخ یا ساعت نامعتبر است' }, { status: 400 })
  }
  if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || idempotencyKey.length > 100)) {
    return NextResponse.json({ error: 'درخواست نامعتبر' }, { status: 400 })
  }
  const cleanNote = typeof note === 'string' ? note.trim().slice(0, 500) || null : null

  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } })
  if (!tenant || tenant.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'این مرکز در حال حاضر پذیرش نوبت نیست' }, { status: 404 })
  }

  const [hh, mm] = time.split(':').map(Number)
  const [y, m, d] = date.split('-').map(Number)
  const scheduledAt = new Date(y, m - 1, d, hh, mm, 0)

  try {
    const result = await db.$transaction(
      async (tx) => {
        // Idempotency (PRD §57) — checked inside the tx so concurrent retries can't both insert.
        // Scoped to this tenant: a key from another tenant must never reveal its appointment.
        if (idempotencyKey) {
          const existing = await tx.appointment.findUnique({
            where: { idempotencyKey },
            include: { service: true, branch: true },
          })
          if (existing && existing.tenantId === tenant.id) return { appt: existing, duplicated: true as const }
          if (existing) throw new BookingError('کلید درخواست نامعتبر است', 400)
        }

        const service = await tx.service.findUnique({ where: { id: serviceId } })
        const branch = await tx.branch.findUnique({ where: { id: branchId } })
        if (!service || !branch || service.tenantId !== tenant.id || branch.tenantId !== tenant.id) {
          throw new BookingError('خدمت یا شعبه نامعتبر است', 400)
        }
        if (staffId && !(await staffCanServe(tx, { staffId, tenantId: tenant.id, branchId, serviceId }))) {
          throw new BookingError('کارمند انتخاب‌شده این خدمت را در این شعبه ارائه نمی‌دهد', 400)
        }

        const limitError = await checkBookingLimit(tenant.id, tx)
        if (limitError) throw new BookingError(limitError, 403)

        if (!(await isSlotAvailable({ branchId, serviceId, staffId: staffId || null, date, time }, tx))) {
          throw new BookingError('این زمان به‌تازگی رزرو شد یا در دسترس نیست. لطفاً زمان دیگری انتخاب کنید.', 409)
        }

        // The customer record is keyed by mobile with no verification, so a booking must not
        // overwrite the stored name of an existing customer (anyone could rename someone else).
        const customer = await tx.customer.upsert({
          where: { tenantId_mobile: { tenantId: tenant.id, mobile } },
          update: {},
          create: { tenantId: tenant.id, name: cleanName, mobile },
        })

        const code = await generateUniqueCode(tx, tenant.queuePrefix)
        const appt = await tx.appointment.create({
          data: {
            tenantId: tenant.id, branchId, serviceId, staffId: staffId || null, customerId: customer.id,
            code, scheduledAt, durationMin: service.duration, status: 'CONFIRMED', source: 'ONLINE',
            liveToken: crypto.randomUUID().replace(/-/g, ''), idempotencyKey: idempotencyKey || null, note: cleanNote,
          },
          include: { service: true, branch: true },
        })
        const q = await enqueueAppointment(appt.id, {}, tx)
        return { appt, duplicated: false as const, customer, queueId: q?.queueId }
      },
      { maxWait: 15_000, timeout: 20_000 },
    )

    if (result.duplicated) {
      const a = result.appt
      return NextResponse.json({
        appointment: { id: a.id, code: a.code, liveToken: a.liveToken, scheduledAt: a.scheduledAt, status: a.status },
        businessName: tenant.name, serviceName: a.service.name, branchName: a.branch.name, duplicated: true,
      })
    }

    const { appt, customer, queueId } = result
    // Post-commit side effects — SMS/broadcast never block or fail the booking (AC-007)
    await queueNotification({
      tenantId: tenant.id,
      appointmentId: appt.id,
      type: 'BOOKING_CREATED',
      recipient: customer.mobile,
      vars: buildTemplateVars({
        customerName: cleanName, businessName: tenant.name, branchName: appt.branch.name, serviceName: appt.service.name,
        appointmentCode: appt.code, scheduledAt, liveToken: appt.liveToken, queue: null,
      }),
    })
    if (queueId) await broadcastQueueState(queueId, { action: 'BOOKING_CREATED' }).catch(() => {})

    return NextResponse.json({
      appointment: { id: appt.id, code: appt.code, liveToken: appt.liveToken, scheduledAt: appt.scheduledAt, status: appt.status },
      businessName: tenant.name,
      serviceName: appt.service.name,
      branchName: appt.branch.name,
    })
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('booking error', e)
    return NextResponse.json({ error: 'خطا در ثبت نوبت. دوباره تلاش کنید.' }, { status: 500 })
  }
}
