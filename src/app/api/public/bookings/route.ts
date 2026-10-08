import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isSlotAvailable } from '@/lib/availability'
import { enqueueAppointment } from '@/lib/queue-engine'
import { queueNotification, buildTemplateVars } from '@/lib/sms'
import { broadcast } from '@/lib/bus'
import { dateKey } from '@/lib/jalali'

/**
 * Create booking without login (PRD §7, AC-001, AC-007)
 * POST { tenantSlug, branchId, serviceId, staffId?, date, time, name, mobile, note?, idempotencyKey? }
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'درخواست نامعتبر' }, { status: 400 })
  }

  const { tenantSlug, branchId, serviceId, staffId, date, time, name, mobile, note, idempotencyKey } = body as {
    tenantSlug?: string; branchId?: string; serviceId?: string; staffId?: string | null
    date?: string; time?: string; name?: string; mobile?: string; note?: string; idempotencyKey?: string
  }

  if (!tenantSlug || !branchId || !serviceId || !date || !time || !name?.trim() || !mobile?.trim()) {
    return NextResponse.json({ error: 'تمام فیلدهای الزامی را تکمیل کنید' }, { status: 400 })
  }
  if (!/^09\d{9}$/.test(mobile.trim())) {
    return NextResponse.json({ error: 'شماره موبایل معتبر نیست (مثال: 09123456789)' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'تاریخ یا ساعت نامعتبر است' }, { status: 400 })
  }

  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } })
  if (!tenant || tenant.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'این مرکز در حال حاضر پذیرش نوبت نیست' }, { status: 404 })
  }

  // Idempotency (PRD §57 — Booking Duplicate)
  if (idempotencyKey) {
    const existing = await db.appointment.findUnique({ where: { idempotencyKey } })
    if (existing) {
      return NextResponse.json({ appointment: existing, duplicated: true })
    }
  }

  const service = await db.service.findUnique({ where: { id: serviceId } })
  const branch = await db.branch.findUnique({ where: { id: branchId } })
  if (!service || !branch || service.tenantId !== tenant.id || branch.tenantId !== tenant.id) {
    return NextResponse.json({ error: 'خدمت یا شعبه نامعتبر است' }, { status: 400 })
  }

  // Re-check slot at creation time (double-booking guard — PRD §17)
  const free = await isSlotAvailable({ branchId, serviceId, staffId: staffId || null, date, time })
  if (!free) {
    return NextResponse.json({ error: 'این زمان به‌تازگی رزرو شد. لطفاً زمان دیگری انتخاب کنید.' }, { status: 409 })
  }

  const [hh, mm] = time.split(':').map(Number)
  const [y, m, d] = date.split('-').map(Number)
  const scheduledAt = new Date(y, m - 1, d, hh, mm, 0)

  const customer = await db.customer.upsert({
    where: { tenantId_mobile: { tenantId: tenant.id, mobile: mobile.trim() } },
    update: { name: name.trim() },
    create: { tenantId: tenant.id, name: name.trim(), mobile: mobile.trim() },
  })

  // Unique booking code (AC-001)
  const count = await db.appointment.count({ where: { tenantId: tenant.id } })
  const code = `${tenant.queuePrefix}-${String(count + 1).padStart(3, '0')}-${Math.floor(Math.random() * 90 + 10)}`

  try {
    const appt = await db.appointment.create({
      data: {
        tenantId: tenant.id,
        branchId,
        serviceId,
        staffId: staffId || null,
        customerId: customer.id,
        code,
        scheduledAt,
        durationMin: service.duration,
        status: 'CONFIRMED',
        source: 'ONLINE',
        liveToken: crypto.randomUUID().replace(/-/g, ''),
        idempotencyKey: idempotencyKey || null,
        note: note || null,
      },
    })

    await enqueueAppointment(appt.id)

    // SMS outbox — never blocks/fails the booking (AC-007)
    const vars = buildTemplateVars({
      customerName: customer.name,
      businessName: tenant.name,
      branchName: branch.name,
      serviceName: service.name,
      appointmentCode: appt.code,
      scheduledAt,
      liveToken: appt.liveToken,
      queue: null,
    })
    await queueNotification({
      tenantId: tenant.id,
      appointmentId: appt.id,
      type: 'BOOKING_CREATED',
      recipient: customer.mobile,
      vars,
    })

    // live broadcast to business panel
    const q = await db.queue.findUnique({
      where: { branchId_serviceId_date: { branchId, serviceId, date: dateKey(scheduledAt) } },
    })
    if (q) {
      await broadcast([`t:${tenant.id}`], 'queue.activity', { queueId: q.id, action: 'BOOKING_CREATED', code: appt.code, at: new Date().toISOString() })
    }

    return NextResponse.json({
      appointment: {
        id: appt.id,
        code: appt.code,
        liveToken: appt.liveToken,
        scheduledAt: appt.scheduledAt,
        status: appt.status,
      },
      businessName: tenant.name,
      serviceName: service.name,
      branchName: branch.name,
    })
  } catch (e) {
    console.error('booking error', e)
    return NextResponse.json({ error: 'خطا در ثبت نوبت. دوباره تلاش کنید.' }, { status: 500 })
  }
}
