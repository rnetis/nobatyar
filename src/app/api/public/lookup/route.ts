import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { normalizeMobile } from '@/lib/phone'
import { rateLimit, clientIp } from '@/lib/rate-limit'

/** Find own booking by code + mobile (no login — PRD §23). Exact match + rate limited. */
export async function GET(req: Request) {
  const rl = rateLimit(`lookup:${clientIp(req)}`, 20, 10 * 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })
  }
  const url = new URL(req.url)
  const code = (url.searchParams.get('code') || '').trim().toUpperCase()
  const mobile = normalizeMobile(url.searchParams.get('mobile') || '')
  if (!code || !mobile) {
    return NextResponse.json({ error: 'شماره نوبت و موبایل را وارد کنید' }, { status: 400 })
  }
  // exact match: the old `contains` let a 1-character code match somebody's booking
  const appt = await db.appointment.findFirst({
    where: { code, customer: { mobile } },
    orderBy: { createdAt: 'desc' },
    select: { code: true, liveToken: true, scheduledAt: true, status: true },
  })
  if (!appt) {
    return NextResponse.json({ error: 'نوبتی با این اطلاعات یافت نشد' }, { status: 404 })
  }
  return NextResponse.json({ appointment: appt })
}
