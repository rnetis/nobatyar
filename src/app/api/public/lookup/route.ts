import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/** Find own booking by code + mobile (no login — PRD §23) */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = (url.searchParams.get('code') || '').trim().toUpperCase()
  const mobile = (url.searchParams.get('mobile') || '').trim()
  if (!code || !mobile) {
    return NextResponse.json({ error: 'شماره نوبت و موبایل را وارد کنید' }, { status: 400 })
  }
  const appt = await db.appointment.findFirst({
    where: {
      code: { contains: code },
      customer: { mobile },
    },
    orderBy: { createdAt: 'desc' },
    select: { code: true, liveToken: true, scheduledAt: true, status: true },
  })
  if (!appt) {
    return NextResponse.json({ error: 'نوبتی با این اطلاعات یافت نشد' }, { status: 404 })
  }
  return NextResponse.json({ appointment: appt })
}
