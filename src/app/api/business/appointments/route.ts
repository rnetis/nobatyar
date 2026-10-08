import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBusinessSession } from '@/lib/auth'
import { enqueueAppointment } from '@/lib/queue-engine'
import { queueNotification, buildTemplateVars } from '@/lib/sms'
import { isSlotAvailable } from '@/lib/availability'

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

/** PATCH: confirm | cancel | checkin | no_show | reschedule {date,time} | priority */
export async function PATCH(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })

  let body: { id?: string; action?: string; date?: string; time?: string; priority?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'درخواست نامعتبر' }, { status: 400 })
  }
  const { id, action, date, time, priority } = body
  if (!id || !action) return NextResponse.json({ error: 'پارامترهای ناقص' }, { status: 400 })

  const appt = await db.appointment.findUnique({
    where: { id },
    include: { customer: true, service: true, branch: true, tenant: true },
  })
  if (!appt || appt.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'نوبت یافت نشد' }, { status: 404 })
  }

  const vars = buildTemplateVars({
    customerName: appt.customer.name,
    businessName: appt.tenant.name,
    branchName: appt.branch.name,
    serviceName: appt.service.name,
    appointmentCode: appt.code,
    scheduledAt: appt.scheduledAt,
    liveToken: appt.liveToken,
    queue: null,
  })

  switch (action) {
    case 'confirm': {
      await db.appointment.update({ where: { id }, data: { status: 'CONFIRMED' } })
      break
    }
    case 'cancel': {
      await db.appointment.update({ where: { id }, data: { status: 'CANCELLED' } })
      await db.queueEntry.updateMany({ where: { appointmentId: id, status: 'WAITING' }, data: { status: 'CANCELLED' } })
      await queueNotification({
        tenantId: appt.tenantId, appointmentId: appt.id, type: 'CANCELLED',
        recipient: appt.customer.mobile, vars, material: true,
      })
      break
    }
    case 'checkin': {
      // customer arrived → enter queue
      await db.appointment.update({ where: { id }, data: { status: 'WAITING' } })
      await enqueueAppointment(id)
      break
    }
    case 'no_show': {
      await db.appointment.update({ where: { id }, data: { status: 'NO_SHOW' } })
      await db.queueEntry.updateMany({ where: { appointmentId: id, status: 'WAITING' }, data: { status: 'NO_SHOW' } })
      await queueNotification({
        tenantId: appt.tenantId, appointmentId: appt.id, type: 'NO_SHOW',
        recipient: appt.customer.mobile, vars, material: true,
      })
      break
    }
    case 'reschedule': {
      if (!date || !time || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
        return NextResponse.json({ error: 'تاریخ/ساعت جدید نامعتبر' }, { status: 400 })
      }
      const free = await isSlotAvailable({
        branchId: appt.branchId, serviceId: appt.serviceId, staffId: appt.staffId, date, time,
      })
      if (!free) return NextResponse.json({ error: 'این زمان آزاد نیست' }, { status: 409 })
      const [hh, mm] = time.split(':').map(Number)
      const [y, m, d] = date.split('-').map(Number)
      const newAt = new Date(y, m - 1, d, hh, mm, 0)
      const oldAt = appt.scheduledAt
      await db.appointment.update({ where: { id }, data: { scheduledAt: newAt, status: 'CONFIRMED' } })
      // move queue entry to the right day-queue
      await db.queueEntry.updateMany({ where: { appointmentId: id, status: 'WAITING' }, data: { status: 'CANCELLED' } })
      await enqueueAppointment(id)
      const newVars = { ...vars, appointment_date: new Intl.DateTimeFormat('fa-IR').format(newAt), appointment_time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` }
      await queueNotification({
        tenantId: appt.tenantId, appointmentId: appt.id, type: 'RESCHEDULED',
        recipient: appt.customer.mobile, vars: newVars, material: true,
      })
      await db.auditLog.create({
        data: {
          tenantId: appt.tenantId, actor: session.name, role: session.role,
          action: 'APPOINTMENT_RESCHEDULE', entityType: 'Appointment', entityId: id,
          detail: JSON.stringify({ from: oldAt.toISOString(), to: newAt.toISOString() }),
        },
      })
      break
    }
    case 'priority': {
      const pr = priority && ['NORMAL', 'PRIORITY', 'VIP', 'EMERGENCY'].includes(priority) ? priority : 'NORMAL'
      await db.appointment.update({ where: { id }, data: { priority: pr } })
      await db.queueEntry.updateMany({ where: { appointmentId: id }, data: { priority: pr } })
      break
    }
    default:
      return NextResponse.json({ error: 'عملیات نامعتبر' }, { status: 400 })
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
