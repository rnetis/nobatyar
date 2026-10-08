import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBusinessSession } from '@/lib/auth'
import { dateKey } from '@/lib/jalali'

/** Dashboard KPIs (PRD §24 Dashboard) */
export async function GET() {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const tenantId = session.tenantId

  const today = dateKey(new Date())
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999)

  const [totalToday, waiting, completed, noShow, cancelled, queues] = await Promise.all([
    db.appointment.count({ where: { tenantId, scheduledAt: { gte: dayStart, lte: dayEnd } } }),
    db.appointment.count({ where: { tenantId, status: 'WAITING' } }),
    db.appointment.count({ where: { tenantId, status: 'COMPLETED', scheduledAt: { gte: dayStart, lte: dayEnd } } }),
    db.appointment.count({ where: { tenantId, status: 'NO_SHOW', scheduledAt: { gte: dayStart, lte: dayEnd } } }),
    db.appointment.count({ where: { tenantId, status: 'CANCELLED', scheduledAt: { gte: dayStart, lte: dayEnd } } }),
    db.queue.findMany({
      where: { tenantId, date: today },
      include: { branch: { select: { name: true } }, service: { select: { name: true } }, _count: { select: { entries: true } } },
    }),
  ])

  // 7-day trend (bookings + completion rate)
  const since = new Date(); since.setDate(since.getDate() - 6); since.setHours(0, 0, 0, 0)
  const recent = await db.appointment.findMany({
    where: { tenantId, scheduledAt: { gte: since } },
    select: { scheduledAt: true, status: true },
  })
  const trend: { day: string; count: number; completed: number; noShow: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0)
    const end = new Date(d); end.setHours(23, 59, 59, 999)
    const items = recent.filter((a) => a.scheduledAt >= d && a.scheduledAt <= end)
    trend.push({
      day: dateKey(d),
      count: items.length,
      completed: items.filter((x) => x.status === 'COMPLETED').length,
      noShow: items.filter((x) => x.status === 'NO_SHOW').length,
    })
  }

  const totals = recent.length
  const noShowTotal = recent.filter((x) => x.status === 'NO_SHOW').length
  const avgWaitEstimate = queues.length
    ? Math.round(queues.reduce((acc, q) => acc + q.avgServiceMin, 0) / queues.length)
    : 15

  const [customers, smsSentMonth] = await Promise.all([
    db.customer.count({ where: { tenantId } }),
    db.notification.count({
      where: { tenantId, status: 'SENT', createdAt: { gte: new Date(new Date().setDate(1)) } },
    }),
  ])

  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } })

  return NextResponse.json({
    kpis: {
      totalToday, waiting, completed, noShow, cancelled,
      avgWaitEstimate,
      activeQueues: queues.filter((q) => q.status === 'OPEN').length,
      noShowRate: totals ? Math.round((noShowTotal / totals) * 100) : 0,
      customers,
      smsSentMonth,
    },
    queues: queues.map((q) => ({
      id: q.id, branchName: q.branch.name, serviceName: q.service.name,
      status: q.status, entries: q._count.entries, currentServing: q.currentServing,
      avgServiceMin: q.avgServiceMin,
    })),
    trend,
    plan: tenant?.plan ? { name: tenant.plan.name, maxBookings: tenant.plan.maxBookings, smsQuota: tenant.plan.smsQuota } : null,
  })
}
