import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/password'

export { hashPassword, verifyPassword }

const SECRET = process.env.SESSION_SECRET
const COOKIE_NAME = 'nobaas_sess'

export interface SessionPayload {
  userId: string
  name: string
  role: string
  tenantId?: string | null
  impersonating?: boolean // Super Admin entered a tenant panel (audited)
  iat: number
}

function sign(data: string): string {
  if (!SECRET) throw new Error('SESSION_SECRET is not configured')
  return createHmac('sha256', SECRET).update(data).digest('base64url')
}

export function createSessionToken(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot < 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = sign(body)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    // 7-day expiry
    if (Date.now() - payload.iat > 7 * 24 * 3600 * 1000) return null
    return payload
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  return verifySessionToken(store.get(COOKIE_NAME)?.value)
}

export async function setSessionCookie(payload: Omit<SessionPayload, 'iat'>): Promise<void> {
  const store = await cookies()
  store.set(COOKIE_NAME, createSessionToken({ ...payload, iat: Date.now() }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE
      ? process.env.COOKIE_SECURE === 'true'
      : process.env.NODE_ENV === 'production' && (process.env.NEXT_PUBLIC_BASE_URL || '').startsWith('https://'),
    path: '/',
    maxAge: 7 * 24 * 3600,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}

export const MANAGER_ROLES = ['TENANT_OWNER', 'TENANT_ADMIN', 'MANAGER'] as const
const BUSINESS_ROLES = ['TENANT_OWNER', 'TENANT_ADMIN', 'MANAGER', 'OPERATOR', 'STAFF']

/**
 * Re-validate the signed cookie against the database so that disabling a user,
 * changing a role or suspending a tenant takes effect immediately instead of
 * after the 7-day token expiry.
 */
async function liveUser(s: SessionPayload) {
  return db.user.findUnique({
    where: { id: s.userId },
    select: { status: true, role: true, tenantId: true, tenant: { select: { status: true } } },
  })
}

/** Guard for business-panel APIs (tenant-scoped roles) */
export async function requireBusinessSession(): Promise<SessionPayload | null> {
  const s = await getSession()
  if (!s) return null
  if (!s.tenantId && !s.impersonating) return null
  const u = await liveUser(s)
  if (!u || u.status !== 'ACTIVE') return null
  if (!s.impersonating && u.tenant?.status === 'SUSPENDED') return null
  const role = u.role
  if (!BUSINESS_ROLES.includes(role)) return null
  return { ...s, role, tenantId: u.tenantId ?? s.tenantId }
}

/** Business session that must also hold a management role (settings, services, staff, branches, audit). */
export async function requireManagerSession(): Promise<SessionPayload | null> {
  const s = await requireBusinessSession()
  if (!s || !(MANAGER_ROLES as readonly string[]).includes(s.role)) return null
  return s
}

/** Guard for super-admin APIs */
export async function requireAdminSession(): Promise<SessionPayload | null> {
  const s = await getSession()
  if (!s) return null
  if (!['SUPER_ADMIN', 'SUPPORT'].includes(s.role)) return null
  const u = await liveUser(s)
  if (!u || u.status !== 'ACTIVE' || !['SUPER_ADMIN', 'SUPPORT'].includes(u.role)) return null
  return { ...s, role: u.role }
}

export async function requireSuperAdminSession(): Promise<SessionPayload | null> {
  const s = await requireAdminSession()
  if (!s || s.role !== 'SUPER_ADMIN') return null
  return s
}

// ── Short-lived token authorising a socket to join a tenant room ──
export function createSocketToken(tenantId: string, ttlMs = 10 * 60 * 1000): string {
  const body = Buffer.from(JSON.stringify({ tid: tenantId, exp: Date.now() + ttlMs })).toString('base64url')
  return `${body}.${sign('socket:' + body)}`
}
