import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminSession, requireSuperAdminSession } from '@/lib/auth'
import { sendViaSmsIr, sendViaHttpSms, sendViaWebhook, buildTemplateVars, queueNotification, sendSms, resolveSmsProvider, type SmsProviderConfig } from '@/lib/sms'

export async function GET(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const url = new URL(req.url)

  // Notification log
  const take = Math.min(200, Number(url.searchParams.get('take') || 100))
  const notifications = await db.notification.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    include: { tenant: { select: { name: true } }, appointment: { select: { code: true } } },
  })
  const [total, pending, sent, failed, thisMonth] = await Promise.all([
    db.notification.count(),
    db.notification.count({ where: { status: 'PENDING' } }),
    db.notification.count({ where: { status: 'SENT' } }),
    db.notification.count({ where: { status: 'FAILED' } }),
    db.notification.count({ where: { status: 'SENT', createdAt: { gte: new Date(new Date().setDate(1)) } } }),
  ])
  return NextResponse.json({ notifications, summary: { total, pending, sent, failed, thisMonth } })
}


/** Mark platform notifications read/clear (soft readAt flag; rows are never altered). */
export async function PATCH(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { ids, action } = body as { ids?: string[]; action?: 'ack' | 'clear' }
  if (!ids || !Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'آیدی‌های پیامک الزامی است' }, { status: 400 })
  if (action !== 'ack' && action !== 'clear') return NextResponse.json({ error: 'عملیات نامعتبر' }, { status: 400 })
  const updated = await db.notification.updateMany({
    where: { id: { in: ids } },
    data: {
      readAt: action === 'ack' ? new Date() : null,
    },
  })
  await db.auditLog.create({
    data: {
      actor: session.name, role: session.role, action: action === 'ack' ? 'PLATFORM_NOTIFICATION_ACK' : 'PLATFORM_NOTIFICATION_CLEAR',
      entityType: 'Notification', entityId: ids[0] || 'platform',
      detail: JSON.stringify({ count: updated.count, action }),
    },
  })
  return NextResponse.json({ ok: true, count: updated.count, action })
}

/**
 * Superadmin validates a provider by sending a single test SMS.
 * Credentials submitted here are only used for the reachability probe — the real
 * platform credentials live in env vars / platform secrets (never in the database).
 */
export async function PUT(req: Request) {
  const session = await requireSuperAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { provider, apiKey, lineNumber, fromNumber, testMobile } = body as {
    provider?: string; apiKey?: string; lineNumber?: string; fromNumber?: string; testMobile?: string
  }
  if (!provider || !['sms.ir', 'httpsms'].includes(provider)) {
    return NextResponse.json({ error: 'ارائه‌دهنده نامعتبر' }, { status: 400 })
  }

  // Validate reachability with a real test send (fire-and-forget audit only)
  const testResult = await (provider === 'sms.ir'
    ? sendViaSmsIr({ recipient: testMobile || '09120000000', messageText: 'تست پلتفرم: ارائه‌دهنده پیامک فعال شد.', config: { apiKey, lineNumber } })
    : sendViaHttpSms({ recipient: testMobile || '09120000000', messageText: 'تست پلتفرم: ارائه‌دهنده پیامک فعال شد.', config: { apiKey, from: fromNumber } }))

  if (!testResult.ok && testResult.configured) {
    return NextResponse.json({ error: `ارتباط با ارائه‌دهنده برقرار نشد: ${testResult.error}` }, { status: 400 })
  }
  if (!testResult.configured) {
    return NextResponse.json({ error: 'ارتباط برقرار نشد. کلیدها/شماره‌ها را بررسی کنید.' }, { status: 400 })
  }

  // Persist platform config markers (real secrets stay in env/platform secrets)
  // For now we just record success in audit so there's a record of which provider was validated.
  await db.auditLog.create({
    data: {
      actor: session.name, role: session.role, action: 'PLATFORM_SMS_PROVIDER_VALIDATE',
      entityType: 'SmsProvider', entityId: provider,
      detail: JSON.stringify({ provider, ok: testResult.ok, messageId: testResult.messageId, testedWith: testMobile || '09120000000' }),
    },
  })

  return NextResponse.json({
    ok: true,
    provider,
    testable: true,
    message: `ارتباط با ${provider} برقرار شد. برای فعال‌سازی پلتفرم، مقادیر را در Secrets پلتفرم تنظیم کنید.`,
  })
}

/** Superadmin sends a one-off test SMS through the platform default provider. */
export async function POST(req: Request) {
  const session = await requireSuperAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { action, mobile, messageText, tenantId } = body as {
    action?: string; mobile?: string; messageText?: string; tenantId?: string
  }
  if (action === 'test-send') {
    if (!mobile || !/^09\d{9}$/.test(mobile)) return NextResponse.json({ error: 'شماره موبایل معتبر وارد کنید' }, { status: 400 })
    if (!messageText || typeof messageText !== 'string') return NextResponse.json({ error: 'متن پیامک الزامی است' }, { status: 400 })
    const created = await db.notification.create({
      data: {
        tenantId: (tenantId || '').trim() || null,
        appointmentId: null,
        type: 'PLATFORM_TEST',
        channel: 'SMS',
        recipient: mobile.trim(),
        body: messageText.trim(),
        status: 'PENDING',
      },
    })
    // When a tenant is given, test through that tenant's own provider config;
    // otherwise use the platform-wide provider.
    const tenantRow = (tenantId || '').trim()
      ? await db.tenant.findUnique({
          where: { id: (tenantId as string).trim() },
          select: { id: true, smsConfig: true, smsProvider: true },
        })
      : null
    const provider = resolveSmsProvider(tenantRow ?? { smsConfig: null, smsProvider: null })
    const sms = await sendSms({ recipient: mobile.trim(), messageText: messageText.trim(), provider })
    await db.notification.update({
      where: { id: created.id },
      data: { status: sms.ok && sms.configured ? 'SENT' : (sms.configured ? 'FAILED' : 'PENDING'), sentAt: sms.ok && sms.configured ? new Date() : null, providerMessageId: sms.messageId || null },
    })
    await db.auditLog.create({
      data: {
        actor: session.name, role: session.role, action: 'PLATFORM_SMS_TEST',
        entityType: 'Notification', entityId: created.id,
        detail: JSON.stringify({ recipient: mobile.trim(), ok: sms.ok, messageId: sms.messageId, error: sms.error }),
      },
    })
    return NextResponse.json({
      ok: sms.ok || !sms.configured,
      sent: sms.ok && sms.configured,
      provider: provider.provider,
      messageId: sms.messageId,
      error: sms.error,
      message: sms.ok ? 'تست پیامک ارسال شد.' : (sms.configured ? 'ارسال ناموفق — خطا در ارتباط.' : 'هیچ ارائه‌دهنده‌ای پلتفرم تنظیم نشده؛ پیامک در صادره باقی ماند.'),
    })
  }
  // existing broadcast path
  return await sendPlatformSms(session, body)
}

async function sendPlatformSms(session: NonNullable<Awaited<ReturnType<typeof requireSuperAdminSession>>>, body: Record<string, unknown>) {
  const { mobile, mobiles, messageText, tenantId } = body as {
    mobile?: string; mobiles?: string[]; messageText?: string; tenantId?: string
  }
  if (!messageText || typeof messageText !== 'string' || messageText.trim().length === 0) {
    return NextResponse.json({ error: 'متن پیامک الزامی است' }, { status: 400 })
  }
  const rawRecipients: string[] = Array.isArray(mobiles) ? mobiles : (mobile ? [mobile] : [])
  const recipients = rawRecipients.filter(
    (m): m is string => typeof m === 'string' && /^09\d{9}$/.test(m.trim()),
  )
  if (recipients.length === 0) return NextResponse.json({ error: 'شماره موبایل معتبر وارد کنید' }, { status: 400 })
  const targetTenantId = (tenantId || '').trim() || null

  let okCount = 0
  let failCount = 0
  const results: { recipient: string; ok: boolean; messageId?: string; reason?: string }[] = []

  const provider = resolveSmsProvider({ smsConfig: null, smsProvider: null } as Parameters<typeof resolveSmsProvider>[0])

  for (const phone of recipients) {
    const created = await db.notification.create({
      data: {
        tenantId: targetTenantId,
        appointmentId: null,
        type: 'PLATFORM_BROADCAST',
        channel: 'SMS',
        recipient: phone.trim(),
        body: messageText.trim(),
        status: 'PENDING',
      },
    })
    const sms = await sendSms({ recipient: phone.trim(), messageText: messageText.trim(), provider })
    if (sms.ok && sms.configured) {
      await db.notification.update({
        where: { id: created.id },
        data: { status: 'SENT', sentAt: new Date(), providerMessageId: sms.messageId },
      })
      okCount++
      results.push({ recipient: phone.trim(), ok: true, messageId: sms.messageId })
    } else {
      await db.notification.update({ where: { id: created.id }, data: { status: sms.configured ? 'FAILED' : 'PENDING' } })
      failCount++
      results.push({ recipient: phone.trim(), ok: false, reason: sms.error })
    }
    await sendViaWebhook({ notification: created, tenantId: targetTenantId || 'platform', type: 'PLATFORM_BROADCAST' }).catch(() => {})
  }

  await db.auditLog.create({
    data: {
      actor: session.name, role: session.role, action: 'PLATFORM_SMS_SEND',
      entityType: 'Notification', entityId: results[0]?.recipient || 'platform',
      detail: JSON.stringify({ okCount, failCount, recipientCount: recipients.length, tenantId: targetTenantId, provider: provider.provider }),
    },
  })

  return NextResponse.json({
    ok: true,
    sent: okCount,
    failed: failCount,
    results: results.slice(0, 200),
    message: `پیامک ارسال شد: ${okCount} موفق، ${failCount} مشکل.`,
  })
}
