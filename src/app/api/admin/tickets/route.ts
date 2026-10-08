import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminSession } from '@/lib/auth'

/** Support tickets (PRD §29, §30) */
export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const tickets = await db.ticket.findMany({
    include: { tenant: { select: { name: true, slug: true } } },
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json({ tickets })
}

export async function PATCH(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { id, status, priority, assignee } = body as { id?: string; status?: string; priority?: string; assignee?: string }
  if (!id) return NextResponse.json({ error: 'شناسه الزامی است' }, { status: 400 })
  const ticket = await db.ticket.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(assignee !== undefined ? { assignee: assignee || null } : {}),
    },
  })
  await db.auditLog.create({
    data: { tenantId: ticket.tenantId, actor: session.name, role: session.role, action: 'TICKET_UPDATE', entityType: 'Ticket', entityId: ticket.id, detail: JSON.stringify({ status: ticket.status }) },
  })
  return NextResponse.json({ ticket })
}
