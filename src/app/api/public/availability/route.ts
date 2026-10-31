import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAvailability, parseGregorianKey } from '@/lib/availability'
import { rateLimit, clientIp } from '@/lib/rate-limit'

/** Slot availability (PRD §7 step 6) — GET /api/public/availability?branchId&serviceId&date[&staffId] */
export async function GET(req: Request) {
  const rl = rateLimit(`avail:${clientIp(req)}`, 120, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'تعداد درخواست‌ها زیاد است' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })
  const url = new URL(req.url)
  const branchId = url.searchParams.get('branchId')
  const serviceId = url.searchParams.get('serviceId')
  const staffId = url.searchParams.get('staffId') || null
  const date = url.searchParams.get('date')
  if (!branchId || !serviceId || !date || !parseGregorianKey(date)) {
    return NextResponse.json({ error: 'پارامترهای ناقص' }, { status: 400 })
  }
  const service = await db.service.findUnique({ where: { id: serviceId } })
  if (!service) return NextResponse.json({ error: 'خدمت یافت نشد' }, { status: 404 })
  const availability = await getAvailability({ branchId, serviceId, staffId, date })
  return NextResponse.json(availability)
}
