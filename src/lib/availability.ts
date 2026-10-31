import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { dateKey, timeToMinutes, minutesToTime } from '@/lib/jalali'

/**
 * Availability Engine — slot generation from branch working hours,
 * service duration/capacity and existing bookings. Double-booking safe.
 */

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export interface SlotInfo {
  time: string      // "09:30"
  available: boolean
  remaining: number // remaining capacity
}

export interface DayHours {
  open: string
  close: string
  closed: boolean
}

export function defaultHours(): Record<string, DayHours> {
  // Sat–Thu 9–18, Friday closed (Iranian week)
  const days: Record<string, DayHours> = {}
  for (const d of DAY_KEYS) {
    days[d] = d === 'fri' ? { open: '09:00', close: '18:00', closed: true } : { open: '09:00', close: '18:00', closed: false }
  }
  return days
}

export function parseHours(hoursJson: string): Record<string, DayHours> {
  try {
    const parsed = JSON.parse(hoursJson || '{}')
    const out = defaultHours()
    for (const d of DAY_KEYS) {
      if (parsed[d]) out[d] = { ...out[d], ...parsed[d] }
    }
    return out
  } catch {
    return defaultHours()
  }
}

/** Validate a branch `hours` JSON string. Returns an error message, or null when valid. */
export function validateHoursJson(json: string): string | null {
  let p: unknown
  try { p = JSON.parse(json) } catch { return 'ساعات کاری نامعتبر است' }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 'ساعات کاری نامعتبر است'
  const re = /^([01]\d|2[0-3]):[0-5]\d$/
  for (const [day, v] of Object.entries(p as Record<string, DayHours>)) {
    if (!(DAY_KEYS as readonly string[]).includes(day) || !v || typeof v !== 'object') return 'ساعات کاری نامعتبر است'
    if (v.closed === true) continue
    if (!re.test(String(v.open)) || !re.test(String(v.close)) || timeToMinutes(v.open) >= timeToMinutes(v.close)) {
      return 'ساعت شروع هر روز باید قبل از ساعت پایان باشد'
    }
  }
  return null
}

/** How far ahead customers may book (days). */
export const MAX_ADVANCE_DAYS = 60

type Client = Prisma.TransactionClient

/** Parse "YYYY-MM-DD" into a real calendar date (rejects 2026-02-31 style rollovers). */
export function parseGregorianKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d, 12, 0, 0)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  return date
}

/** Can this staff member perform the service at the branch? */
export async function staffCanServe(
  client: Client,
  args: { staffId: string; tenantId: string; branchId: string; serviceId: string },
): Promise<boolean> {
  const st = await client.staff.findUnique({ where: { id: args.staffId } })
  if (!st || st.tenantId !== args.tenantId || st.status !== 'ACTIVE') return false
  if (st.branchId && st.branchId !== args.branchId) return false
  try {
    const ids = JSON.parse(st.serviceIds || '[]')
    return Array.isArray(ids) && ids.includes(args.serviceId)
  } catch {
    return false
  }
}

export async function getAvailability(
  params: {
    branchId: string
    serviceId: string
    staffId?: string | null
    date: string // gregorian "2026-10-08"
    excludeAppointmentId?: string // ignore this booking (rescheduling)
  },
  client: Client = db,
): Promise<{ date: string; closed: boolean; slots: SlotInfo[]; openTime?: string; closeTime?: string }> {
  const closedResult = { date: params.date, closed: true, slots: [] as SlotInfo[] }
  const d = parseGregorianKey(params.date)
  if (!d) return closedResult

  const [branch, service] = await Promise.all([
    client.branch.findUnique({ where: { id: params.branchId } }),
    client.service.findUnique({ where: { id: params.serviceId } }),
  ])
  if (!branch || !service) return closedResult
  if (branch.status !== 'ACTIVE' || service.status !== 'ACTIVE') return closedResult
  if (service.tenantId !== branch.tenantId) return closedResult
  if (service.branchId && service.branchId !== branch.id) return closedResult
  if (params.staffId) {
    const ok = await staffCanServe(client, { staffId: params.staffId, tenantId: branch.tenantId, branchId: branch.id, serviceId: service.id })
    if (!ok) return closedResult
  }

  // no booking in the past, none beyond the horizon
  const now = new Date()
  const todayKey = dateKey(now)
  if (params.date < todayKey) return closedResult
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + MAX_ADVANCE_DAYS)
  if (d.getTime() > horizon.getTime()) return closedResult

  const hours = parseHours(branch.hours)
  const dayHours = hours[DAY_KEYS[d.getDay()]] || defaultHours()[DAY_KEYS[d.getDay()]]
  if (dayHours.closed) return closedResult

  const open = timeToMinutes(dayHours.open)
  const close = timeToMinutes(dayHours.close)
  const step = Math.max(10, service.duration)

  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0)
  const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)
  // appointments that may overlap the day (a late one can spill past midnight; ignore, hours are same-day)
  const appts = await client.appointment.findMany({
    where: {
      branchId: params.branchId,
      scheduledAt: { gte: dayStart, lte: dayEnd },
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      ...(params.excludeAppointmentId ? { id: { not: params.excludeAppointmentId } } : {}),
    },
    select: { scheduledAt: true, durationMin: true, serviceId: true, staffId: true },
  })

  const isToday = todayKey === params.date
  const slots: SlotInfo[] = []
  for (let t = open; t + step <= close; t += step) {
    const slotStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(t / 60), t % 60)
    const slotStartMs = slotStart.getTime()
    const slotEndMs = slotStartMs + step * 60_000
    const overlaps = (a: { scheduledAt: Date; durationMin: number }) => {
      const aStart = a.scheduledAt.getTime()
      return aStart < slotEndMs && aStart + a.durationMin * 60_000 > slotStartMs
    }
    // capacity is per service; a specific staff member can only do one thing at a time
    const sameService = appts.filter((a) => a.serviceId === params.serviceId && overlaps(a)).length
    let remaining = Math.max(0, service.capacity - sameService)
    if (params.staffId) {
      const staffBusy = appts.some((a) => a.staffId === params.staffId && overlaps(a))
      if (staffBusy) remaining = 0
    }
    const inPast = isToday && slotStartMs <= now.getTime()
    slots.push({ time: minutesToTime(t), available: remaining > 0 && !inPast, remaining })
  }

  return { date: params.date, closed: false, slots, openTime: dayHours.open, closeTime: dayHours.close }
}

/** Check a single slot is still bookable (used before creating booking). */
export async function isSlotAvailable(
  params: {
    branchId: string
    serviceId: string
    staffId?: string | null
    date: string
    time: string
    excludeAppointmentId?: string
  },
  client: Client = db,
): Promise<boolean> {
  const day = await getAvailability(params, client)
  const slot = day.slots.find((s) => s.time === params.time)
  return !!slot && slot.available
}
