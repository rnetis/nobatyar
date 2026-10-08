import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/** Public tenant directory (Booker entry point — PRD §23) */
export async function GET() {
  const tenants = await db.tenant.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true, name: true, slug: true, category: true, logoText: true,
      address: true, phone: true,
      _count: { select: { services: true, branches: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ tenants })
}
