import { createServer } from 'http'
import { Server } from 'socket.io'
import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Queue Real-Time Service (PRD §9, §37)
 * -------------------------------------
 * Event-driven broadcast hub for Live Queue.
 *
 * Rooms:
 *   q:{liveToken}    → one Booker's Live Queue page
 *   t:{tenantId}     → Business Panel live views (queue board)
 *
 * Inbound HTTP (from Next.js API — internal only):
 *   POST /broadcast  { rooms: string[], event: string, data: unknown }
 *   GET  /health
 *
 * Client events:
 *   subscribe   { token }    → join q:{token}
 *   unsubscribe { token }
 *   watch       { tenantId } → join t:{tenantId}
 */

/**
 * Internal HTTP server (port 3004) — used ONLY by the Next.js API server
 * to push broadcast events. Kept separate because the socket.io server
 * owns every request on its port (path '/').
 */
// Shared secret between the Next.js API and this service (set the same value on both sides).
const BROADCAST_SECRET = process.env.BROADCAST_SECRET || ''
// Secret used to verify tenant-room join tokens signed by the Next.js API (same as its SESSION_SECRET).
const SESSION_SECRET = process.env.SESSION_SECRET || ''
if (!BROADCAST_SECRET) console.warn('[queue-service] BROADCAST_SECRET is not set — /broadcast is unauthenticated (localhost-only).')
if (!SESSION_SECRET) console.warn('[queue-service] SESSION_SECRET is not set — tenant rooms cannot be joined.')

function safeEq(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Verify a token issued by createSocketToken() in src/lib/auth.ts → tenantId, or null. */
function verifyTenantToken(token: string, tenantId: string): boolean {
  if (!SESSION_SECRET || !token) return false
  const dot = token.lastIndexOf('.')
  if (dot < 0) return false
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac('sha256', SESSION_SECRET).update('socket:' + body).digest('base64url')
  if (!safeEq(sig, expected)) return false
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { tid?: string; exp?: number }
    return p.tid === tenantId && typeof p.exp === 'number' && p.exp > Date.now()
  } catch {
    return false
  }
}

// Internal API: no CORS headers at all — it is called server-to-server only, never from a browser.
const internal = createServer((req, res) => {

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'queue-service', uptime: process.uptime() }))
    return
  }

  if (req.method === 'POST' && req.url === '/broadcast') {
    if (BROADCAST_SECRET && !safeEq(String(req.headers['x-internal-token'] || ''), BROADCAST_SECRET)) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'unauthorized' }))
      return
    }
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 256 * 1024) req.destroy() // payload cap
    })
    req.on('end', () => {
      try {
        const { rooms, event, data } = JSON.parse(body || '{}')
        if (!event) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'event is required' }))
          return
        }
        // never fall back to emitting to every connected socket (would leak events across tenants)
        const target = (Array.isArray(rooms) ? rooms : []).filter((r): r is string => typeof r === 'string' && ROOM_RE.test(r))
        if (target.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'rooms are required' }))
          return
        }
        for (const room of target) io.to(room).emit(event, data)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, rooms: target, event }))
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'invalid json' }))
      }
    })
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: false, error: 'not found' }))
})

const httpServer = createServer()

const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: {
    // same-origin through the gateway; set ALLOWED_ORIGIN when the site is served from another origin
    origin: process.env.ALLOWED_ORIGIN || false,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

const ROOM_RE = /^(q:[a-f0-9]{16,}|t:[a-z0-9]+)$/i

io.on('connection', (socket) => {
  socket.on('subscribe', (data: { token?: string }) => {
    const token = (data?.token || '').trim()
    if (!/^[a-f0-9]{16,64}$/i.test(token)) {
      socket.emit('subscribed', { ok: false, error: 'invalid token' })
      return
    }
    socket.join(`q:${token}`)
    socket.emit('subscribed', { ok: true, room: `q:${token}` })
  })

  socket.on('unsubscribe', (data: { token?: string }) => {
    const token = (data?.token || '').trim()
    if (/^[a-f0-9]{16,64}$/i.test(token)) socket.leave(`q:${token}`)
  })

  socket.on('watch', (data: { tenantId?: string; token?: string }) => {
    const tenantId = (data?.tenantId || '').trim()
    if (!/^[a-z0-9]{6,40}$/i.test(tenantId) || !verifyTenantToken(String(data?.token || ''), tenantId)) {
      socket.emit('watching', { ok: false, error: 'unauthorized' })
      return
    }
    socket.join(`t:${tenantId}`)
    socket.emit('watching', { ok: true, room: `t:${tenantId}` })
  })

  socket.on('ping-room', (data: { room?: string }) => {
    const room = data?.room || ''
    if (ROOM_RE.test(room)) socket.emit('pong-room', { room, at: Date.now() })
  })

  socket.on('error', (error) => {
    console.error(`Socket error (${socket.id}):`, error)
  })
})

const PORT = 3003
const INTERNAL_PORT = 3004

httpServer.listen(PORT, () => {
  console.log(`Queue real-time service (socket.io) running on port ${PORT}`)
})

// internal API listens on loopback only
internal.listen(INTERNAL_PORT, '127.0.0.1', () => {
  console.log(`Queue internal broadcast API running on port ${INTERNAL_PORT}`)
})

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0))
  internal.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0))
  internal.close(() => process.exit(0))
})
