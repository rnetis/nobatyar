import { db } from '@/lib/db'
import { formatJalaliFull, formatTime, faDigits, minutesFa } from '@/lib/jalali'

/**
 * Notification Engine (PRD §19–21, §44)
 * Transactional Outbox: notifications are persisted first, a worker-ish
 * flush marks them SENT (simulated provider). SMS must never block booking.
 */

export type NotificationType =
  | 'BOOKING_CREATED'
  | 'QUEUE_CHANGED'
  | 'RESCHEDULED'
  | 'CANCELLED'
  | 'YOUR_TURN'
  | 'CALLED'
  | 'NO_SHOW'

export interface TemplateVars {
  customer_name?: string
  business_name?: string
  branch_name?: string
  service_name?: string
  appointment_number?: string
  appointment_date?: string
  appointment_time?: string
  queue_position?: string
  people_ahead?: string
  estimated_wait?: string
  live_queue_url?: string
}

export function renderTemplate(tpl: string, vars: TemplateVars): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = (vars as Record<string, string | undefined>)[key]
    return v !== undefined ? v : ''
  })
}

function defaultBody(type: NotificationType, v: TemplateVars): string {
  const link = v.live_queue_url || ''
  switch (type) {
    case 'BOOKING_CREATED':
      return `نوبت شما ثبت شد.\n${v.business_name} | ${v.service_name}\n${v.appointment_date} ساعت ${v.appointment_time}\nشماره نوبت: ${v.appointment_number}\nمشاهده صف زنده: ${link}`
    case 'QUEUE_CHANGED':
      return `وضعیت نوبت شما تغییر کرد.\nجایگاه جدید: ${v.queue_position} | نفرات قبل از شما: ${v.people_ahead}\nزمان تقریبی انتظار: ${v.estimated_wait}\nمشاهده صف زنده: ${link}`
    case 'RESCHEDULED':
      return `زمان نوبت شما تغییر کرد.\nزمان جدید: ${v.appointment_date} ساعت ${v.appointment_time}\nشماره نوبت: ${v.appointment_number}\nمشاهده صف زنده: ${link}`
    case 'CANCELLED':
      return `نوبت شما (${v.appointment_number}) لغو شد.\n${v.business_name}`
    case 'YOUR_TURN':
      return `نوبت شما نزدیک است! لطفاً آماده باشید.\nشماره نوبت: ${v.appointment_number}\nمشاهده صف زنده: ${link}`
    case 'CALLED':
      return `نوبت شما فراخوانده شد. لطفاً برای دریافت خدمت مراجعه کنید.\nشماره نوبت: ${v.appointment_number}`
    case 'NO_SHOW':
      return `به دلیل عدم حضور، نوبت شما (${v.appointment_number}) به عنوان No-show ثبت شد.\n${v.business_name}`
  }
}

export interface QueueStateForVars {
  position?: number | null
  peopleAhead?: number | null
  estimatedWait?: number | null
}

export function buildTemplateVars(args: {
  customerName: string
  businessName: string
  branchName?: string | null
  serviceName?: string | null
  appointmentCode: string
  scheduledAt?: Date | null
  liveToken?: string | null
  queue?: QueueStateForVars | null
}): TemplateVars {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  return {
    customer_name: args.customerName,
    business_name: args.businessName,
    branch_name: args.branchName || '',
    service_name: args.serviceName || '',
    appointment_number: args.appointmentCode,
    appointment_date: args.scheduledAt ? formatJalaliFull(args.scheduledAt) : '',
    appointment_time: args.scheduledAt ? formatTime(args.scheduledAt) : '',
    queue_position: args.queue?.position != null ? faDigits(args.queue.position) : '',
    people_ahead: args.queue?.peopleAhead != null ? faDigits(args.queue.peopleAhead) : '',
    estimated_wait: args.queue?.estimatedWait != null ? minutesFa(args.queue.estimatedWait) : '',
    live_queue_url: args.liveToken ? `${base}/#/q/${args.liveToken}` : '',
  }
}

/**
 * Persist an outbox notification (simulated SMS provider).
 * `material` = real change worth an SMS (PRD §21 anti-spam policy).
 */
export async function queueNotification(args: {
  tenantId: string
  appointmentId?: string | null
  type: NotificationType
  recipient: string
  vars: TemplateVars
  bodyOverride?: string
  material?: boolean
}): Promise<void> {
  try {
    const tenant = await db.tenant.findUnique({ where: { id: args.tenantId } })
    if (!tenant) return

    // Tenant-level policy gate (PRD §21)
    let policy: Record<string, unknown> = {}
    try { policy = JSON.parse(tenant.notifPolicy || '{}') } catch { /* noop */ }
    const eventFlag: Record<NotificationType, string> = {
      BOOKING_CREATED: 'smsOnBooking',
      QUEUE_CHANGED: 'smsOnQueueChange',
      RESCHEDULED: 'smsOnReschedule',
      CANCELLED: 'smsOnCancel',
      YOUR_TURN: 'smsBeforeTurn',
      CALLED: 'smsOnCalled',
      NO_SHOW: 'smsOnNoShow',
    }
    const flag = eventFlag[args.type]
    if (flag && policy[flag] === false) return
    // Minor queue updates (≤ threshold positions) → WebSocket only
    if (args.type === 'QUEUE_CHANGED' && args.material === false) return

    const body = args.bodyOverride || defaultBody(args.type, args.vars)
    const created = await db.notification.create({
      data: {
        tenantId: args.tenantId,
        appointmentId: args.appointmentId || null,
        type: args.type,
        channel: 'SMS',
        recipient: args.recipient,
        body,
        status: 'PENDING',
      },
    })
    // Simulated provider flush (outbox worker)
    await db.notification.update({
      where: { id: created.id },
      data: { status: 'SENT', sentAt: new Date(), providerMessageId: `sim-${created.id.slice(-8)}` },
    })
  } catch (e) {
    console.error('notification error', e)
  }
}
