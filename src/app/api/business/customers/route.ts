import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBusinessSession } from '@/lib/auth'
import { buildTemplateVars, queueNotification } from '@/lib/sms'

/** Customer list (PRD: older clients) + SMS invite to book a new appointment.
 *  GET  -> customers with visit stats (count + last visit), optional `q` filter
 *  POST -> invite selected customers (by id) to book, respecting the plan SMS quota
 */

export async function GET(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const url = new URL(req.url)
  const q = url.searchParams.get('q')
  const take = Math.min(500, Number(url.searchParams.get('take') || 200))

  const customers = await db.customer.findMany({
    where: {
      tenantId: session.tenantId,
      ...(q ? { OR: [{ name: { contains: q } }, { mobile: { contains: q } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      appointments: {
        select: { scheduledAt: true, status: true },
      },
    },
  })

  const rows = customers.map((c) => {
    const done = c.appointments.filter((a) => a.status === 'COMPLETED')
    const last = done.length > 0
      ? done.reduce((m, a) => (a.scheduledAt > m ? a.scheduledAt : m), done[0].scheduledAt)
      : null
    return {
      id: c.id,
      name: c.name,
      mobile: c.mobile,
      email: c.email,
      note: c.note,
      visits: done.length,
      lastVisit: last,
      createdAt: c.createdAt,
    }
  })
  // most recent customers first, then by visit count
  rows.sort((a, b) => (b.lastVisit?.getTime() || 0) - (a.lastVisit?.getTime() || 0) || b.visits - a.visits)

  return NextResponse.json({ customers: rows })
}

/** Invite selected customers via SMS to book a new appointment. */
export async function POST(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { ids, messageText } = body as { ids?: string[]; messageText?: string }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'حداقل یک مشتری را انتخاب کنید' }, { status: 400 })
  }

  const tenant = await db.tenant.findUnique({
    where: { id: session.tenantId },
    include: { plan: { select: { smsQuota: true } } },
  })
  if (!tenant) return NextResponse.json({ error: 'مستأجر یافت نشد' }, { status: 404 })

  // SMS quota (plan-based, per calendar month)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const [sentThisMonth, quotaLeft] = await Promise.all([
    db.notification.count({
      where: { tenantId: session.tenantId, status: 'SENT', sentAt: { gte: monthStart } },
    }),
    Promise.resolve(tenant.plan?.smsQuota ?? 0),
  ])

  const targets = await db.customer.findMany({
    where: { id: { in: ids }, tenantId: session.tenantId },
  })
  if (targets.length === 0) return NextResponse.json({ error: 'مشتری یافت نشد' }, { status: 404 })

  const bookingUrl = `${process.env.NEXT_PUBLIC_BASE_URL || ''}/#book/${tenant.slug}`
  const customMsg = typeof messageText === 'string' && messageText.trim() ? messageText.trim() : null

  let invited = 0
  let skipped = 0
  const quota = quotaLeft - sentThisMonth

  for (const c of targets) {
    if (!/^09\d{9}$/.test(c.mobile)) { skipped++; continue }
    if (quota !== null && quota !== undefined && sentThisMonth + invited >= (tenant.plan?.smsQuota ?? 0)) {
      skipped++
      continue
    }
    const vars = buildTemplateVars({
      customerName: c.name,
      businessName: tenant.name,
      appointmentCode: customMsg ? '' : 'نوبت جدید',
      scheduledAt: null,
    })
    const body = customMsg
      ? `${c.name} عزیز، ${customMsg} | ${tenant.name}`
      : `${c.name} عزیز، نوبت جدید رزرو کنید: ${bookingUrl} | ${tenant.name}`
    await queueNotification({
      tenantId: session.tenantId,
      type: 'INVITE',
      recipient: c.mobile,
      vars,
      bodyOverride: body,
    })
    invited++
  }

  await db.auditLog.create({
    data: {
      tenantId: session.tenantId,
      actor: session.name,
      role: session.role,
      action: 'CUSTOMER_INVITE',
      entityType: 'Customer',
      entityId: ids[0] || null,
      detail: JSON.stringify({ invited, skipped, total: targets.length }),
    },
  })

  return NextResponse.json({
    ok: true,
    invited,
    skipped,
    message: `دعوت‌نامه ارسال شد: ${invited} مشتری، ${skipped} رد شده.`,
  })
}
