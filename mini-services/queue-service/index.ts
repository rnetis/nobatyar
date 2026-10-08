import { createServer } from 'http'
import { Server } from 'socket.io'

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
const internal = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'queue-service', uptime: process.uptime() }))
    return
  }

  if (req.method === 'POST' && req.url === '/broadcast') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        const { rooms, event, data } = JSON.parse(body || '{}')
        if (!event) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'event is required' }))
          return
        }
        const target = Array.isArray(rooms) ? rooms : []
        if (target.length === 0) {
          io.emit(event, data)
        } else {
          for (const room of target) io.to(room).emit(event, data)
        }
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
    origin: '*',
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

  socket.on('watch', (data: { tenantId?: string }) => {
    const tenantId = (data?.tenantId || '').trim()
    if (/^[a-z0-9]{6,40}$/i.test(tenantId)) {
      socket.join(`t:${tenantId}`)
      socket.emit('watching', { ok: true, room: `t:${tenantId}` })
    }
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

internal.listen(INTERNAL_PORT, () => {
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
