import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAvailability } from '@/lib/availability'

/** Slot availability (PRD §7 step 6) — GET /api/public/availability?branchId&serviceId&date[&staffId] */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const branchId = url.searchParams.get('branchId')
  const serviceId = url.searchParams.get('serviceId')
  const staffId = url.searchParams.get('staffId') || null
  const date = url.searchParams.get('date')
  if (!branchId || !serviceId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'پارامترهای ناقص' }, { status: 400 })
  }
  const service = await db.service.findUnique({ where: { id: serviceId } })
  if (!service) return NextResponse.json({ error: 'خدمت یافت نشد' }, { status: 404 })
  const availability = await getAvailability({ branchId, serviceId, staffId, date })
  return NextResponse.json(availability)
}
