import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBusinessSession } from '@/lib/auth'
import { getLiveState, type QueueSnapshot } from '@/lib/queue-engine'
import { dateKey } from '@/lib/jalali'

/** Live queue snapshots for a tenant on a date (Business Queue Board) */
export async function GET(req: Request) {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const url = new URL(req.url)
  const date = url.searchParams.get('date') || dateKey(new Date())

  const queues = await db.queue.findMany({
    where: { tenantId: session.tenantId, date },
    select: { id: true },
  })
  const snapshots: QueueSnapshot[] = []
  for (const q of queues) {
    const state = await getLiveState(q.id)
    if (state) snapshots.push(state)
  }
  return NextResponse.json({ date, queues: snapshots })
}
