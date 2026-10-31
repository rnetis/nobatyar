import { db } from '@/lib/db'
import { toJalali, fromJalali } from '@/lib/jalali'
import type { Prisma } from '@prisma/client'

type Client = Prisma.TransactionClient

/** Start of the current Jalali month (plan quotas are "per month"). */
export function currentMonthStart(now = new Date()): Date {
  const { jy, jm } = toJalali(now)
  const d = fromJalali(jy, jm, 1)
  d.setHours(0, 0, 0, 0)
  return d
}

async function getPlan(tenantId: string, client: Client) {
  const t = await client.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } })
  return t?.plan ?? null // tenants without a plan are unrestricted (legacy / manually provisioned)
}

export async function checkBranchLimit(tenantId: string, client: Client = db): Promise<string | null> {
  const plan = await getPlan(tenantId, client)
  if (!plan) return null
  const n = await client.branch.count({ where: { tenantId, status: 'ACTIVE' } })
  return n >= plan.maxBranches ? `سقف شعبه‌های پلن «${plan.name}» (${plan.maxBranches}) تکمیل شده است` : null
}

export async function checkStaffLimit(tenantId: string, client: Client = db): Promise<string | null> {
  const plan = await getPlan(tenantId, client)
  if (!plan) return null
  const n = await client.staff.count({ where: { tenantId, status: 'ACTIVE' } })
  return n >= plan.maxStaff ? `سقف کارمندان پلن «${plan.name}» (${plan.maxStaff}) تکمیل شده است` : null
}

export async function checkBookingLimit(tenantId: string, client: Client = db): Promise<string | null> {
  const plan = await getPlan(tenantId, client)
  if (!plan) return null
  const n = await client.appointment.count({
    where: { tenantId, createdAt: { gte: currentMonthStart() }, status: { not: 'CANCELLED' } },
  })
  return n >= plan.maxBookings ? 'ظرفیت نوبت‌دهی این مرکز در این ماه تکمیل شده است' : null
}

/** true when the tenant may still send an SMS this month. */
export async function hasSmsQuota(tenantId: string): Promise<boolean> {
  const plan = await getPlan(tenantId, db)
  if (!plan) return true
  const used = await db.notification.count({
    where: { tenantId, channel: 'SMS', createdAt: { gte: currentMonthStart() }, status: { in: ['SENT', 'PENDING'] } },
  })
  return used < plan.smsQuota
}
