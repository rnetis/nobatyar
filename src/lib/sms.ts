import { db } from '@/lib/db'
import { formatJalaliFull, formatTime, faDigits, minutesFa } from '@/lib/jalali'

/**
 * Notification Engine (PRD §19–21, §44)
 * Transactional Outbox: notifications are persisted first, then delivered via:
 *  1. sms.ir bulk SMS API  (SMSIR_API_KEY + SMSIR_LINE_NUMBER)
 *  2. an optional webhook  (NOTIFICATION_WEBHOOK_URL) — POST JSON, signed with
 *     NOTIFICATION_WEBHOOK_SECRET when provided
 * Delivery is fire-and-forget: SMS must never block or fail a booking.
 * Without credentials, messages stay PENDING in the outbox (visible in the
 * business panel SMS log) instead of being marked sent.
 */

const SMSIR_API_URL = 'https://api.sms.ir/v1/send/bulk'

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

    // Deliver via sms.ir + optional webhook (outbox worker flush)
    const [smsResult] = await Promise.allSettled([
      sendViaSmsIr({ recipient: args.recipient, messageText: body }),
      sendViaWebhook({ notification: created, tenantId: args.tenantId, type: args.type }),
    ])

    const sms = smsResult.status === 'fulfilled' ? smsResult.value : { ok: false as const, configured: true, error: String(smsResult.reason) }
    if (sms.ok) {
      await db.notification.update({
        where: { id: created.id },
        data: { status: 'SENT', sentAt: new Date(), providerMessageId: sms.messageId },
      })
    } else if (sms.configured) {
      // provider was configured but delivery failed → mark FAILED for retry/inspection
      await db.notification.update({
        where: { id: created.id },
        data: { status: 'FAILED' },
      })
      console.error('sms delivery failed', sms.error)
    }
    // not configured → stays PENDING in the outbox (visible in the SMS log)
  } catch (e) {
    console.error('notification error', e)
  }
}

interface SmsIrResult {
  ok: boolean
  configured: boolean
  messageId?: string
  error?: string
}

/**
 * Send an SMS via the sms.ir bulk API.
 * Requires SMSIR_API_KEY and SMSIR_LINE_NUMBER env vars; when either is
 * missing the message is left in the outbox (PENDING) and nothing is sent.
 * Docs: https://documenter.getpostman.com/view/5019639/2sA35D6aM2 (sms.ir v1)
 */
async function sendViaSmsIr(args: {
  recipient: string
  messageText: string
}): Promise<SmsIrResult> {
  const apiKey = process.env.SMSIR_API_KEY
  const lineNumber = process.env.SMSIR_LINE_NUMBER
  if (!apiKey || !lineNumber) {
    return { ok: false, configured: false, error: 'SMSIR_API_KEY / SMSIR_LINE_NUMBER not configured — kept in outbox' }
  }
  try {
    const res = await fetch(SMSIR_API_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lineNumber: Number(lineNumber),
        messageText: args.messageText,
        mobiles: [args.recipient],
        sendDateTime: null,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    const json = (await res.json().catch(() => null)) as { status?: number; message?: string; data?: { id?: number | string; packagedMessageId?: number | string } } | null
    if (!res.ok || !json || (typeof json.status === 'number' && json.status !== 1)) {
      return { ok: false, configured: true, error: `sms.ir error ${res.status}: ${JSON.stringify(json)}` }
    }
    return { ok: true, configured: true, messageId: String(json.data?.id ?? json.data?.packagedMessageId ?? crypto.randomUUID()) }
  } catch (e) {
    return { ok: false, configured: true, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Optional generic webhook: POSTs the notification payload as JSON to
 * NOTIFICATION_WEBHOOK_URL. When NOTIFICATION_WEBHOOK_SECRET is set, the
 * request carries an X-Nobaar-Signature HMAC-SHA256 header of the raw body.
 * A webhook failure never fails SMS delivery (both are independent).
 */
async function sendViaWebhook(args: {
  notification: { id: string; type: string; recipient: string; body: string; tenantId: string; appointmentId: string | null; createdAt: Date }
  tenantId: string
  type: NotificationType
}): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.NOTIFICATION_WEBHOOK_URL
  if (!url) return { ok: true } // webhook optional — no-op success
  try {
    const payload = JSON.stringify({
      event: 'notification.created',
      type: args.type,
      channel: 'SMS',
      tenantId: args.tenantId,
      notificationId: args.notification.id,
      appointmentId: args.notification.appointmentId,
      recipient: args.notification.recipient,
      body: args.notification.body,
      createdAt: args.notification.createdAt.toISOString(),
    })
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const secret = process.env.NOTIFICATION_WEBHOOK_SECRET
    if (secret) {
      const { createHmac } = await import('crypto')
      headers['X-Nobaar-Signature'] = createHmac('sha256', secret).update(payload).digest('hex')
    }
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: payload,
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return { ok: false, error: `webhook error ${res.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
