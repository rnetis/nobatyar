import { db } from '@/lib/db'
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

export async function getAvailability(params: {
  branchId: string
  serviceId: string
  staffId?: string | null
  date: string // gregorian "2026-10-08"
}): Promise<{ date: string; closed: boolean; slots: SlotInfo[]; openTime?: string; closeTime?: string }> {
  const branch = await db.branch.findUnique({ where: { id: params.branchId } })
  const service = await db.service.findUnique({ where: { id: params.serviceId } })
  if (!branch || !service) return { date: params.date, closed: true, slots: [] }

  const hours = parseHours(branch.hours)
  const d = new Date(params.date + 'T12:00:00')
  const dayHours = hours[DAY_KEYS[d.getDay()]] || defaultHours()[DAY_KEYS[d.getDay()]]

  if (dayHours.closed) {
    return { date: params.date, closed: true, slots: [] }
  }

  const open = timeToMinutes(dayHours.open)
  const close = timeToMinutes(dayHours.close)
  const step = Math.max(10, service.duration)

  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0)
  const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)

  const appts = await db.appointment.findMany({
    where: {
      branchId: params.branchId,
      serviceId: params.serviceId,
      scheduledAt: { gte: dayStart, lte: dayEnd },
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      ...(params.staffId ? { staffId: params.staffId } : {}),
    },
    select: { scheduledAt: true },
  })

  const now = new Date()
  const isToday = dateKey(now) === params.date

  const slots: SlotInfo[] = []
  for (let t = open; t + step <= close; t += step) {
    const time = minutesToTime(t)
    const slotStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(t / 60), t % 60)
    const count = appts.filter((a) => Math.abs(a.scheduledAt.getTime() - slotStart.getTime()) < 5 * 60 * 1000).length
    const remaining = Math.max(0, service.capacity - count)
    const inPast = isToday && slotStart.getTime() <= now.getTime()
    slots.push({ time, available: remaining > 0 && !inPast, remaining })
  }

  return { date: params.date, closed: false, slots, openTime: dayHours.open, closeTime: dayHours.close }
}

/** Check a single slot is still bookable (used before creating booking). */
export async function isSlotAvailable(params: {
  branchId: string
  serviceId: string
  staffId?: string | null
  date: string
  time: string
}): Promise<boolean> {
  const day = await getAvailability(params)
  const slot = day.slots.find((s) => s.time === params.time)
  return !!slot && slot.available
}
