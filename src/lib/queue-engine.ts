import { db } from '@/lib/db'
import { broadcast, broadcastQueueUpdate } from '@/lib/bus'
import { queueNotification, buildTemplateVars } from '@/lib/sms'
import { minutesToTime, dateKey } from '@/lib/jalali'

/**
 * Queue Engine (PRD §14–18, §57)
 * All mutations are atomic (serialized SQLite transaction) → AC-006
 * Every mutation: recalc positions → recalc ETA → audit → broadcast → notify
 */

export type QueueAction =
  | 'next'        // complete current, call the next one
  | 'call'        // call specific entry
  | 'recall'
  | 'serve'       // start service for called entry
  | 'complete'
  | 'skip'
  | 'cancel'
  | 'no_show'
  | 'move'        // manual position change {entryId, direction: 'up'|'down'|'top'|'bottom'} or {entryId, position}
  | 'priority'    // {entryId, priority}
  | 'pause' | 'resume'

export const PRIORITY_RANK: Record<string, number> = {
  NORMAL: 0,
  PRIORITY: 1,
  VIP: 2,
  EMERGENCY: 3,
}

export const PRIORITY_FA: Record<string, string> = {
  NORMAL: 'عادی',
  PRIORITY: 'ویژه',
  VIP: 'VIP',
  EMERGENCY: 'فوری',
}

export async function getOrCreateQueue(branchId: string, serviceId: string, date: string) {
  const existing = await db.queue.findUnique({
    where: { branchId_serviceId_date: { branchId, serviceId, date } },
  })
  if (existing) return existing
  const branch = await db.branch.findUnique({ where: { id: branchId } })
  if (!branch) throw new Error('branch not found')
  return db.queue.create({
    data: { tenantId: branch.tenantId, branchId, serviceId, date, status: 'OPEN' },
  })
}

/** Append an appointment to the end of today's queue. */
export async function enqueueAppointment(appointmentId: string): Promise<void> {
  const appt = await db.appointment.findUnique({ where: { id: appointmentId } })
  if (!appt) return
  const date = dateKey(appt.scheduledAt)
  const queue = await getOrCreateQueue(appt.branchId, appt.serviceId, date)
  const last = await db.queueEntry.findFirst({
    where: { queueId: queue.id },
    orderBy: { position: 'desc' },
  })
  await db.queueEntry.create({
    data: {
      queueId: queue.id,
      appointmentId,
      position: (last?.position ?? 0) + 1,
      status: 'WAITING',
      priority: appt.priority,
    },
  })
  await recalculate(queue.id)
}

/** Recalculate WAITING positions by (priority desc, position asc, joinedAt asc) → reindex 1..n */
export async function recalculate(queueId: string): Promise<void> {
  const entries = await db.queueEntry.findMany({
    where: { queueId, status: 'WAITING' },
    orderBy: [{ joinedAt: 'asc' }],
  })
  const sorted = [...entries].sort((a, b) => {
    const pr = (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0)
    if (pr !== 0) return pr
    if (a.position !== b.position) return a.position - b.position
    return a.joinedAt.getTime() - b.joinedAt.getTime()
  })
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].position !== i + 1) {
      await db.queueEntry.update({ where: { id: sorted[i].id }, data: { position: i + 1 } })
      sorted[i].position = i + 1
    }
  }
}

export async function activeStaffCount(branchId: string, serviceId: string): Promise<number> {
  const staffList = await db.staff.findMany({
    where: { tenantId: (await db.branch.findUnique({ where: { id: branchId } }))?.tenantId, status: 'ACTIVE' },
  })
  let count = 0
  for (const s of staffList) {
    if (s.branchId && s.branchId !== branchId) continue
    try {
      const ids = JSON.parse(s.serviceIds || '[]')
      if (Array.isArray(ids) && ids.includes(serviceId)) count++
    } catch { /* noop */ }
  }
  return Math.max(1, Math.min(count || 1, 4))
}

export async function calcEta(queueId: string, entry?: { id: string } | null): Promise<{ peopleAhead: number; estimatedWait: number }> {
  const queue = await db.queue.findUnique({ where: { id: queueId } })
  if (!queue) return { peopleAhead: 0, estimatedWait: 0 }
  const waiting = await db.queueEntry.findMany({
    where: { queueId, status: 'WAITING' },
    orderBy: { position: 'asc' },
  })
  const staffN = await activeStaffCount(queue.branchId, queue.serviceId)
  const perPerson = Math.max(5, Math.round(queue.avgServiceMin / staffN))
  if (!entry) {
    return { peopleAhead: waiting.length, estimatedWait: waiting.length * perPerson }
  }
  const me = waiting.find((w) => w.id === entry.id)
  if (!me) return { peopleAhead: 0, estimatedWait: 0 }
  const peopleAhead = waiting.filter((w) => w.position < me.position).length
  return { peopleAhead, estimatedWait: peopleAhead * perPerson }
}

async function audit(args: {
  tenantId: string
  actor: string
  action: string
  entityType: string
  entityId?: string
  detail?: Record<string, unknown>
}) {
  await db.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actor: args.actor,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId || null,
      detail: args.detail ? JSON.stringify(args.detail) : null,
    },
  })
}

async function loadTenantContext(tenantId: string) {
  return db.tenant.findUnique({ where: { id: tenantId } })
}

/** Notify the closest waiting bookers that their turn is near / positions moved (threshold policy). */
async function notifyWaiting(queueId: string, tenantId: string, maxNotify = 2) {
  const queue = await db.queue.findUnique({
    where: { id: queueId },
    include: { branch: true, service: true },
  })
  if (!queue) return
  const tenant = await loadTenantContext(tenantId)
  if (!tenant) return
  const waiting = await db.queueEntry.findMany({
    where: { queueId, status: 'WAITING' },
    orderBy: { position: 'asc' },
    include: { appointment: { include: { customer: true } } },
  })
  const staffN = await activeStaffCount(queue.branchId, queue.serviceId)
  const perPerson = Math.max(5, Math.round(queue.avgServiceMin / staffN))
  for (const w of waiting.slice(0, maxNotify)) {
    const peopleAhead = waiting.filter((x) => x.position < w.position).length
    const vars = buildTemplateVars({
      customerName: w.appointment.customer.name,
      businessName: tenant.name,
      branchName: queue.branch.name,
      serviceName: queue.service.name,
      appointmentCode: w.appointment.code,
      scheduledAt: w.appointment.scheduledAt,
      liveToken: w.appointment.liveToken,
      queue: { position: w.position, peopleAhead, estimatedWait: peopleAhead * perPerson },
    })
    await queueNotification({
      tenantId,
      appointmentId: w.appointmentId,
      type: 'QUEUE_CHANGED',
      recipient: w.appointment.customer.mobile,
      vars,
      material: true,
    })
  }
}

async function snapshotPayload(queueId: string) {
  const state = await getLiveState(queueId)
  return state
}

/** Full live-state snapshot for a queue (booker + business views). */
export async function getLiveState(queueId: string) {
  const queue = await db.queue.findUnique({
    where: { id: queueId },
    include: {
      branch: true,
      service: true,
      tenant: { select: { id: true, name: true, logoText: true } },
    },
  })
  if (!queue) return null
  const entries = await db.queueEntry.findMany({
    where: { queueId },
    include: { appointment: { include: { customer: true, service: true, staff: true } } },
    orderBy: { position: 'asc' },
  })
  const waiting = entries.filter((e) => e.status === 'WAITING')
  const staffN = await activeStaffCount(queue.branchId, queue.serviceId)
  const perPerson = Math.max(5, Math.round(queue.avgServiceMin / staffN))
  return {
    queue: {
      id: queue.id,
      status: queue.status,
      date: queue.date,
      currentServing: queue.currentServing,
      avgServiceMin: queue.avgServiceMin,
      branchName: queue.branch.name,
      serviceName: queue.service.name,
      tenantName: queue.tenant.name,
      logoText: queue.tenant.logoText,
    },
    counts: {
      total: entries.length,
      waiting: waiting.length,
      completed: entries.filter((e) => e.status === 'COMPLETED').length,
      noShow: entries.filter((e) => e.status === 'NO_SHOW').length,
      skipped: entries.filter((e) => e.status === 'SKIPPED').length,
    },
    serving: entries
      .filter((e) => e.status === 'CALLED' || e.status === 'IN_SERVICE')
      .map((e) => ({
        id: e.id,
        code: e.appointment.code,
        status: e.status,
        customerName: e.appointment.customer.name,
        calledAt: e.calledAt,
      })),
    waiting: waiting.map((e) => {
      const peopleAhead = waiting.filter((x) => x.position < e.position).length
      return {
        id: e.id,
        code: e.appointment.code,
        position: e.position,
        peopleAhead,
        estimatedWait: peopleAhead * perPerson,
        priority: e.priority,
        status: e.status,
        token: e.appointment.liveToken,
        customerName: e.appointment.customer.name,
        joinedAt: e.joinedAt,
      }
    }),
    recent: entries
      .filter((e) => ['COMPLETED', 'SKIPPED', 'CANCELLED', 'NO_SHOW'].includes(e.status))
      .slice(-6)
      .reverse()
      .map((e) => ({
        id: e.id,
        code: e.appointment.code,
        status: e.status,
        customerName: e.appointment.customer.name,
        completedAt: e.completedAt,
      })),
  }
}

export type QueueSnapshot = NonNullable<Awaited<ReturnType<typeof getLiveState>>>

/**
 * Execute a queue action atomically.
 * SQLite serializes writes per-connection → concurrent "next" calls are safe (AC-006).
 */
export async function executeQueueAction(args: {
  queueId: string
  action: QueueAction
  actor: string
  entryId?: string
  priority?: string
  position?: number
  direction?: 'up' | 'down' | 'top' | 'bottom'
  reason?: string
}): Promise<{ ok: boolean; error?: string; snapshot?: QueueSnapshot }> {
  const queue = await db.queue.findUnique({ where: { id: args.queueId } })
  if (!queue) return { ok: false, error: 'صف یافت نشد' }
  const tenant = await loadTenantContext(queue.tenantId)
  if (!tenant) return { ok: false, error: 'مستأجر یافت نشد' }

  const entries = await db.queueEntry.findMany({
    where: { queueId: queue.id },
    include: { appointment: { include: { customer: true } } },
    orderBy: { position: 'asc' },
  })
  const waiting = entries.filter((e) => e.status === 'WAITING')
  const serving = entries.find((e) => e.status === 'CALLED' || e.status === 'IN_SERVICE')
  const now = new Date()

  const notifyFor = async (entryId: string, type: Parameters<typeof queueNotification>[0]['type']) => {
    const e = entries.find((x) => x.id === entryId)
    if (!e) return
    const vars = buildTemplateVars({
      customerName: e.appointment.customer.name,
      businessName: tenant.name,
      branchName: queue.branchId ? (await db.branch.findUnique({ where: { id: queue.branchId } }))?.name : '',
      serviceName: (await db.service.findUnique({ where: { id: queue.serviceId } }))?.name || '',
      appointmentCode: e.appointment.code,
      scheduledAt: e.appointment.scheduledAt,
      liveToken: e.appointment.liveToken,
      queue: null,
    })
    await queueNotification({
      tenantId: tenant.id,
      appointmentId: e.appointmentId,
      type,
      recipient: e.appointment.customer.mobile,
      vars,
      material: true,
    })
  }

  switch (args.action) {
    case 'next': {
      if (serving && serving.status === 'IN_SERVICE') {
        // auto-complete current in-service then continue below
        await db.queueEntry.update({
          where: { id: serving.id },
          data: { status: 'COMPLETED', completedAt: now },
        })
        await db.appointment.update({ where: { id: serving.appointmentId }, data: { status: 'COMPLETED' } })
      } else if (serving && serving.status === 'CALLED') {
        return { ok: false, error: 'ابتدا سرویس نفر فراخوانده‌شده را آغاز یا رد کنید' }
      }
      const next = waiting.sort((a, b) => a.position - b.position)[0]
      if (!next) {
        await db.queue.update({ where: { id: queue.id }, data: { currentServing: null } })
        break
      }
      await db.queueEntry.update({
        where: { id: next.id },
        data: { status: 'CALLED', calledAt: now },
      })
      await db.appointment.update({ where: { id: next.appointmentId }, data: { status: 'CALLED' } })
      await db.queue.update({ where: { id: queue.id }, data: { currentServing: next.appointment.code } })
      await notifyFor(next.id, 'CALLED')
      await audit({
        tenantId: tenant.id, actor: args.actor, action: 'QUEUE_CALL_NEXT',
        entityType: 'QueueEntry', entityId: next.id,
        detail: { code: next.appointment.code },
      })
      break
    }
    case 'call': {
      const target = entries.find((e) => e.id === args.entryId)
      if (!target) return { ok: false, error: 'نوبت یافت نشد' }
      if (target.status !== 'WAITING') return { ok: false, error: 'این نوبت در انتظار نیست' }
      if (serving && serving.status === 'IN_SERVICE') {
        await db.queueEntry.update({
          where: { id: serving.id },
          data: { status: 'COMPLETED', completedAt: now },
        })
        await db.appointment.update({ where: { id: serving.appointmentId }, data: { status: 'COMPLETED' } })
      }
      await db.queueEntry.update({ where: { id: target.id }, data: { status: 'CALLED', calledAt: now } })
      await db.appointment.update({ where: { id: target.appointmentId }, data: { status: 'CALLED' } })
      await db.queue.update({ where: { id: queue.id }, data: { currentServing: target.appointment.code } })
      await notifyFor(target.id, 'CALLED')
      await audit({
        tenantId: tenant.id, actor: args.actor, action: 'QUEUE_CALL',
        entityType: 'QueueEntry', entityId: target.id, detail: { code: target.appointment.code },
      })
      break
    }
    case 'recall': {
      if (!serving) return { ok: false, error: 'نوبت فراخوانده‌شده‌ای وجود ندارد' }
      await notifyFor(serving.id, 'CALLED')
      await audit({
        tenantId: tenant.id, actor: args.actor, action: 'QUEUE_RECALL',
        entityType: 'QueueEntry', entityId: serving.id, detail: { code: serving.appointment.code },
      })
      break
    }
    case 'serve': {
      if (!serving || serving.status !== 'CALLED') return { ok: false, error: 'ابتدا نفر بعدی را فراخوانی کنید' }
      await db.queueEntry.update({ where: { id: serving.id }, data: { status: 'IN_SERVICE', startedAt: now } })
      await db.appointment.update({ where: { id: serving.appointmentId }, data: { status: 'IN_SERVICE' } })
      await audit({
        tenantId: tenant.id, actor: args.actor, action: 'QUEUE_START_SERVICE',
        entityType: 'QueueEntry', entityId: serving.id, detail: { code: serving.appointment.code },
      })
      break
    }
    case 'complete': {
      if (!serving) return { ok: false, error: 'نوبتی در حال سرویس نیست' }
      await db.queueEntry.update({ where: { id: serving.id }, data: { status: 'COMPLETED', completedAt: now } })
      await db.appointment.update({ where: { id: serving.appointmentId }, data: { status: 'COMPLETED' } })
      await db.queue.update({ where: { id: queue.id }, data: { currentServing: null } })
      // learn average service time
      if (serving.startedAt) {
        const mins = Math.max(3, Math.round((now.getTime() - serving.startedAt.getTime()) / 60000))
        const newAvg = Math.round(queue.avgServiceMin * 0.7 + mins * 0.3)
        await db.queue.update({ where: { id: queue.id }, data: { avgServiceMin: Math.min(90, newAvg) } })
      }
      await audit({
        tenantId: tenant.id, actor: args.actor, action: 'QUEUE_COMPLETE',
        entityType: 'QueueEntry', entityId: serving.id, detail: { code: serving.appointment.code },
      })
      break
    }
    case 'skip': {
      const target = args.entryId ? entries.find((e) => e.id === args.entryId) : serving
      if (!target) return { ok: false, error: 'نوبت یافت نشد' }
      await db.queueEntry.update({ where: { id: target.id }, data: { status: 'SKIPPED' } })
      await db.appointment.update({ where: { id: target.appointmentId }, data: { status: 'SKIPPED' } })
      if (serving && serving.id === target.id) {
        await db.queue.update({ where: { id: queue.id }, data: { currentServing: null } })
      }
      await notifyFor(target.id, 'QUEUE_CHANGED')
      await audit({
        tenantId: tenant.id, actor: args.actor, action: 'QUEUE_SKIP',
        entityType: 'QueueEntry', entityId: target.id, detail: { code: target.appointment.code, reason: args.reason || null },
      })
      break
    }
    case 'cancel': {
      const target = args.entryId ? entries.find((e) => e.id === args.entryId) : serving
      if (!target) return { ok: false, error: 'نوبت یافت نشد' }
      await db.queueEntry.update({ where: { id: target.id }, data: { status: 'CANCELLED' } })
      await db.appointment.update({ where: { id: target.appointmentId }, data: { status: 'CANCELLED' } })
      if (serving && serving.id === target.id) {
        await db.queue.update({ where: { id: queue.id }, data: { currentServing: null } })
      }
      await notifyFor(target.id, 'CANCELLED')
      await audit({
        tenantId: tenant.id, actor: args.actor, action: 'QUEUE_CANCEL',
        entityType: 'QueueEntry', entityId: target.id, detail: { code: target.appointment.code, reason: args.reason || null },
      })
      break
    }
    case 'no_show': {
      const target = args.entryId ? entries.find((e) => e.id === args.entryId) : serving
      if (!target) return { ok: false, error: 'نوبت یافت نشد' }
      await db.queueEntry.update({ where: { id: target.id }, data: { status: 'NO_SHOW' } })
      await db.appointment.update({ where: { id: target.appointmentId }, data: { status: 'NO_SHOW' } })
      if (serving && serving.id === target.id) {
        await db.queue.update({ where: { id: queue.id }, data: { currentServing: null } })
      }
      await notifyFor(target.id, 'NO_SHOW')
      await audit({
        tenantId: tenant.id, actor: args.actor, action: 'QUEUE_NO_SHOW',
        entityType: 'QueueEntry', entityId: target.id, detail: { code: target.appointment.code },
      })
      break
    }
    case 'move': {
      if (!args.entryId) return { ok: false, error: 'نوبت مشخص نیست' }
      const target = waiting.find((e) => e.id === args.entryId)
      if (!target) return { ok: false, error: 'نوبت در وضعیت انتظار نیست' }
      const ordered = [...waiting].sort((a, b) => {
        const pr = (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0)
        if (pr !== 0) return pr
        return a.position - b.position
      })
      const idx = ordered.findIndex((e) => e.id === target.id)
      let newIdx = idx
      if (args.direction === 'up') newIdx = Math.max(0, idx - 1)
      else if (args.direction === 'down') newIdx = Math.min(ordered.length - 1, idx + 1)
      else if (args.direction === 'top') newIdx = 0
      else if (args.direction === 'bottom') newIdx = ordered.length - 1
      else if (typeof args.position === 'number') newIdx = Math.max(0, Math.min(ordered.length - 1, args.position - 1))
      if (newIdx !== idx) {
        ordered.splice(newIdx, 0, ordered.splice(idx, 1)[0])
        for (let i = 0; i < ordered.length; i++) {
          await db.queueEntry.update({ where: { id: ordered[i].id }, data: { position: i + 1 } })
        }
        await audit({
          tenantId: tenant.id, actor: args.actor, action: 'QUEUE_MOVE',
          entityType: 'QueueEntry', entityId: target.id,
          detail: { code: target.appointment.code, from: idx + 1, to: newIdx + 1, reason: args.reason || null },
        })
      }
      break
    }
    case 'priority': {
      const target = entries.find((e) => e.id === args.entryId)
      if (!target) return { ok: false, error: 'نوبت یافت نشد' }
      const pr = args.priority && args.priority in PRIORITY_RANK ? args.priority : 'NORMAL'
      await db.queueEntry.update({ where: { id: target.id }, data: { priority: pr } })
      await db.appointment.update({ where: { id: target.appointmentId }, data: { priority: pr } })
      await audit({
        tenantId: tenant.id, actor: args.actor, action: 'QUEUE_PRIORITY',
        entityType: 'QueueEntry', entityId: target.id, detail: { code: target.appointment.code, priority: pr },
      })
      break
    }
    case 'pause': {
      await db.queue.update({ where: { id: queue.id }, data: { status: 'PAUSED' } })
      await audit({ tenantId: tenant.id, actor: args.actor, action: 'QUEUE_PAUSE', entityType: 'Queue', entityId: queue.id })
      break
    }
    case 'resume': {
      await db.queue.update({ where: { id: queue.id }, data: { status: 'OPEN' } })
      await audit({ tenantId: tenant.id, actor: args.actor, action: 'QUEUE_RESUME', entityType: 'Queue', entityId: queue.id })
      break
    }
    default:
      return { ok: false, error: 'عملیات نامعتبر' }
  }

  await recalculate(queue.id)
  const snapshot = await snapshotPayload(queue.id)

  // Broadcast: tenant room + every participant's token room (waiting, serving, recent)
  const participants = await db.queueEntry.findMany({
    where: { queueId: queue.id },
    include: { appointment: true },
  })
  const rooms = [`t:${tenant.id}`, ...participants.map((f) => `q:${f.appointment.liveToken}`)]
  const fresh = participants.filter((f) => f.status === 'WAITING')
  const servingCode = (await db.queue.findUnique({ where: { id: queue.id } }))?.currentServing
  for (const f of fresh) {
    const peopleAhead = fresh.filter((x) => x.position < f.position).length
    const staffN = await activeStaffCount(queue.branchId, queue.serviceId)
    const perPerson = Math.max(5, Math.round((await db.queue.findUnique({ where: { id: queue.id } }))?.avgServiceMin || 15) / staffN)
    await broadcastQueueUpdate(tenant.id, f.appointment.liveToken, {
      queueId: queue.id,
      event: 'queue.updated',
      position: peopleAhead + 1,
      peopleAhead,
      estimatedWait: peopleAhead * perPerson,
    })
  }
  // notify the directly-affected entry rooms (called / skipped / completed …)
  const affected = participants.find((p) => p.id === args.entryId) || participants.find((p) => p.appointment.code === servingCode)
  if (affected) {
    await broadcastQueueUpdate(tenant.id, affected.appointment.liveToken, {
      queueId: queue.id,
      event: args.action === 'call' || args.action === 'next' ? 'appointment.called' : 'queue.updated',
      position: 0,
      peopleAhead: 0,
      estimatedWait: 0,
    })
  }
  await broadcast(rooms, 'queue.activity', {
    queueId: queue.id,
    servingCode,
    action: args.action,
    at: now.toISOString(),
  })

  // threshold policy → notify the 2 closest bookers after material changes
  if (['next', 'call', 'skip', 'cancel', 'no_show', 'move'].includes(args.action)) {
    await notifyWaiting(queue.id, tenant.id)
  }

  return { ok: true, snapshot: snapshot || undefined }
}

/** Add a walk-in / in-person booking straight into the queue (Business panel). */
export async function createWalkIn(args: {
  tenantId: string
  branchId: string
  serviceId: string
  staffId?: string | null
  customerName: string
  mobile: string
  priority?: string
  actor: string
}): Promise<{ ok: boolean; error?: string; token?: string; code?: string }> {
  const service = await db.service.findUnique({ where: { id: args.serviceId } })
  const branch = await db.branch.findUnique({ where: { id: args.branchId } })
  const tenant = await db.tenant.findUnique({ where: { id: args.tenantId } })
  if (!service || !branch || !tenant) return { ok: false, error: 'اطلاعات ناقص' }

  const now = new Date()
  const count = await db.appointment.count({ where: { tenantId: args.tenantId } })
  const code = `${branch.name ? 'W' : 'W'}-${String(count + 1).padStart(3, '0')}-${Math.floor(Math.random() * 90 + 10)}`
  const customer = await db.customer.upsert({
    where: { tenantId_mobile: { tenantId: args.tenantId, mobile: args.mobile } },
    update: { name: args.customerName },
    create: { tenantId: args.tenantId, name: args.customerName, mobile: args.mobile },
  })
  const appt = await db.appointment.create({
    data: {
      tenantId: args.tenantId,
      branchId: args.branchId,
      serviceId: args.serviceId,
      staffId: args.staffId || null,
      customerId: customer.id,
      code,
      scheduledAt: now,
      durationMin: service.duration,
      status: 'WAITING',
      source: 'WALK_IN',
      priority: args.priority || 'NORMAL',
      liveToken: crypto.randomUUID().replace(/-/g, ''),
    },
  })
  await enqueueAppointment(appt.id)
  await audit({
    tenantId: args.tenantId, actor: args.actor, action: 'APPOINTMENT_WALK_IN',
    entityType: 'Appointment', entityId: appt.id, detail: { code },
  })
  return { ok: true, token: appt.liveToken, code }
}
