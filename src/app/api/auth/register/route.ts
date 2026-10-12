import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/** Public registration -- submits a signup request held in PENDING until the
 * platform admin approves it in admin/users (which issues credentials).
 * No password is stored here; no privileged role can be requested.
 */

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'درخواست نامعتبر' }, { status: 400 })
  }

  const { name, email, mobile, plannedBusinessName } = body as {
    name?: string
    email?: string
    mobile?: string
    plannedBusinessName?: string
  }

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'نام شما الزامی است' }, { status: 400 })
  }
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'ایمیل معتبر الزامی است' }, { status: 400 })
  }
  if (mobile && typeof mobile === 'string' && !/^09\d{9}$/.test(mobile)) {
    return NextResponse.json({ error: 'موبایل معتبر نیست (مثال: 09123456789)' }, { status: 400 })
  }

  const normalized = email.toLowerCase()
  const existing = await db.user.findUnique({ where: { email: normalized } })

  if (existing && existing.status === 'ACTIVE') {
    return NextResponse.json({ error: 'این ایمیل قبلاً ثبت شده است' }, { status: 409 })
  }

  // PENDING re-submit: refresh the request details
  if (existing && existing.status === 'PENDING') {
    await db.user.update({
      where: { id: existing.id },
      data: {
        name: name.trim(),
        mobile: (mobile || '').trim() || existing.mobile,
        plannedBusinessName: (plannedBusinessName || '').trim() || null,
      },
    })
    return NextResponse.json({
      ok: true,
      message: 'درخواست شما قبلاً ثبت شده است؛ اطلاعات به‌روزرسانی شد. مدیر پلتفرم بررسی می‌کند.',
      pending: true,
    })
  }

  // DISABLED (previously rejected): re-submission moves the request back to PENDING
  if (existing && existing.status === 'DISABLED') {
    await db.user.update({
      where: { id: existing.id },
      data: {
        name: name.trim(),
        mobile: (mobile || '').trim() || existing.mobile,
        plannedBusinessName: (plannedBusinessName || '').trim() || null,
        status: 'PENDING',
      },
    })
    return NextResponse.json({
      ok: true,
      message: 'درخواست جدید شما ثبت شد. مدیر پلتفرم بررسی می‌کند.',
      pending: true,
    })
  }

  await db.user.create({
    data: {
      tenantId: null,
      name: name.trim(),
      email: normalized,
      mobile: (mobile || '').trim() || null,
      passwordHash: '',
      role: 'TENANT_OWNER',
      status: 'PENDING',
      plannedBusinessName: (plannedBusinessName || '').trim() || null,
    },
  })

  return NextResponse.json({
    ok: true,
    message: 'درخواست ثبت ارسال شد. مدیر پلتفرم تأیید می‌کند.',
    pending: true,
  })
}

/** GET -- registration is POST-only. */
export async function GET() {
  return NextResponse.json({ ok: false }, { status: 404 })
}
