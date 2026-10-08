/**
 * Event Bus bridge (PRD §9)
 * Next.js API → queue-service (port 3004) → WebSocket rooms
 * Fire-and-forget; queue events must never block business transactions.
 */

const BUS_URL = process.env.QUEUE_SERVICE_URL || 'http://localhost:3004'

export interface QueueBroadcastData {
  queueId?: string
  token?: string // appointment liveToken (booker room)
  tenantId?: string
  event: string // queue.updated | appointment.called | ...
  position?: number
  peopleAhead?: number
  estimatedWait?: number
  updatedAt?: string
  [key: string]: unknown
}

export async function broadcast(rooms: string[], event: string, data: unknown): Promise<void> {
  try {
    await fetch(`${BUS_URL}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rooms, event, data }),
      signal: AbortSignal.timeout(1500),
    })
  } catch {
    // never fail a transaction because of the bus
  }
}

/** Broadcast to one booker (by live token) + the tenant's business panel */
export async function broadcastQueueUpdate(
  tenantId: string,
  token: string | null | undefined,
  payload: QueueBroadcastData,
): Promise<void> {
  const rooms = [`t:${tenantId}`]
  if (token) rooms.push(`q:${token}`)
  await broadcast(rooms, payload.event || 'queue.updated', {
    ...payload,
    updatedAt: payload.updatedAt || new Date().toISOString(),
  })
}
