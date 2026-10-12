import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, requireSuperAdminSession } from '@/lib/auth'

/** User provisioning -- SUPER_ADMIN only. There is no public self-registration:
 * every business-side account is created by the platform admin here (or via
 * admin tenant creation), with the initial password handed to the user once.
 */

// Business-side roles only; platform roles (SUPER_ADMIN/SUPPORT) are managed out-of-band.
const ROLE_OPTIONS = ['TENANT_OWNER', 'TENANT_ADMIN', 'MANAGER', 'OPERATOR', 'STAFF']

/** List users with optional filters (role, status, tenantId, q). */
export async function GET(req: Request) {
  const session = await requireSuperAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })

  const url = new URL(req.url)
  const role = url.searchParams.get('role')
  const status = url.searchParams.get('status')
  const tenantId = url.searchParams.get('tenantId')
  const q = url.searchParams.get('q')
  const take = Math.min(200, Number(url.searchParams.get('take') || 100))

  const where: Record<string, unknown> = {}
  if (role) where.role = role
  if (status) where.status = status
  if (tenantId) where.tenantId = tenantId
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { email: { contains: q } },
      { mobile: { contains: q } },
    ]
  }

  const users = await db.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true, tenantId: true, name: true, email: true, mobile: true,
      role: true, status: true, plannedBusinessName: true, createdAt: true,
    },
  })
  const total = await db.user.count({ where })

  // Registration requests awaiting review (shown in the approvals strip)
  const pending = status === 'PENDING' ? [] : await db.user.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, name: true, email: true, mobile: true,
      role: true, plannedBusinessName: true, createdAt: true,
    },
  })

  return NextResponse.json({ users, total, pending })
}

/** Create a user (SUPER_ADMIN only) -- the only account-creation endpoint. */
export async function POST(req: Request) {
  const session = await requireSuperAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'درخواست نامعتبر' }, { status: 400 })
  }

  const { tenantId, name, email, mobile, role } = body as {
    tenantId?: string
    name?: string
    email?: string
    mobile?: string
    role?: string
  }

  if (!name || typeof name !== 'string') return NextResponse.json({ error: 'نام الزامی است' }, { status: 400 })
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'ایمیل معتبر الزامی است' }, { status: 400 })
  }
  if (mobile && !/^09\d{9}$/.test(mobile)) {
    return NextResponse.json({ error: 'موبایل معتبر نیست (مثال: 09123456789)' }, { status: 400 })
  }

  const finalRole = (role || 'TENANT_OWNER').toUpperCase()
  if (!ROLE_OPTIONS.includes(finalRole)) {
    return NextResponse.json({ error: 'نقش‌های پلتفرمی از این مسیر قابل تخصیص نیستند' }, { status: 403 })
  }

  const normalizedEmail = email.toLowerCase()
  const existing = await db.user.findUnique({ where: { email: normalizedEmail } })
  if (existing) return NextResponse.json({ error: 'کاربری با این ایمیل قبلاً ساخته شده است' }, { status: 409 })

  // Strong one-time initial password, shown ONCE in this response
  const initialPassword = crypto.randomUUID().slice(0, 8) + crypto.randomUUID().slice(0, 8) + 'Aa1!'

  const user = await db.user.create({
    data: {
      tenantId: tenantId || null,
      name: name.trim(),
      email: normalizedEmail,
      mobile: (mobile || '').trim() || null,
      passwordHash: hashPassword(initialPassword),
      role: finalRole,
      status: 'ACTIVE',
    },
  })
  await db.auditLog.create({
    data: { actor: session.name, role: session.role, action: 'USER_CREATE', entityType: 'User', entityId: user.id, detail: JSON.stringify({ email: normalizedEmail, role: finalRole, tenantId: tenantId || null }) },
  })

  return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, initialPassword })
}

/** Update any user field(s) or reset password (SUPER_ADMIN only). */
export async function PATCH(req: Request) {
  const session = await requireSuperAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'درخواست نامعتبر' }, { status: 400 })
  }

  const { id, email, action, tenantId, name, mobile, role, status, resetPassword } = body as {
    id?: string
    email?: string
    action?: 'approve' | 'reject'
    tenantId?: string | null
    name?: string
    mobile?: string
    role?: string
    status?: string
    resetPassword?: boolean
  }

  // ─── Registration review actions (by email) ───
  if (action === 'approve' || action === 'reject') {
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'ایمیل الزامی است' }, { status: 400 })
    }
    const normalizedEmail = email.toLowerCase()
    const pendingUser = await db.user.findUnique({ where: { email: normalizedEmail } })
    if (!pendingUser) return NextResponse.json({ error: 'درخواستی با این ایمیل یافت نشد' }, { status: 404 })

    if (action === 'reject') {
      if (pendingUser.status === 'DISABLED') {
        return NextResponse.json({ ok: true, message: 'این درخواست قبلاً رد شده است.' })
      }
      await db.user.update({ where: { id: pendingUser.id }, data: { status: 'DISABLED' } })
      await db.auditLog.create({
        data: { actor: session.name, role: session.role, action: 'USER_REJECT', entityType: 'User', entityId: pendingUser.id, detail: JSON.stringify({ email: normalizedEmail }) },
      })
      return NextResponse.json({ ok: true, message: 'درخواست رد شد و حساب غیرفعال گردید.' })
    }

    // approve: only meaningful for PENDING/DISABLED requests
    if (pendingUser.status === 'ACTIVE') {
      return NextResponse.json({ ok: true, message: 'این ایمیل قبلاً فعال شده است.' })
    }
    const finalRole = (role || pendingUser.role || 'TENANT_OWNER').toUpperCase()
    if (!ROLE_OPTIONS.includes(finalRole)) {
      return NextResponse.json({ error: 'نقش نامعتبر' }, { status: 400 })
    }
    const initialPassword = crypto.randomUUID().slice(0, 8) + crypto.randomUUID().slice(0, 8) + 'Aa1!'
    const user = await db.user.update({
      where: { id: pendingUser.id },
      data: {
        name: ((typeof name === 'string' && name.trim()) || pendingUser.name),
        mobile: ((typeof mobile === 'string' && mobile.trim()) || pendingUser.mobile || '').trim() || null,
        role: finalRole,
        status: 'ACTIVE',
        passwordHash: hashPassword(initialPassword),
      },
    })
    await db.auditLog.create({
      data: { actor: session.name, role: session.role, action: 'USER_APPROVE', entityType: 'User', entityId: user.id, detail: JSON.stringify({ email: normalizedEmail, role: finalRole }) },
    })
    return NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      initialPassword,
      message: 'کاربر فعال شد. رمز عبور اولیه یک‌بار نمایش داده می‌شود.',
    })
  }

  // ─── Regular field updates (by id) ───
  if (!id) return NextResponse.json({ error: 'شناسه کاربر الزامی است' }, { status: 400 })
  const existing = await db.user.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'کاربر یافت نشد' }, { status: 404 })

  // Never touch platform-role accounts through this endpoint
  if (existing.role === 'SUPER_ADMIN' || existing.role === 'SUPPORT') {
    return NextResponse.json({ error: 'حساب‌های پلتفرمی از این مسیر قابل ویرایش نیستند' }, { status: 403 })
  }

  const data: Record<string, unknown> = {}
  if (name !== undefined && typeof name === 'string' && name.trim()) data.name = name.trim()
  if (mobile !== undefined) data.mobile = (typeof mobile === 'string' && mobile.trim()) || null

  if (email !== undefined && typeof email === 'string' && email.toLowerCase() !== existing.email) {
    const normalizedEmail = email.toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: 'ایمیل معتبر الزامی است' }, { status: 400 })
    }
    const dup = await db.user.findUnique({ where: { email: normalizedEmail } })
    if (dup) return NextResponse.json({ error: 'این ایمیل قبلاً استفاده شده است' }, { status: 409 })
    data.email = normalizedEmail
  }

  if (role !== undefined) {
    const finalRole = String(role).toUpperCase()
    if (!ROLE_OPTIONS.includes(finalRole)) {
      return NextResponse.json({ error: 'نقش‌های پلتفرمی از این مسیر قابل تخصیص نیستند' }, { status: 403 })
    }
    data.role = finalRole
  }

  if (status !== undefined) {
    if (!['ACTIVE', 'DISABLED'].includes(status)) {
      return NextResponse.json({ error: 'وضعیت نامعتبر است' }, { status: 400 })
    }
    data.status = status
  }

  if (tenantId !== undefined) {
    if (tenantId === null || tenantId === '') {
      data.tenantId = null
    } else {
      const t = await db.tenant.findUnique({ where: { id: tenantId } })
      if (!t) return NextResponse.json({ error: 'مستأجر یافت نشد' }, { status: 404 })
      data.tenantId = tenantId
    }
  }

  let initialPassword: string | undefined
  if (resetPassword) {
    initialPassword = crypto.randomUUID().slice(0, 8) + crypto.randomUUID().slice(0, 8) + 'Aa1!'
    data.passwordHash = hashPassword(initialPassword)
  }

  const user = await db.user.update({ where: { id }, data })
  await db.auditLog.create({
    data: { actor: session.name, role: session.role, action: resetPassword ? 'USER_RESET_PASSWORD' : 'USER_UPDATE', entityType: 'User', entityId: id, detail: JSON.stringify({ email: user.email, role: user.role, status: user.status }) },
  })

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status },
    ...(initialPassword ? { initialPassword, message: 'رمز جدید ساخته شد. یک‌بار نمایش داده می‌شود.' } : {}),
  })
}

/** Delete a user (SUPER_ADMIN only). Platform-role accounts are protected. */
export async function DELETE(req: Request) {
  const session = await requireSuperAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'شناسه کاربر الزامی است' }, { status: 400 })

  const existing = await db.user.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'کاربر یافت نشد' }, { status: 404 })
  if (existing.role === 'SUPER_ADMIN' || existing.role === 'SUPPORT') {
    return NextResponse.json({ error: 'حساب‌های پلتفرمی از این مسیر قابل حذف نیستند' }, { status: 403 })
  }

  await db.user.delete({ where: { id } })
  await db.auditLog.create({
    data: { actor: session.name, role: session.role, action: 'USER_DELETE', entityType: 'User', entityId: id, detail: JSON.stringify({ email: existing.email, role: existing.role }) },
  })
  return NextResponse.json({ ok: true })
}
