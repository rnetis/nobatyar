import { NextResponse } from 'next/server'
import { requireBusinessSession } from '@/lib/auth'
import { executeQueueAction, type QueueAction } from '@/lib/queue-engine'

/** Queue operator actions (PRD §24 Queue Management, US-102..107) */
export async function POST(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'درخواست نامعتبر' }, { status: 400 })
  }

  const { queueId, action, entryId, priority, direction, position, reason } = body as {
    queueId?: string; action?: QueueAction; entryId?: string; priority?: string
    direction?: 'up' | 'down' | 'top' | 'bottom'; position?: number; reason?: string
  }
  if (!queueId || !action) {
    return NextResponse.json({ error: 'پارامترهای ناقص' }, { status: 400 })
  }

  // tenant-scoping check
  const queue = await (await import('@/lib/db')).db.queue.findUnique({ where: { id: queueId } })
  if (!queue || queue.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'صف یافت نشد' }, { status: 404 })
  }

  const result = await executeQueueAction({
    queueId,
    action,
    actor: session.name,
    entryId,
    priority,
    direction,
    position,
    reason,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ snapshot: result.snapshot })
}
