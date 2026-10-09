import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'

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

export function hashPassword(password: string): string {
  const salt = createHmac('sha256', 'nobaas:pwd-salt').update('static-v1').digest('hex').slice(0, 32)
  return createHmac('sha256', salt).update(`nobaas:${password}`).digest('hex')
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
    path: '/',
    maxAge: 7 * 24 * 3600,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}

/** Guard for business-panel APIs (tenant-scoped roles) */
export async function requireBusinessSession(): Promise<SessionPayload | null> {
  const s = await getSession()
  if (!s) return null
  if (!s.tenantId) return null
  if (!['TENANT_OWNER', 'TENANT_ADMIN', 'MANAGER', 'OPERATOR', 'STAFF'].includes(s.role)) return null
  return s
}

/** Guard for super-admin APIs */
export async function requireAdminSession(): Promise<SessionPayload | null> {
  const s = await getSession()
  if (!s) return null
  if (!['SUPER_ADMIN', 'SUPPORT'].includes(s.role)) return null
  return s
}
