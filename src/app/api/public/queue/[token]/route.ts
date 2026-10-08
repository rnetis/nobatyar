import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getLiveState } from '@/lib/queue-engine'
import { calcEta } from '@/lib/queue-engine'

/**
 * Public Live Queue state by token — no login required (PRD §22, §35, AC-002)
 * GET /api/public/queue/{token}
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!/^[a-f0-9]{16,64}$/i.test(token)) {
    return NextResponse.json({ error: 'لینک نامعتبر است' }, { status: 400 })
  }
  const appt = await db.appointment.findUnique({
    where: { liveToken: token },
    include: {
      customer: true,
      service: true,
      branch: true,
      tenant: true,
      staff: true,
    },
  })
  if (!appt) {
    return NextResponse.json({ error: 'نوبتی با این لینک یافت نشد' }, { status: 404 })
  }

  const date = dateKeyOf(appt.scheduledAt)
  const queue = await db.queue.findUnique({
    where: { branchId_serviceId_date: { branchId: appt.branchId, serviceId: appt.serviceId, date } },
  })

  let entry = null
  let eta = { peopleAhead: 0, estimatedWait: 0 }
  if (queue) {
    entry = await db.queueEntry.findUnique({ where: { appointmentId: appt.id } })
    if (entry && entry.status === 'WAITING') {
      eta = await calcEta(queue.id, entry)
    }
  }

  const state = queue ? await getLiveState(queue.id) : null
  const cancelledLike = ['CANCELLED', 'NO_SHOW', 'SKIPPED', 'COMPLETED'].includes(appt.status)

  return NextResponse.json({
    appointment: {
      code: appt.code,
      status: appt.status,
      priority: appt.priority,
      scheduledAt: appt.scheduledAt,
      durationMin: appt.durationMin,
      customerName: appt.customer.name,
      serviceName: appt.service.name,
      branchName: appt.branch.name,
      tenantName: appt.tenant.name,
      logoText: appt.tenant.logoText,
      staffName: appt.staff?.name || null,
    },
    queue: state
      ? {
          id: state.queue.id,
          status: state.queue.status,
          currentServing: state.queue.currentServing,
          waiting: state.counts.waiting,
          completed: state.counts.completed,
          avgServiceMin: state.queue.avgServiceMin,
        }
      : null,
    me: entry
      ? {
          position: entry.status === 'WAITING' ? entry.position : null,
          status: entry.status,
          peopleAhead: eta.peopleAhead,
          estimatedWait: eta.estimatedWait,
          joinedAt: entry.joinedAt,
          calledAt: entry.calledAt,
          startedAt: entry.startedAt,
        }
      : null,
    finalStatus: cancelledLike,
  })
}

function dateKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
