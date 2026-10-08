'use client'

import { useHashRoute } from '@/components/app/use-hash-route'
import { Landing } from '@/components/app/landing'
import { BookingFlow } from '@/components/app/booking/booking-flow'
import { LiveQueue } from '@/components/app/live-queue'
import { PanelShell } from '@/components/app/panel/panel-shell'
import { AdminShell } from '@/components/app/admin/admin-shell'

export default function AppRouter() {
  const [route] = useHashRoute()
  switch (route.view) {
    case 'book':
      return <BookingFlow slug={route.slug} />
    case 'queue':
      return <LiveQueue token={route.token} />
    case 'panel':
      return <PanelShell section={route.section} />
    case 'admin':
      return <AdminShell section={route.section} />
    default:
      return <Landing />
  }
}
