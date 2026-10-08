import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, setSessionCookie } from '@/lib/auth'

/** Login for Business & Super Admin panels */
export async function POST(req: Request) {
  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'درخواست نامعتبر' }, { status: 400 })
  }
  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''
  if (!email || !password) {
    return NextResponse.json({ error: 'ایمیل و رمز عبور الزامی است' }, { status: 400 })
  }

  const user = await db.user.findUnique({
    where: { email },
    include: { tenant: { select: { id: true, name: true, slug: true, status: true } } },
  })
  if (!user || user.passwordHash !== hashPassword(password) || user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'ایمیل یا رمز عبور اشتباه است' }, { status: 401 })
  }
  if (user.tenant && user.tenant.status === 'SUSPENDED') {
    return NextResponse.json({ error: 'حساب این کسب‌وکار موقتاً تعلیق شده است' }, { status: 403 })
  }

  await setSessionCookie({
    userId: user.id,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
  })

  await db.auditLog.create({
    data: {
      tenantId: user.tenantId,
      actor: user.name,
      role: user.role,
      action: 'AUTH_LOGIN',
      entityType: 'User',
      entityId: user.id,
    },
  })

  return NextResponse.json({
    user: { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId, tenantName: user.tenant?.name },
    redirect: user.tenantId ? '#/panel' : '#/admin',
  })
}
