/**
 * Minimal in-memory sliding-window rate limiter.
 * Good enough for a single Node process (the SQLite deployment model of this app).
 * If you scale horizontally, back this with Redis instead.
 */
const buckets = new Map<string, number[]>()

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now()
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs)
  if (hits.length >= limit) {
    buckets.set(key, hits)
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000)) }
  }
  hits.push(now)
  buckets.set(key, hits)
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t >= windowMs)) buckets.delete(k)
  }
  return { ok: true, retryAfterSec: 0 }
}

export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  return (xff?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown').trim()
}
