import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBusinessSession } from '@/lib/auth'
import { enqueueAppointment, executeQueueAction, cancelAppointment, checkInAppointment, broadcastQueueState } from '@/lib/queue-engine'
import { queueNotification, buildTemplateVars } from '@/lib/sms'
import { isSlotAvailable, parseGregorianKey } from '@/lib/availability'

/** Appointments list + management (PRD §24 Appointment Management) */
export async function GET(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const url = new URL(req.url)
  const date = url.searchParams.get('date') // YYYY-MM-DD or "all"
  const status = url.searchParams.get('status')
  const q = (url.searchParams.get('q') || '').trim()

  const where: Record<string, unknown> = { tenantId: session.tenantId }
  if (date && date !== 'all' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number)
    const start = new Date(y, m - 1, d, 0, 0, 0)
    const end = new Date(y, m - 1, d, 23, 59, 59)
    where.scheduledAt = { gte: start, lte: end }
  }
  if (status && status !== 'all') where.status = status
  if (q) {
    where.OR = [
      { code: { contains: q.toUpperCase() } },
      { customer: { name: { contains: q } } },
      { customer: { mobile: { contains: q } } },
    ]
  }

  const appointments = await db.appointment.findMany({
    where,
    include: {
      customer: { select: { name: true, mobile: true } },
      service: { select: { name: true, duration: true } },
      branch: { select: { name: true } },
      staff: { select: { name: true } },
      queueEntry: { select: { position: true, status: true, priority: true } },
    },
    orderBy: { scheduledAt: 'desc' },
    take: 200,
  })
  return NextResponse.json({ appointments })
}

/**
 * Allowed source statuses per action (appointment state machine).
 * The old code applied any action to any appointment — e.g. cancelling a COMPLETED visit,
 * or marking an IN_SERVICE customer as a no-show.
 */
const ALLOWED_FROM: Record<string, string[]> = {
  confirm: ['PENDING', 'CONFIRMED'],
  cancel: ['PENDING', 'CONFIRMED', 'WAITING', 'CALLED', 'SKIPPED'],
  checkin: ['PENDING', 'CONFIRMED', 'WAITING', 'SKIPPED', 'NO_SHOW'],
  no_show: ['PENDING', 'CONFIRMED', 'WAITING', 'CALLED'],
  reschedule: ['PENDING', 'CONFIRMED', 'WAITING', 'SKIPPED', 'NO_SHOW'],
  priority: ['PENDING', 'CONFIRMED', 'WAITING'],
}

/** PATCH: confirm | cancel | checkin | no_show | reschedule {date,time} | priority */
export async function PATCH(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })

  let body: { id?: string; action?: string; date?: string; time?: string; priority?: string; reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'درخواست نامعتبر' }, { status: 400 })
  }
  const { id, action, date, time, priority, reason } = body
  if (!id || !action) return NextResponse.json({ error: 'پارامترهای ناقص' }, { status: 400 })
  if (!ALLOWED_FROM[action]) return NextResponse.json({ error: 'عملیات نامعتبر' }, { status: 400 })

  const appt = await db.appointment.findUnique({
    where: { id },
    include: { customer: true, service: true, branch: true, tenant: true, queueEntry: true },
  })
  if (!appt || appt.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'نوبت یافت نشد' }, { status: 404 })
  }
  if (!ALLOWED_FROM[action].includes(appt.status)) {
    return NextResponse.json({ error: 'این عملیات برای وضعیت فعلی نوبت مجاز نیست' }, { status: 409 })
  }

  switch (action) {
    case 'confirm': {
      if (appt.status === 'PENDING') await db.appointment.update({ where: { id }, data: { status: 'CONFIRMED' } })
      break
    }
    case 'cancel': {
      const r = await cancelAppointment({ appointmentId: id, actor: session.name, reason })
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
      break
    }
    case 'no_show': {
      if (!appt.queueEntry) {
        await db.appointment.update({ where: { id }, data: { status: 'NO_SHOW' } })
        break
      }
      const r = await executeQueueAction({
        queueId: appt.queueEntry.queueId, action: 'no_show', entryId: appt.queueEntry.id, actor: session.name, reason,
      })
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
      break
    }
    case 'checkin': {
      await checkInAppointment(id)
      if (appt.queueEntry) await broadcastQueueState(appt.queueEntry.queueId, { action: 'CHECKIN' }).catch(() => {})
      break
    }
    case 'priority': {
      const pr = priority && ['NORMAL', 'PRIORITY', 'VIP', 'EMERGENCY'].includes(priority) ? priority : null
      if (!pr) return NextResponse.json({ error: 'اولویت نامعتبر است' }, { status: 400 })
      if (appt.queueEntry && appt.queueEntry.status === 'WAITING') {
        const r = await executeQueueAction({ queueId: appt.queueEntry.queueId, action: 'priority', entryId: appt.queueEntry.id, priority: pr, actor: session.name })
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
      } else {
        await db.appointment.update({ where: { id }, data: { priority: pr } })
      }
      break
    }
    case 'reschedule': {
      if (!date || !time || !parseGregorianKey(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        return NextResponse.json({ error: 'تاریخ/ساعت جدید نامعتبر' }, { status: 400 })
      }
      const [hh, mm] = time.split(':').map(Number)
      const [y, m, d] = date.split('-').map(Number)
      const newAt = new Date(y, m - 1, d, hh, mm, 0)
      const oldAt = appt.scheduledAt
      const oldQueueId = appt.queueEntry?.queueId
      let newQueueId: string | undefined
      try {
        // availability check + move happen in one transaction; the booking itself is excluded
        // from the check (the old code rejected moving to a slot overlapping its own time)
        newQueueId = await db.$transaction(async (tx) => {
          const free = await isSlotAvailable(
            { branchId: appt.branchId, serviceId: appt.serviceId, staffId: appt.staffId, date, time, excludeAppointmentId: id },
            tx,
          )
          if (!free) throw new Error('SLOT_TAKEN')
          await tx.appointment.update({ where: { id }, data: { scheduledAt: newAt, status: 'CONFIRMED' } })
          const q = await enqueueAppointment(id, { reposition: true }, tx)
          await tx.auditLog.create({
            data: {
              tenantId: appt.tenantId, actor: session.name, role: session.role,
              action: 'APPOINTMENT_RESCHEDULE', entityType: 'Appointment', entityId: id,
              detail: JSON.stringify({ from: oldAt.toISOString(), to: newAt.toISOString() }),
            },
          })
          return q?.queueId
        }, { maxWait: 15_000, timeout: 20_000 })
      } catch (e) {
        if (e instanceof Error && e.message === 'SLOT_TAKEN') return NextResponse.json({ error: 'این زمان آزاد نیست' }, { status: 409 })
        console.error('reschedule failed', e)
        return NextResponse.json({ error: 'خطا در جابجایی نوبت' }, { status: 500 })
      }
      await queueNotification({
        tenantId: appt.tenantId, appointmentId: appt.id, type: 'RESCHEDULED', recipient: appt.customer.mobile, material: true,
        vars: buildTemplateVars({
          customerName: appt.customer.name, businessName: appt.tenant.name, branchName: appt.branch.name, serviceName: appt.service.name,
          appointmentCode: appt.code, scheduledAt: newAt, liveToken: appt.liveToken, queue: null,
        }),
      })
      if (newQueueId) await broadcastQueueState(newQueueId, { action: 'RESCHEDULED' }).catch(() => {})
      if (oldQueueId && oldQueueId !== newQueueId) await broadcastQueueState(oldQueueId, { action: 'RESCHEDULED' }).catch(() => {})
      break
    }
  }

  const updated = await db.appointment.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true, mobile: true } },
      service: { select: { name: true } },
      queueEntry: { select: { position: true, status: true, priority: true } },
    },
  })
  return NextResponse.json({ appointment: updated })
}
