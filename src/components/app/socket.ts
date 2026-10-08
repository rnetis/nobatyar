'use client'

import { useEffect } from 'react'
import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

/**
 * Shared socket.io connection to queue-service (PRD §9, §37).
 * NOTE: never put the port in the URL — only XTransformPort query (Caddy gateway).
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    })
  }
  return socket
}

/** Join a live-queue token room and return a cleanup fn. */
export function subscribeQueue(
  token: string,
  onUpdate: () => void,
  onStatus?: (connected: boolean) => void,
): () => void {
  const s = getSocket()
  const handleConnect = () => {
    s.emit('subscribe', { token })
    onStatus?.(true)
    // reconnect → resync state (PRD §57: internet disconnect edge case)
    onUpdate()
  }
  const handleDisconnect = () => onStatus?.(false)

  s.on('connect', handleConnect)
  s.on('disconnect', handleDisconnect)
  if (s.connected) {
    s.emit('subscribe', { token })
    onStatus?.(true)
  }

  s.on('queue.updated', onUpdate)
  s.on('queue.activity', onUpdate)

  return () => {
    s.off('connect', handleConnect)
    s.off('disconnect', handleDisconnect)
    s.off('queue.updated', onUpdate)
    s.off('queue.activity', onUpdate)
    s.emit('unsubscribe', { token })
  }
}

/** Join a tenant room (Business Panel live board). */
export function watchTenant(
  tenantId: string,
  onUpdate: () => void,
): () => void {
  const s = getSocket()
  const handleConnect = () => {
    s.emit('watch', { tenantId })
    onUpdate()
  }
  s.on('connect', handleConnect)
  if (s.connected) {
    s.emit('watch', { tenantId })
  }
  s.on('queue.updated', onUpdate)
  s.on('queue.activity', onUpdate)
  return () => {
    s.off('connect', handleConnect)
    s.off('queue.updated', onUpdate)
    s.off('queue.activity', onUpdate)
  }
}

export function useSocketLifecycle() {
  useEffect(() => {
    getSocket()
    return () => {
      socket?.disconnect()
      socket = null
    }
  }, [])
}
