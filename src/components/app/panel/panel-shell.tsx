'use client'

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet } from '../api-client'
import { watchTenant } from '../socket'
import { useHashRoute } from '../use-hash-route'
import { LoginDialog } from '../login-dialog'
import { faDigits, faNumber, formatJalaliFull, minutesFa } from '@/lib/jalali'
import { QueueSection } from './queue-board'
import { AppointmentsSection } from './appointments'
import { ServicesSection, StaffSection } from './services'
import { SettingsSection, SmsSection, AuditSection } from './settings'
import {
  LayoutDashboard, ListOrdered, CalendarClock, Briefcase, UsersRound,
  Settings, MessageSquareText, History, LogOut, Radio, TrendingUp,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

export interface MeResponse {
  user: { id: string; name: string; role: string; tenantId: string | null; email: string; impersonating?: boolean; tenant?: { name: string; slug: string } } | null
}

const NAV = [
  { key: 'dashboard', label: 'داشبورد', icon: LayoutDashboard },
  { key: 'queue', label: 'مدیریت صف', icon: ListOrdered, live: true },
  { key: 'appointments', label: 'نوبت‌ها', icon: CalendarClock },
  { key: 'services', label: 'خدمات', icon: Briefcase },
  { key: 'staff', label: 'کارکنان', icon: UsersRound },
  { key: 'sms', label: 'گزارش پیامک', icon: MessageSquareText },
  { key: 'audit', label: 'رخدادها (Audit)', icon: History },
  { key: 'settings', label: 'تنظیمات', icon: Settings },
]

export function PanelShell({ section }: { section?: string }) {
  const [, navigate] = useHashRoute()
  const active = section || 'dashboard'
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: () => apiGet('/api/auth/me'),
  })

  // live sync for the whole panel (PRD §9)
  useEffect(() => {
    const user = data?.user
    if (!user?.tenantId) return
    return watchTenant(user.tenantId, () => {
      qc.invalidateQueries({ queryKey: ['biz-queue'] })
      qc.invalidateQueries({ queryKey: ['biz-overview'] })
    })
  }, [data?.user?.tenantId, qc])

  if (isLoading) {
    return (
      <div className="min-h-screen flex">
        <div className="w-60 border-e-2 border-[#0a0a0a] p-4 space-y-3">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-none" />)}
        </div>
        <div className="flex-1 p-6"><Skeleton className="h-40 rounded-none" /></div>
      </div>
    )
  }

  if (!data?.user || !data.user.tenantId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <div className="vb-card p-10 text-center max-w-md mx-4">
          <p className="vb-overline mb-3 justify-center">دسترسی</p>
          <h1 className="vb-display text-2xl mb-3">وارد پنل کسب‌وکار شوید</h1>
          <p className="text-sm text-[#525252] mb-6 leading-7">
            این بخش مخصوص مدیران و اپراتورهای مراکز است. با حساب نمایشی وارد شوید.
          </p>
          <div className="flex items-center justify-center gap-3">
            <LoginDialog scope="business">
              <button className="vb-btn vb-btn-primary">ورود به پنل</button>
            </LoginDialog>
            <a href="#/"><button className="vb-btn vb-btn-ghost">صفحه اصلی</button></a>
          </div>
        </div>
      </div>
    )
  }

  const user = data.user

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-[#fafafa] border-b-2 border-[#0a0a0a]">
        <div className="h-14 px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <a href="#/" className="w-8 h-8 bg-[#0a0a0a] text-[#fafafa] font-black flex items-center justify-center shrink-0">ن</a>
            <div className="min-w-0">
              <p className="font-black text-sm truncate">{user.tenant?.name}</p>
              <p className="text-[10px] text-[#525252] font-bold">پنل مدیریت کسب‌وکار</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user.impersonating && (
              <span className="vb-chip vb-chip-error">حالت Impersonate — دکتر مدیریت پلتفرم</span>
            )}
            <span className="text-xs font-bold text-[#525252] hidden sm:block">{user.name}</span>
            <button
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' })
                window.location.hash = '#/'
                qc.invalidateQueries()
              }}
              className="flex items-center gap-1 text-xs font-bold text-[#525252] hover:text-[#ef4444] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> خروج
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside className="w-52 shrink-0 border-e-2 border-[#0a0a0a] bg-[#fafafa] sticky top-14 self-start hidden md:block" style={{ height: 'calc(100vh - 56px)' }}>
          <nav className="p-3 space-y-1">
            {NAV.map((item) => {
              const Icon = item.icon
              const isActive = active === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => navigate(`#/panel/${item.key}`)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold transition-colors ${
                    isActive ? 'bg-[#0a0a0a] text-[#fafafa]' : 'text-[#525252] hover:bg-[#f5f5f5] hover:text-[#0a0a0a]'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#ef4444]' : ''}`} />
                  {item.label}
                  {item.live && <span className="vb-live-dot ms-auto" />}
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Mobile nav */}
        <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0a0a0a] text-[#fafafa] flex overflow-x-auto nice-scroll">
          {NAV.map((item) => {
            const Icon = item.icon
            const isActive = active === item.key
            return (
              <button
                key={item.key}
                onClick={() => navigate(`#/panel/${item.key}`)}
                className={`flex-1 min-w-[72px] py-2.5 flex flex-col items-center gap-1 text-[9px] font-bold ${
                  isActive ? 'text-[#ef4444]' : 'text-[#a3a3a3]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <main className="flex-1 min-w-0 p-4 md:p-6 pb-24 md:pb-6">
          {active === 'dashboard' && <Dashboard />}
          {active === 'queue' && <QueueSection />}
          {active === 'appointments' && <AppointmentsSection />}
          {active === 'services' && <ServicesSection />}
          {active === 'staff' && <StaffSection />}
          {active === 'sms' && <SmsSection />}
          {active === 'audit' && <AuditSection />}
          {active === 'settings' && <SettingsSection />}
        </main>
      </div>
    </div>
  )
}

// ─────────────────────────── Dashboard ───────────────────────────

interface OverviewResponse {
  kpis: {
    totalToday: number; waiting: number; completed: number; noShow: number; cancelled: number
    avgWaitEstimate: number; activeQueues: number; noShowRate: number; customers: number; smsSentMonth: number
  }
  queues: { id: string; branchName: string; serviceName: string; status: string; entries: number; currentServing: string | null; avgServiceMin: number }[]
  trend: { day: string; count: number; completed: number; noShow: number }[]
  plan: { name: string; maxBookings: number; smsQuota: number } | null
}

function Dashboard() {
  const { data, isLoading } = useQuery<OverviewResponse>({
    queryKey: ['biz-overview'],
    queryFn: () => apiGet('/api/business/overview'),
    refetchInterval: 20_000,
  })

  if (isLoading || !data) return <SectionSkeleton />
  const { kpis } = data
  const maxCount = Math.max(...data.trend.map((t) => t.count), 1)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="vb-overline mb-2">نمای کلی امروز</p>
          <h1 className="vb-display text-3xl">داشبورد</h1>
        </div>
        <span className="text-xs font-bold text-[#525252]">{formatJalaliFull(new Date())}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="نوبت امروز" value={faDigits(kpis.totalToday)} icon={<CalendarClock className="w-5 h-5" />} />
        <KpiCard label="در صف انتظار" value={faDigits(kpis.waiting)} icon={<Radio className="w-5 h-5" />} accent />
        <KpiCard label="تکمیل‌شده" value={faDigits(kpis.completed)} icon={<TrendingUp className="w-5 h-5" />} />
        <KpiCard label="عدم حضور (No-show)" value={faDigits(kpis.noShow)} icon={<UsersRound className="w-5 h-5" />} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* 7-day trend */}
        <div className="vb-card p-5 lg:col-span-2">
          <p className="font-black mb-4">روند ۷ روز گذشته</p>
          <div className="flex items-end gap-2 h-36">
            {data.trend.map((t) => (
              <div key={t.day} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-[10px] font-bold text-[#525252]">{faDigits(t.count)}</span>
                <div className="w-full flex items-end justify-center gap-0.5 h-24">
                  <div className="w-1/2 bg-[#0a0a0a]" style={{ height: `${(t.count / maxCount) * 100}%` }} title="کل نوبت‌ها" />
                  <div className="w-1/3 bg-[#ef4444]" style={{ height: `${(t.noShow / maxCount) * 100}%` }} title="No-show" />
                </div>
                <span className="text-[9px] text-[#525252]">{faDigits(t.day.slice(8))}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] font-bold text-[#525252]">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-[#0a0a0a] inline-block" /> کل نوبت‌ها</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-[#ef4444] inline-block" /> عدم حضور</span>
          </div>
        </div>

        {/* Side stats */}
        <div className="space-y-4">
          <div className="vb-card p-5">
            <p className="text-xs font-bold text-[#525252] mb-1">میانگین زمان سرویس</p>
            <p className="font-black text-2xl">{minutesFa(kpis.avgWaitEstimate)}</p>
            <p className="text-[10px] text-[#525252] mt-2">نرخ No-share ۷ روز: {faDigits(kpis.noShowRate)}٪</p>
          </div>
          <div className="vb-card p-5">
            <p className="text-xs font-bold text-[#525252] mb-1">مشتریان ثبت‌شده</p>
            <p className="font-black text-2xl">{faNumber(kpis.customers)}</p>
          </div>
          <div className="vb-card p-5">
            <p className="text-xs font-bold text-[#525252] mb-1">پیامک ارسالی این ماه</p>
            <p className="font-black text-2xl">{faNumber(kpis.smsSentMonth)}</p>
            {data.plan && (
              <p className="text-[10px] text-[#525252] mt-2">سهمیه پلن {data.plan.name}: {faNumber(data.plan.smsQuota)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Active queues */}
      <div>
        <p className="vb-overline mb-3">صف‌های فعال امروز</p>
        <div className="grid sm:grid-cols-2 gap-4">
          {data.queues.length === 0 && (
            <p className="text-sm text-[#525252] font-bold">امروز صف فعالی وجود ندارد.</p>
          )}
          {data.queues.map((q) => (
            <div key={q.id} className="vb-card p-5 flex items-center justify-between">
              <div>
                <p className="font-black text-sm">{q.serviceName}</p>
                <p className="text-xs text-[#525252] mt-0.5">{q.branchName}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-[#525252]">در حال سرویس</p>
                <p className="vb-code font-black text-xl">{q.currentServing || '—'}</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className={q.status === 'OPEN' ? 'vb-chip vb-chip-success' : 'vb-chip vb-chip-warning'}>
                  {q.status === 'OPEN' ? 'فعال' : q.status === 'PAUSED' ? 'متوقف' : 'بسته'}
                </span>
                <span className="text-xs font-bold">{faDigits(q.entries)} نفر</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, icon, accent }: { label: string; value: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`${accent ? 'vb-card-elevated' : 'vb-card'} p-5`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-[#525252]">{label}</p>
        <span className={accent ? 'text-[#ef4444]' : 'text-[#0a0a0a]'}>{icon}</span>
      </div>
      <p className="font-black text-3xl">{value}</p>
    </div>
  )
}

export function SectionSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-52 rounded-none" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-none" />)}
      </div>
      <Skeleton className="h-72 rounded-none" />
    </div>
  )
}
