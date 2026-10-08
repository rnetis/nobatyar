'use client'

import dynamic from 'next/dynamic'
import { AppProviders } from '@/components/app/providers'

// The whole experience is a hash-routed SPA (auth, sockets, Jalali clock are
// client-only) → render the router after mount to avoid SSR/CSR mismatch.
const AppRouter = dynamic(() => import('@/components/app/router'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 bg-[#0a0a0a] text-[#fafafa] font-black text-lg flex items-center justify-center">ن</span>
        <span className="font-black text-lg">نوب‌یار</span>
      </div>
    </div>
  ),
})

export default function Home() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  )
}
