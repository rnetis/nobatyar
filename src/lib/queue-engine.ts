import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { broadcast, broadcastQueueUpdate } from '@/lib/bus'
import { queueNotification, buildTemplateVars, type NotificationType } from '@/lib/sms'
import { dateKey } from '@/lib/jalali'
import { generateUniqueCode } from '@/lib/booking-code'

/**
 * Queue Engine (PRD §14–18, §57)
 *
 * Guarantees
 *  - Every state mutation runs inside ONE interactive transaction. Prisma serialises
 *    SQLite transactions on a single connection, so two operators pressing "next" at the
 *    same moment can never call the same customer (AC-006).
 *  - Side effects (SMS, webhooks, websocket broadcasts) run AFTER commit and never
 *    inside the transaction (using `db` inside a tx would deadlock on SQLite).
 *
 * Ordering rule for WAITING entries
 *  - A new entry is inserted by (priority desc, scheduled time asc) relative to the
 *    current order. After that the stored `position` is authoritative, so a manual
 *    "move" by an operator is never silently undone by a later recalculation.
 */

type Tx = Prisma.TransactionClient
const TX_OPTS = { maxWait: 15_000, timeout: 20_000 }

export type QueueAction =
  | 'next'        // complete current (if in service), call the next eligible one
  | 'call'        // call specific entry (operator override: ignores the early-call window)
  | 'recall'
  | 'serve'       // start service for called entry
  | 'complete'
  | 'skip'
  | 'cancel'
  | 'no_show'
  | 'requeue'     // put a skipped / no-show customer back at the end of the queue
  | 'move'        // {entryId, direction: 'up'|'down'|'top'|'bottom'} or {entryId, position}
  | 'priority'    // {entryId, priority}
  | 'pause' | 'resume'

export const PRIORITY_RANK: Record<string, number> = { NORMAL: 0, PRIORITY: 1, VIP: 2, EMERGENCY: 3 }
export const PRIORITY_FA: Record<string, string> = { NORMAL: 'عادی', PRIORITY: 'ویژه', VIP: 'VIP', EMERGENCY: 'فوری' }

const rankOf = (p: string) => PRIORITY_RANK[p] ?? 0

/** Entry states that still occupy the queue. */
export const ACTIVE_ENTRY_STATES = ['WAITING', 'CALLED', 'IN_SERVICE']
/** `next` only auto-calls customers whose slot is within this window (or who already arrived). */
export const EARLY_CALL_MINUTES = 30

// ───────────────────────── ETA ─────────────────────────
// The engine serves one customer at a time per queue, so ETA is simply
// (people ahead × average service time) plus half an average slot if someone is being served now.
export function estimateWait(peopleAhead: number, avgServiceMin: number, busy: boolean): number {
  const avg = Math.max(1, avgServiceMin)
  return peopleAhead * avg + (busy ? Math.round(avg / 2) : 0)
}

/** Has the customer arrived (walk-in / checked-in) or is their slot close enough to be called? */
export function isEligibleForAutoCall(
  e: { appointment: { status: string; scheduledAt: Date } },
  now: Date,
): boolean {
  if (e.appointment.status === 'WAITING') return true
  return e.appointment.scheduledAt.getTime() <= now.getTime() + EARLY_CALL_MINUTES * 60_000
}

// ───────────────────────── queue / entry primitives ─────────────────────────
export async function getOrCreateQueue(client: Tx, branchId: string, serviceId: string, date: string) {
  const key = { branchId_serviceId_date: { branchId, serviceId, date } }
  const existing = await client.queue.findUnique({ where: key })
  if (existing) return existing
  const branch = await client.branch.findUnique({ where: { id: branchId } })
  if (!branch) throw new Error('branch not found')
  try {
    return await client.queue.create({ data: { tenantId: branch.tenantId, branchId, serviceId, date, status: 'OPEN' } })
  } catch (e) {
    const again = await client.queue.findUnique({ where: key })
    if (again) return again
    throw e
  }
}

/** Re-index WAITING entries to 1..n, preserving their current order. */
export async function recalculate(client: Tx, queueId: string): Promise<void> {
  const waiting = await client.queueEntry.findMany({
    where: { queueId, status: 'WAITING' },
    orderBy: [{ position: 'asc' }, { joinedAt: 'asc' }],
  })
  for (let i = 0; i < waiting.length; i++) {
    if (waiting[i].position !== i + 1) {
      await client.queueEntry.update({ where: { id: waiting[i].id }, data: { position: i + 1 } })
    }
  }
}

/** Insert `entryId` into the WAITING order of its queue. */
async function placeEntry(
  client: Tx,
  queueId: string,
  entryId: string,
  priority: string,
  scheduledAt: Date,
  atEnd: boolean,
): Promise<void> {
  const waiting = await client.queueEntry.findMany({
    where: { queueId, status: 'WAITING', id: { not: entryId } },
    include: { appointment: { select: { scheduledAt: true } } },
    orderBy: [{ position: 'asc' }, { joinedAt: 'asc' }],
  })
  let idx = waiting.length
  if (!atEnd) {
    const r = rankOf(priority)
    while (idx > 0) {
      const prev = waiting[idx - 1]
      const pr = rankOf(prev.priority)
      const prevComesAfterNew = pr < r || (pr === r && prev.appointment.scheduledAt.getTime() > scheduledAt.getTime())
      if (!prevComesAfterNew) break
      idx--
    }
  }
  const ids = waiting.map((w) => w.id)
  ids.splice(idx, 0, entryId)
  const current = new Map(waiting.map((w) => [w.id, w.position]))
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] === entryId || current.get(ids[i]) !== i + 1) {
      await client.queueEntry.update({ where: { id: ids[i] }, data: { position: i + 1 } })
    }
  }
}

async function enqueueInner(client: Tx, appointmentId: string, opts: { atEnd?: boolean; reposition?: boolean }): Promise<{ queueId: string } | null> {
  const appt = await client.appointment.findUnique({ where: { id: appointmentId } })
  if (!appt) return null
  const queue = await getOrCreateQueue(client, appt.branchId, appt.serviceId, dateKey(appt.scheduledAt))
  const existing = await client.queueEntry.findUnique({ where: { appointmentId } })

  // idempotent: already waiting in the right queue (booking route + check-in both call this)
  if (existing && existing.queueId === queue.id && existing.status === 'WAITING' && !opts.reposition) return { queueId: queue.id }

  const oldQueueId = existing && existing.queueId !== queue.id ? existing.queueId : null
  const entry = existing
    ? await client.queueEntry.update({
        where: { id: existing.id },
        data: {
          queueId: queue.id, status: 'WAITING', priority: appt.priority, joinedAt: new Date(),
          calledAt: null, startedAt: null, completedAt: null,
        },
      })
    : await client.queueEntry.create({
        data: { queueId: queue.id, appointmentId, position: 0, status: 'WAITING', priority: appt.priority },
      })
  await placeEntry(client, queue.id, entry.id, appt.priority, appt.scheduledAt, !!opts.atEnd)
  await recalculate(client, queue.id)
  if (oldQueueId) await recalculate(client, oldQueueId)
  return { queueId: queue.id }
}

/**
 * Put an appointment into its day-queue. Safe to call repeatedly:
 * the old implementation threw a unique-constraint error on check-in and reschedule
 * because every online booking already had a queue entry.
 */
export async function enqueueAppointment(
  appointmentId: string,
  opts: { atEnd?: boolean; reposition?: boolean } = {},
  client?: Tx,
): Promise<{ queueId: string } | null> {
  if (client) return enqueueInner(client, appointmentId, opts)
  return db.$transaction((tx) => enqueueInner(tx, appointmentId, opts), TX_OPTS)
}

// ───────────────────────── read models ─────────────────────────
export async function calcEta(queueId: string, entry?: { id: string } | null): Promise<{ peopleAhead: number; estimatedWait: number }> {
  const queue = await db.queue.findUnique({ where: { id: queueId } })
  if (!queue) return { peopleAhead: 0, estimatedWait: 0 }
  const [waiting, busyCount] = await Promise.all([
    db.queueEntry.findMany({ where: { queueId, status: 'WAITING' }, orderBy: { position: 'asc' } }),
    db.queueEntry.count({ where: { queueId, status: { in: ['CALLED', 'IN_SERVICE'] } } }),
  ])
  const busy = busyCount > 0
  if (!entry) return { peopleAhead: waiting.length, estimatedWait: estimateWait(waiting.length, queue.avgServiceMin, busy) }
  const me = waiting.find((w) => w.id === entry.id)
  if (!me) return { peopleAhead: 0, estimatedWait: 0 }
  const peopleAhead = waiting.filter((w) => w.position < me.position).length
  return { peopleAhead, estimatedWait: estimateWait(peopleAhead, queue.avgServiceMin, busy) }
}

/** Full live-state snapshot for a queue (booker + business views). */
export async function getLiveState(queueId: string) {
  const queue = await db.queue.findUnique({
    where: { id: queueId },
    include: { branch: true, service: true, tenant: { select: { id: true, name: true, logoText: true } } },
  })
  if (!queue) return null
  const entries = await db.queueEntry.findMany({
    where: { queueId },
    include: { appointment: { include: { customer: true, service: true, staff: true } } },
    orderBy: { position: 'asc' },
  })
  const waiting = entries.filter((e) => e.status === 'WAITING')
  const busy = entries.some((e) => e.status === 'CALLED' || e.status === 'IN_SERVICE')
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
    waiting: waiting.map((e, i) => ({
      id: e.id,
      code: e.appointment.code,
      position: e.position,
      peopleAhead: i,
      estimatedWait: estimateWait(i, queue.avgServiceMin, busy),
      priority: e.priority,
      status: e.status,
      token: e.appointment.liveToken,
      customerName: e.appointment.customer.name,
      joinedAt: e.joinedAt,
      scheduledAt: e.appointment.scheduledAt,
      arrived: e.appointment.status === 'WAITING',
    })),
    recent: entries
      .filter((e) => ['COMPLETED', 'SKIPPED', 'CANCELLED', 'NO_SHOW'].includes(e.status))
      .sort((a, b) => (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0))
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

// ───────────────────────── actions ─────────────────────────
interface NotifyJob {
  appointmentId: string
  type: NotificationType
  customerName: string
  mobile: string
  code: string
  scheduledAt: Date
  liveToken: string
}

type ActionArgs = {
  queueId: string
  action: QueueAction
  actor: string
  entryId?: string
  priority?: string
  position?: number
  direction?: 'up' | 'down' | 'top' | 'bottom'
  reason?: string
  /** set by customer-initiated flows where a "reason" makes no sense */
  bypassReason?: boolean
}

type ActionOutcome =
  | { ok: false; error: string }
  | { ok: true; jobs: NotifyJob[]; tenantId: string; tenantName: string; branchName: string; serviceName: string; sendCancelSms: boolean; targetEntryId?: string; callEvent: boolean }

const REASON_ACTIONS: QueueAction[] = ['skip', 'cancel', 'no_show', 'move']

async function runAction(tx: Tx, args: ActionArgs): Promise<ActionOutcome> {
  const queue = await tx.queue.findUnique({ where: { id: args.queueId }, include: { branch: true, service: true } })
  if (!queue) return { ok: false, error: 'صف یافت نشد' }
  const tenant = await tx.tenant.findUnique({ where: { id: queue.tenantId } })
  if (!tenant) return { ok: false, error: 'مستأجر یافت نشد' }

  if (tenant.reasonRequired && !args.bypassReason && REASON_ACTIONS.includes(args.action) && !args.reason?.trim()) {
    return { ok: false, error: 'ثبت دلیل برای این عملیات الزامی است' }
  }

  const entries = await tx.queueEntry.findMany({
    where: { queueId: queue.id },
    include: { appointment: { include: { customer: true } } },
    orderBy: [{ position: 'asc' }, { joinedAt: 'asc' }],
  })
  type Entry = (typeof entries)[number]
  const waiting = entries.filter((e) => e.status === 'WAITING')
  const serving = entries.find((e) => e.status === 'CALLED' || e.status === 'IN_SERVICE')
  const now = new Date()
  const jobs: NotifyJob[] = []
  let sendCancelSms = true
  try { sendCancelSms = JSON.parse(tenant.cancelPolicy || '{}').sendCancelSms !== false } catch { /* default */ }

  const job = (e: Entry, type: NotificationType) =>
    jobs.push({
      appointmentId: e.appointmentId, type, customerName: e.appointment.customer.name, mobile: e.appointment.customer.mobile,
      code: e.appointment.code, scheduledAt: e.appointment.scheduledAt, liveToken: e.appointment.liveToken,
    })
  const audit = (action: string, entityType: string, entityId: string, detail?: Record<string, unknown>) =>
    tx.auditLog.create({
      data: { tenantId: tenant.id, actor: args.actor, action, entityType, entityId, detail: detail ? JSON.stringify(detail) : null },
    })
  const findTarget = (): Entry | undefined => (args.entryId ? entries.find((e) => e.id === args.entryId) : serving)

  const completeServing = async (e: Entry) => {
    const data: Prisma.QueueUpdateInput = { currentServing: null }
    if (e.startedAt) {
      // learn the average service time (exponential moving average)
      const mins = Math.max(3, Math.round((now.getTime() - e.startedAt.getTime()) / 60000))
      data.avgServiceMin = Math.min(90, Math.round(queue.avgServiceMin * 0.7 + mins * 0.3))
    }
    await tx.queueEntry.update({ where: { id: e.id }, data: { status: 'COMPLETED', completedAt: now } })
    await tx.appointment.update({ where: { id: e.appointmentId }, data: { status: 'COMPLETED' } })
    await tx.queue.update({ where: { id: queue.id }, data })
    await audit('QUEUE_COMPLETE', 'QueueEntry', e.id, { code: e.appointment.code })
  }
  const callEntry = async (e: Entry, auditAction: string) => {
    await tx.queueEntry.update({ where: { id: e.id }, data: { status: 'CALLED', calledAt: now } })
    await tx.appointment.update({ where: { id: e.appointmentId }, data: { status: 'CALLED' } })
    await tx.queue.update({ where: { id: queue.id }, data: { currentServing: e.appointment.code } })
    job(e, 'CALLED')
    await audit(auditAction, 'QueueEntry', e.id, { code: e.appointment.code })
  }
  const clearServingIfTarget = async (e: Entry) => {
    if (serving && serving.id === e.id) await tx.queue.update({ where: { id: queue.id }, data: { currentServing: null } })
  }

  let targetEntryId: string | undefined
  let callEvent = false

  switch (args.action) {
    case 'next': {
      if (queue.status === 'PAUSED') return { ok: false, error: 'صف متوقف است؛ ابتدا آن را از سر بگیرید' }
      if (serving?.status === 'CALLED') return { ok: false, error: 'ابتدا سرویس نفر فراخوانده‌شده را آغاز یا رد کنید' }
      const next = waiting.find((e) => isEligibleForAutoCall(e, now))
      if (!next && !serving) {
        if (waiting.length === 0) break
        return { ok: false, error: 'هنوز زمان نوبت نفر بعدی نرسیده است. برای فراخوانی زودتر، او را به‌صورت دستی فراخوانی کنید.' }
      }
      if (serving) await completeServing(serving) // IN_SERVICE here
      if (next) { await callEntry(next, 'QUEUE_CALL_NEXT'); targetEntryId = next.id; callEvent = true }
      break
    }
    case 'call': {
      if (queue.status === 'PAUSED') return { ok: false, error: 'صف متوقف است؛ ابتدا آن را از سر بگیرید' }
      const target = entries.find((e) => e.id === args.entryId)
      if (!target) return { ok: false, error: 'نوبت یافت نشد' }
      if (target.status !== 'WAITING') return { ok: false, error: 'این نوبت در انتظار نیست' }
      if (serving?.status === 'CALLED') return { ok: false, error: 'ابتدا سرویس نفر فراخوانده‌شده را آغاز یا رد کنید' }
      if (serving) await completeServing(serving)
      await callEntry(target, 'QUEUE_CALL')
      targetEntryId = target.id; callEvent = true
      break
    }
    case 'recall': {
      if (!serving || serving.status !== 'CALLED') return { ok: false, error: 'نوبت فراخوانده‌شده‌ای وجود ندارد' }
      job(serving, 'CALLED')
      await audit('QUEUE_RECALL', 'QueueEntry', serving.id, { code: serving.appointment.code })
      targetEntryId = serving.id; callEvent = true
      break
    }
    case 'serve': {
      if (!serving || serving.status !== 'CALLED') return { ok: false, error: 'ابتدا نفر بعدی را فراخوانی کنید' }
      await tx.queueEntry.update({ where: { id: serving.id }, data: { status: 'IN_SERVICE', startedAt: now } })
      await tx.appointment.update({ where: { id: serving.appointmentId }, data: { status: 'IN_SERVICE' } })
      await audit('QUEUE_START_SERVICE', 'QueueEntry', serving.id, { code: serving.appointment.code })
      targetEntryId = serving.id
      break
    }
    case 'complete': {
      if (!serving) return { ok: false, error: 'نوبتی در حال سرویس نیست' }
      await completeServing(serving)
      targetEntryId = serving.id
      break
    }
    case 'skip':
    case 'no_show': {
      const target = findTarget()
      if (!target) return { ok: false, error: 'نوبت یافت نشد' }
      if (target.status !== 'WAITING' && target.status !== 'CALLED') return { ok: false, error: 'این نوبت دیگر فعال نیست' }
      const isSkip = args.action === 'skip'
      const status = isSkip ? 'SKIPPED' : 'NO_SHOW'
      await tx.queueEntry.update({ where: { id: target.id }, data: { status, completedAt: now } })
      await tx.appointment.update({ where: { id: target.appointmentId }, data: { status } })
      await clearServingIfTarget(target)
      if (!isSkip) job(target, 'NO_SHOW') // a skip sends no SMS: the old one rendered an empty "new position" message
      await audit(isSkip ? 'QUEUE_SKIP' : 'QUEUE_NO_SHOW', 'QueueEntry', target.id, { code: target.appointment.code, reason: args.reason || null })
      targetEntryId = target.id
      break
    }
    case 'cancel': {
      const target = findTarget()
      if (!target) return { ok: false, error: 'نوبت یافت نشد' }
      if (![...ACTIVE_ENTRY_STATES, 'SKIPPED'].includes(target.status)) return { ok: false, error: 'این نوبت دیگر قابل لغو نیست' }
      await tx.queueEntry.update({ where: { id: target.id }, data: { status: 'CANCELLED', completedAt: now } })
      await tx.appointment.update({ where: { id: target.appointmentId }, data: { status: 'CANCELLED' } })
      await clearServingIfTarget(target)
      job(target, 'CANCELLED')
      await audit('QUEUE_CANCEL', 'QueueEntry', target.id, { code: target.appointment.code, reason: args.reason || null })
      targetEntryId = target.id
      break
    }
    case 'requeue': {
      const target = entries.find((e) => e.id === args.entryId)
      if (!target) return { ok: false, error: 'نوبت یافت نشد' }
      if (target.status !== 'SKIPPED' && target.status !== 'NO_SHOW') return { ok: false, error: 'فقط نوبت ردشده یا غایب را می‌توان به صف بازگرداند' }
      await tx.queueEntry.update({
        where: { id: target.id },
        data: { status: 'WAITING', joinedAt: now, calledAt: null, startedAt: null, completedAt: null },
      })
      await tx.appointment.update({ where: { id: target.appointmentId }, data: { status: 'WAITING' } })
      await placeEntry(tx, queue.id, target.id, target.priority, target.appointment.scheduledAt, true)
      await audit('QUEUE_REQUEUE', 'QueueEntry', target.id, { code: target.appointment.code })
      targetEntryId = target.id
      break
    }
    case 'move': {
      if (!args.entryId) return { ok: false, error: 'نوبت مشخص نیست' }
      const target = waiting.find((e) => e.id === args.entryId)
      if (!target) return { ok: false, error: 'نوبت در وضعیت انتظار نیست' }
      const ordered = [...waiting]
      const idx = ordered.findIndex((e) => e.id === target.id)
      let newIdx = idx
      if (args.direction === 'up') newIdx = Math.max(0, idx - 1)
      else if (args.direction === 'down') newIdx = Math.min(ordered.length - 1, idx + 1)
      else if (args.direction === 'top') newIdx = 0
      else if (args.direction === 'bottom') newIdx = ordered.length - 1
      else if (typeof args.position === 'number' && Number.isFinite(args.position)) newIdx = Math.max(0, Math.min(ordered.length - 1, Math.floor(args.position) - 1))
      if (newIdx !== idx) {
        ordered.splice(newIdx, 0, ordered.splice(idx, 1)[0])
        for (let i = 0; i < ordered.length; i++) {
          if (ordered[i].position !== i + 1) await tx.queueEntry.update({ where: { id: ordered[i].id }, data: { position: i + 1 } })
        }
        await audit('QUEUE_MOVE', 'QueueEntry', target.id, { code: target.appointment.code, from: idx + 1, to: newIdx + 1, reason: args.reason || null })
      }
      targetEntryId = target.id
      break
    }
    case 'priority': {
      const target = entries.find((e) => e.id === args.entryId)
      if (!target) return { ok: false, error: 'نوبت یافت نشد' }
      if (target.status !== 'WAITING') return { ok: false, error: 'اولویت فقط برای نوبت‌های در انتظار قابل تغییر است' }
      if (!args.priority || !(args.priority in PRIORITY_RANK)) return { ok: false, error: 'اولویت نامعتبر است' }
      await tx.queueEntry.update({ where: { id: target.id }, data: { priority: args.priority } })
      await tx.appointment.update({ where: { id: target.appointmentId }, data: { priority: args.priority } })
      // a priority change must actually move the customer in the queue
      await placeEntry(tx, queue.id, target.id, args.priority, target.appointment.scheduledAt, false)
      await audit('QUEUE_PRIORITY', 'QueueEntry', target.id, { code: target.appointment.code, priority: args.priority })
      targetEntryId = target.id
      break
    }
    case 'pause': {
      await tx.queue.update({ where: { id: queue.id }, data: { status: 'PAUSED' } })
      await audit('QUEUE_PAUSE', 'Queue', queue.id)
      break
    }
    case 'resume': {
      await tx.queue.update({ where: { id: queue.id }, data: { status: 'OPEN' } })
      await audit('QUEUE_RESUME', 'Queue', queue.id)
      break
    }
    default:
      return { ok: false, error: 'عملیات نامعتبر' }
  }

  await recalculate(tx, queue.id)
  return {
    ok: true, jobs, tenantId: tenant.id, tenantName: tenant.name, branchName: queue.branch.name, serviceName: queue.service.name,
    sendCancelSms, targetEntryId, callEvent,
  }
}

async function sendJobs(o: Extract<ActionOutcome, { ok: true }>) {
  for (const j of o.jobs) {
    if (j.type === 'CANCELLED' && !o.sendCancelSms) continue
    await queueNotification({
      tenantId: o.tenantId,
      appointmentId: j.appointmentId,
      type: j.type,
      recipient: j.mobile,
      vars: buildTemplateVars({
        customerName: j.customerName, businessName: o.tenantName, branchName: o.branchName, serviceName: o.serviceName,
        appointmentCode: j.code, scheduledAt: j.scheduledAt, liveToken: j.liveToken, queue: null,
      }),
      material: true,
    })
  }
}

/**
 * Heads-up SMS, at most once per day per customer and type:
 *  - first eligible customer  → YOUR_TURN
 *  - second eligible customer → QUEUE_CHANGED
 * The old code re-sent a QUEUE_CHANGED SMS to the two closest customers after EVERY queue
 * action (spam), and also texted people whose appointment was hours away.
 */
async function notifyUpcoming(queueId: string, tenant: { id: string; name: string }) {
  const queue = await db.queue.findUnique({ where: { id: queueId }, include: { branch: true, service: true } })
  if (!queue || queue.status === 'PAUSED') return
  const waiting = await db.queueEntry.findMany({
    where: { queueId, status: 'WAITING' },
    orderBy: { position: 'asc' },
    include: { appointment: { include: { customer: true } } },
  })
  const busy = (await db.queueEntry.count({ where: { queueId, status: { in: ['CALLED', 'IN_SERVICE'] } } })) > 0
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const eligible = waiting.filter((e) => isEligibleForAutoCall(e, now)).slice(0, 2)
  for (let i = 0; i < eligible.length; i++) {
    const e = eligible[i]
    const type: NotificationType = i === 0 ? 'YOUR_TURN' : 'QUEUE_CHANGED'
    const already = await db.notification.findFirst({
      where: { appointmentId: e.appointmentId, type, createdAt: { gte: startOfDay } },
      select: { id: true },
    })
    if (already) continue
    const peopleAhead = waiting.filter((x) => x.position < e.position).length
    await queueNotification({
      tenantId: tenant.id,
      appointmentId: e.appointmentId,
      type,
      recipient: e.appointment.customer.mobile,
      vars: buildTemplateVars({
        customerName: e.appointment.customer.name, businessName: tenant.name, branchName: queue.branch.name,
        serviceName: queue.service.name, appointmentCode: e.appointment.code, scheduledAt: e.appointment.scheduledAt,
        liveToken: e.appointment.liveToken,
        queue: { position: e.position, peopleAhead, estimatedWait: estimateWait(peopleAhead, queue.avgServiceMin, busy) },
      }),
      material: true,
    })
  }
}

/** Push fresh state to the business panel and to every participant's live page. */
export async function broadcastQueueState(queueId: string, opts: { targetEntryId?: string; callEvent?: boolean; action?: string } = {}) {
  const queue = await db.queue.findUnique({ where: { id: queueId } })
  if (!queue) return
  const [state, participants] = await Promise.all([
    getLiveState(queueId),
    db.queueEntry.findMany({ where: { queueId }, include: { appointment: { select: { liveToken: true } } } }),
  ])
  if (!state) return
  const now = new Date().toISOString()
  const jobs: Promise<void>[] = []
  for (const w of state.waiting) {
    jobs.push(broadcastQueueUpdate(queue.tenantId, w.token, {
      queueId, event: 'queue.updated', position: w.peopleAhead + 1, peopleAhead: w.peopleAhead, estimatedWait: w.estimatedWait,
    }))
  }
  const target = opts.targetEntryId ? participants.find((p) => p.id === opts.targetEntryId) : undefined
  if (target) {
    jobs.push(broadcastQueueUpdate(queue.tenantId, target.appointment.liveToken, {
      queueId, event: opts.callEvent ? 'appointment.called' : 'queue.updated', position: 0, peopleAhead: 0, estimatedWait: 0,
    }))
  }
  jobs.push(broadcast(
    [`t:${queue.tenantId}`, ...participants.map((p) => `q:${p.appointment.liveToken}`)],
    'queue.activity',
    { queueId, servingCode: queue.currentServing, action: opts.action ?? 'update', at: now },
  ))
  await Promise.all(jobs)
}

/** Execute a queue action atomically (see header). */
export async function executeQueueAction(args: ActionArgs): Promise<{ ok: boolean; error?: string; snapshot?: QueueSnapshot }> {
  let outcome: ActionOutcome
  try {
    outcome = await db.$transaction((tx) => runAction(tx, args), TX_OPTS)
  } catch (e) {
    console.error('queue action failed', e)
    return { ok: false, error: 'خطا در اجرای عملیات؛ دوباره تلاش کنید' }
  }
  if (!outcome.ok) return { ok: false, error: outcome.error }

  // ── post-commit side effects: failures here never undo the queue change ──
  try {
    await sendJobs(outcome)
    await broadcastQueueState(args.queueId, { targetEntryId: outcome.targetEntryId, callEvent: outcome.callEvent, action: args.action })
    if (['next', 'call', 'skip', 'cancel', 'no_show', 'complete', 'move', 'requeue'].includes(args.action)) {
      await notifyUpcoming(args.queueId, { id: outcome.tenantId, name: outcome.tenantName })
    }
  } catch (e) {
    console.error('queue side effects failed', e)
  }
  const snapshot = await getLiveState(args.queueId)
  return { ok: true, snapshot: snapshot || undefined }
}

/**
 * Cancel an appointment through the one correct path (used by the business panel and by the
 * customer's own "cancel" button): updates entry + appointment, frees the "now serving" slot,
 * re-indexes positions, notifies and broadcasts.
 */
export async function cancelAppointment(args: {
  appointmentId: string
  actor: string
  reason?: string
  bypassReason?: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const entry = await db.queueEntry.findUnique({ where: { appointmentId: args.appointmentId } })
  if (entry) {
    const r = await executeQueueAction({
      queueId: entry.queueId, action: 'cancel', entryId: entry.id, actor: args.actor, reason: args.reason, bypassReason: args.bypassReason,
    })
    return { ok: r.ok, error: r.error }
  }
  // appointment without a queue entry (legacy data): plain status change
  await db.appointment.update({ where: { id: args.appointmentId }, data: { status: 'CANCELLED' } })
  return { ok: true }
}

/** Customer arrived: make sure they are in the queue and flagged as present. */
export async function checkInAppointment(appointmentId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.appointment.update({ where: { id: appointmentId }, data: { status: 'WAITING' } })
    // skipped / no-show latecomers go to the back; everyone else keeps their slot-based place
    const entry = await tx.queueEntry.findUnique({ where: { appointmentId } })
    const late = !!entry && (entry.status === 'SKIPPED' || entry.status === 'NO_SHOW')
    await enqueueInner(tx, appointmentId, { atEnd: late })
  }, TX_OPTS)
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
  const priority = args.priority && args.priority in PRIORITY_RANK ? args.priority : 'NORMAL'
  try {
    const created = await db.$transaction(async (tx) => {
      const [service, branch, tenant] = await Promise.all([
        tx.service.findUnique({ where: { id: args.serviceId } }),
        tx.branch.findUnique({ where: { id: args.branchId } }),
        tx.tenant.findUnique({ where: { id: args.tenantId } }),
      ])
      if (!service || !branch || !tenant) return null
      const now = new Date()
      const code = await generateUniqueCode(tx, 'W')
      const customer = await tx.customer.upsert({
        where: { tenantId_mobile: { tenantId: args.tenantId, mobile: args.mobile } },
        update: { name: args.customerName },
        create: { tenantId: args.tenantId, name: args.customerName, mobile: args.mobile },
      })
      const appt = await tx.appointment.create({
        data: {
          tenantId: args.tenantId, branchId: args.branchId, serviceId: args.serviceId, staffId: args.staffId || null,
          customerId: customer.id, code, scheduledAt: now, durationMin: service.duration,
          status: 'WAITING', source: 'WALK_IN', priority, liveToken: crypto.randomUUID().replace(/-/g, ''),
        },
      })
      const q = await enqueueInner(tx, appt.id, {})
      await tx.auditLog.create({
        data: { tenantId: args.tenantId, actor: args.actor, action: 'APPOINTMENT_WALK_IN', entityType: 'Appointment', entityId: appt.id, detail: JSON.stringify({ code }) },
      })
      return { token: appt.liveToken, code, queueId: q?.queueId }
    }, TX_OPTS)
    if (!created) return { ok: false, error: 'اطلاعات ناقص' }
    if (created.queueId) await broadcastQueueState(created.queueId, { action: 'WALK_IN' }).catch(() => {})
    return { ok: true, token: created.token, code: created.code }
  } catch (e) {
    console.error('walk-in failed', e)
    return { ok: false, error: 'خطا در ثبت نوبت حضوری' }
  }
}
