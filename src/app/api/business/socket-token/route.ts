import { NextResponse } from 'next/server'
import { requireBusinessSession, createSocketToken } from '@/lib/auth'

/** Short-lived signed token that authorises this browser to join its OWN tenant's websocket room. */
export async function GET() {
  const session = await requireBusinessSession()
  if (!session?.tenantId) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  return NextResponse.json({ tenantId: session.tenantId, token: createSocketToken(session.tenantId) })
}
