import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminSession } from '@/lib/auth'

/** Platform-wide KPIs (PRD §26 Dashboard) */
export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)

  const [tenants, activeTenants, users, bookingsMonth, queuesOpen, smsSent, ticketsOpen] = await Promise.all([
    db.tenant.count(),
    db.tenant.count({ where: { status: 'ACTIVE' } }),
    db.user.count(),
    db.appointment.count({ where: { createdAt: { gte: monthStart } } }),
    db.queue.count({ where: { status: 'OPEN' } }),
    db.notification.count({ where: { status: 'SENT', createdAt: { gte: monthStart } } }),
    db.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER'] } } }),
  ])

  const plans = await db.plan.findMany({ include: { _count: { select: { tenants: true } } } })
  // MRR estimate from plan prices
  let mrr = 0
  const tenantsWithPlan = await db.tenant.findMany({ where: { status: 'ACTIVE' }, select: { planId: true } })
  for (const t of tenantsWithPlan) {
    const plan = plans.find((p) => p.id === t.planId)
    if (plan) mrr += plan.priceMonthly
  }

  const statusByDay: { day: string; count: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0)
    const end = new Date(d); end.setHours(23, 59, 59, 999)
    const count = await db.appointment.count({ where: { scheduledAt: { gte: d, lte: end } } })
    statusByDay.push({ day: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, count })
  }

  const latestTenants = await db.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { plan: { select: { name: true } }, _count: { select: { appointments: true } } },
  })

  const notifByType = await db.notification.groupBy({
    by: ['type'],
    _count: { type: true },
    where: { createdAt: { gte: monthStart } },
  })

  return NextResponse.json({
    kpis: { tenants, activeTenants, users, bookingsMonth, queuesOpen, smsSent, ticketsOpen, mrr },
    plans: plans.map((p) => ({ id: p.id, name: p.name, slug: p.slug, priceMonthly: p.priceMonthly, tenants: p._count.tenants })),
    trend: statusByDay,
    latestTenants,
    notifByType: notifByType.map((n) => ({ type: n.type, count: n._count.type })),
  })
}
