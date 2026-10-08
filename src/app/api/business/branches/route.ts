import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBusinessSession } from '@/lib/auth'

/** Branch list for tenant */
export async function GET() {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const branches = await db.branch.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { services: true, staff: true, queues: true } } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ branches })
}
