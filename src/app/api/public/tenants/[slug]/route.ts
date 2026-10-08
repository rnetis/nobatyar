import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/** Tenant detail: branches + services + staff (public booking flow data) */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: {
      id: true, name: true, slug: true, category: true, logoText: true,
      address: true, phone: true, status: true,
      branches: {
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, address: true, phone: true, hours: true },
      },
      services: {
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, description: true, duration: true, price: true, capacity: true, branchId: true },
      },
      staff: {
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, title: true, branchId: true, serviceIds: true },
      },
    },
  })
  if (!tenant || tenant.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'مرکز یافت نشد' }, { status: 404 })
  }
  return NextResponse.json({ tenant })
}
