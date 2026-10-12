import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminSession } from '@/lib/auth'

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const tickets = await db.ticket.findMany({
    include: { tenant: { select: { name: true, slug: true } } },
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json({ tickets })
}

export async function POST(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { subject, body: ticketBody, priority, tenantId, createdBy } = body as {
    subject?: string; body?: string; priority?: string; tenantId?: string; createdBy?: string
  }
  if (!subject || typeof subject !== 'string') return NextResponse.json({ error: 'موضوع تیکت الزامی است' }, { status: 400 })
  const ticket = await db.ticket.create({
    data: {
      tenantId: (tenantId || null),
      createdBy: (createdBy || session.name),
      subject: String(subject),
      body: (ticketBody || '').toString(),
      priority: ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(String(priority)) ? String(priority) : 'NORMAL',
      status: 'OPEN',
    },
  })
  await db.auditLog.create({
    data: { actor: session.name, role: session.role, action: 'TICKET_CREATE', entityType: 'Ticket', entityId: ticket.id, detail: JSON.stringify({ subject: ticket.subject }) },
  })
  return NextResponse.json({ ticket })
}

export async function PATCH(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { id, status, priority, assignee } = body as { id?: string; status?: string; priority?: string; assignee?: string }
  if (!id) return NextResponse.json({ error: 'شناسه تیکت الزامی است' }, { status: 400 })
  const ticket = await db.ticket.findUnique({ where: { id } })
  if (!ticket) return NextResponse.json({ error: 'تیکت یافت نشد' }, { status: 404 })
  const allowedPriority = ['LOW', 'NORMAL', 'HIGH', 'URGENT']
  const updated = await db.ticket.update({
    where: { id },
    data: {
      ...(status ? { status: String(status) } : {}),
      ...(priority !== undefined ? { priority: allowedPriority.includes(String(priority)) ? String(priority) : ticket.priority } : {}),
      ...(assignee !== undefined ? { assignee: (assignee || null) } : {}),
    },
  })
  await db.auditLog.create({
    data: { tenantId: ticket.tenantId, actor: session.name, role: session.role, action: 'TICKET_UPDATE', entityType: 'Ticket', entityId: ticket.id, detail: JSON.stringify({ id, status: updated.status, priority: updated.priority, assignee: updated.assignee }) },
  })
  return NextResponse.json({ ticket: updated })
}
