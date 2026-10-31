import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto'

/**
 * Password hashing — scrypt with a random per-user salt.
 * Format: scrypt$N$r$p$saltB64$hashB64
 *
 * Legacy hashes (64 hex chars, HMAC with a static, source-derived salt) are still
 * accepted by verifyPassword() so existing accounts keep working; callers should
 * re-hash on successful login when `needsRehash` is true.
 */
const N = 16384
const R = 8
const P = 1
const KEYLEN = 64

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const dk = scryptSync(password, salt, KEYLEN, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${dk.toString('base64')}`
}

function legacyHash(password: string): string {
  const salt = createHmac('sha256', 'nobaas:pwd-salt').update('static-v1').digest('hex').slice(0, 32)
  return createHmac('sha256', salt).update(`nobaas:${password}`).digest('hex')
}

export function verifyPassword(password: string, stored: string): { ok: boolean; needsRehash: boolean } {
  if (!stored) return { ok: false, needsRehash: false }
  if (stored.startsWith('scrypt$')) {
    const [, n, r, p, saltB64, hashB64] = stored.split('$')
    try {
      const expected = Buffer.from(hashB64, 'base64')
      const dk = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
        N: Number(n), r: Number(r), p: Number(p),
      })
      const ok = dk.length === expected.length && timingSafeEqual(dk, expected)
      return { ok, needsRehash: ok && Number(n) < N }
    } catch {
      return { ok: false, needsRehash: false }
    }
  }
  // legacy format
  const a = Buffer.from(stored)
  const b = Buffer.from(legacyHash(password))
  const ok = a.length === b.length && timingSafeEqual(a, b)
  return { ok, needsRehash: ok }
}
