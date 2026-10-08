'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '../api-client'
import { faDigits, faNumber, tomanFa, formatJalaliFull, formatTime, minutesFa } from '@/lib/jalali'
import {
  AUDIT_ACTION_FA, TICKET_STATUS_FA, TICKET_PRIORITY_FA, NOTIFICATION_TYPE_FA, statusChipClass,
} from '../labels'
import { LoginDialog } from '../login-dialog'
import { useHashRoute } from '../use-hash-route'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Gauge, Building2, Layers, LifeBuoy, ScrollText, MessageSquareText, LogOut,
  Pause, Play, Repeat, LogIn as LogInIcon, Plus, Crown,
} from 'lucide-react'

const NAV = [
  { key: 'overview', label: 'نمای کلی پلتفرم', icon: Gauge },
  { key: 'tenants', label: 'مدیریت Tenantها', icon: Building2 },
  { key: 'plans', label: 'پلن‌ها و Feature Flags', icon: Layers },
  { key: 'tickets', label: 'تیکت‌های پشتیبانی', icon: LifeBuoy },
  { key: 'sms', label: 'پیامک‌های پلتفرم', icon: MessageSquareText },
  { key: 'audit', label: 'Audit Log کل سیستم', icon: ScrollText },
]

interface MeResponse {
  user: { id: string; name: string; role: string; tenantId: string | null } | null
}

export function AdminShell({ section }: { section?: string }) {
  const [, navigate] = useHashRoute()
  const active = section || 'overview'
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: () => apiGet('/api/auth/me'),
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex">
        <div className="w-60 border-e-2 border-[#0a0a0a] p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-none" />)}
        </div>
        <div className="flex-1 p-6"><Skeleton className="h-40 rounded-none" /></div>
      </div>
    )
  }

  if (!data?.user || !['SUPER_ADMIN', 'SUPPORT'].includes(data.user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <div className="vb-card p-10 text-center max-w-md mx-4">
          <p className="vb-overline mb-3 justify-center">دسترسی محدود</p>
          <h1 className="vb-display text-2xl mb-3">ورود مدیران پلتفرم</h1>
          <p className="text-sm text-[#525252] mb-6 leading-7">
            این بخش شامل مدیریت Tenantها، پلن‌ها، اشتراک و پشتیبانی کل SaaS است.
          </p>
          <div className="flex items-center justify-center gap-3">
            <LoginDialog scope="admin">
              <button className="vb-btn vb-btn-primary">ورود مدیر</button>
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
      <header className="sticky top-0 z-40 bg-[#0a0a0a] text-[#fafafa] border-b-4 border-[#ef4444]">
        <div className="h-14 px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <a href="#/" className="w-8 h-8 bg-[#ef4444] font-black flex items-center justify-center">ن</a>
            <div>
              <p className="font-black text-sm">نوب‌یار — کنترل پلتفرم</p>
              <p className="text-[10px] text-[#a3a3a3]">Super Admin Console</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-[#a3a3a3] hidden sm:block">{user.name}</span>
            <button
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' })
                window.location.hash = '#/'
                qc.invalidateQueries()
              }}
              className="flex items-center gap-1 text-xs font-bold text-[#a3a3a3] hover:text-[#ef4444] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> خروج
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        <aside className="w-52 shrink-0 border-e-2 border-[#0a0a0a] sticky top-14 self-start hidden md:block" style={{ height: 'calc(100vh - 56px)' }}>
          <nav className="p-3 space-y-1">
            {NAV.map((item) => {
              const Icon = item.icon
              const isActive = active === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => navigate(`#/admin/${item.key}`)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold transition-colors ${
                    isActive ? 'bg-[#0a0a0a] text-[#fafafa]' : 'text-[#525252] hover:bg-[#f5f5f5] hover:text-[#0a0a0a]'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#ef4444]' : ''}`} />
                  {item.label}
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
                onClick={() => navigate(`#/admin/${item.key}`)}
                className={`flex-1 min-w-[68px] py-2.5 flex flex-col items-center gap-1 text-[9px] font-bold ${
                  isActive ? 'text-[#ef4444]' : 'text-[#a3a3a3]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            )
          })}
        </div>

        <main className="flex-1 min-w-0 p-4 md:p-6 pb-24 md:pb-6">
          {active === 'overview' && <AdminOverview />}
          {active === 'tenants' && <TenantsSection />}
          {active === 'plans' && <PlansSection />}
          {active === 'tickets' && <TicketsSection />}
          {active === 'sms' && <PlatformSms />}
          {active === 'audit' && <PlatformAudit />}
        </main>
      </div>
    </div>
  )
}

// ─────────────────────────── Overview ───────────────────────────

interface AdminOverviewResponse {
  kpis: {
    tenants: number; activeTenants: number; users: number; bookingsMonth: number
    queuesOpen: number; smsSent: number; ticketsOpen: number; mrr: number
  }
  plans: { id: string; name: string; slug: string; priceMonthly: number; tenants: number }[]
  trend: { day: string; count: number }[]
  latestTenants: { id: string; name: string; category: string; status: string; plan?: { name: string } | null; _count: { appointments: number } }[]
  notifByType: { type: string; count: number }[]
}

function AdminOverview() {
  const { data, isLoading } = useQuery<AdminOverviewResponse>({
    queryKey: ['admin-overview'],
    queryFn: () => apiGet('/api/admin/overview'),
    refetchInterval: 30_000,
  })
  if (isLoading || !data) return <AdminSkeleton />
  const { kpis } = data
  const maxCount = Math.max(...data.trend.map((t) => t.count), 1)

  return (
    <div className="space-y-6">
      <div>
        <p className="vb-overline mb-2">SaaS Control</p>
        <h1 className="vb-display text-3xl">نمای کلی پلتفرم</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Tenantها" value={faDigits(kpis.tenants)} sub={`${faDigits(kpis.activeTenants)} فعال`} />
        <Kpi label="کاربران پنل" value={faDigits(kpis.users)} sub="Owners، اپراتورها" />
        <Kpi label="نوبت این ماه" value={faNumber(kpis.bookingsMonth)} sub="کل مستأجرها" accent />
        <Kpi label="صف فعال" value={faDigits(kpis.queuesOpen)} sub="هم‌اکنون" />
        <Kpi label="پیامک این ماه" value={faNumber(kpis.smsSent)} sub="کل پلتفرم" />
        <Kpi label="تیکت باز" value={faDigits(kpis.ticketsOpen)} sub="پشتیبانی" />
        <Kpi label="MRR تخمینی" value={tomanFa(kpis.mrr)} sub="درآمد ماهانه" />
        <Kpi label="Active Tenants" value={`${kpis.tenants ? Math.round((kpis.activeTenants / kpis.tenants) * 100) : 0}٪`} sub="نرخ فعالیت" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="vb-card p-5">
          <p className="font-black mb-4">نوبت‌های ۷ روز گذشته (کل پلتفرم)</p>
          <div className="flex items-end gap-2 h-36">
            {data.trend.map((t) => (
              <div key={t.day} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-[10px] font-bold text-[#525252]">{faDigits(t.count)}</span>
                <div className="w-full bg-[#0a0a0a] h-full max-h-28" style={{ height: `${(t.count / maxCount) * 100}%`, minHeight: 4 }} />
                <span className="text-[9px] text-[#525252]">{faDigits(t.day.slice(8))}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="vb-card p-5">
          <p className="font-black mb-4">توزیع پلن‌ها</p>
          <div className="space-y-3">
            {data.plans.map((p, i) => {
              const total = data.plans.reduce((a, x) => a + x.tenants, 0) || 1
              return (
                <div key={p.id}>
                  <div className="flex items-center justify-between text-xs font-bold mb-1">
                    <span>{p.name}</span>
                    <span className="text-[#525252]">{faDigits(p.tenants)} مستأجر</span>
                  </div>
                  <div className="h-3 border-2 border-[#0a0a0a]">
                    <div className={`h-full ${i === 1 ? 'bg-[#ef4444]' : 'bg-[#0a0a0a]'}`} style={{ width: `${(p.tenants / total) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="vb-card overflow-x-auto nice-scroll">
        <div className="px-5 py-3.5 border-b-2 border-[#e5e5e5]">
          <p className="font-black text-sm">آخرین Tenantها</p>
        </div>
        <table className="w-full text-sm min-w-[560px]">
          <tbody className="divide-y divide-[#f0f0f0]">
            {data.latestTenants.map((t) => (
              <tr key={t.id}>
                <td className="px-5 py-3 font-bold">{t.name}</td>
                <td className="px-5 py-3 text-xs text-[#525252]">{t.category}</td>
                <td className="px-5 py-3 text-xs">{t.plan?.name || '—'}</td>
                <td className="px-5 py-3"><span className={statusChipClass(t.status)}>{t.status === 'ACTIVE' ? 'فعال' : 'تعلیق'}</span></td>
                <td className="px-5 py-3 text-xs text-[#525252]">{faDigits(t._count.appointments)} نوبت</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`${accent ? 'vb-card-elevated' : 'vb-card'} p-5`}>
      <p className="text-xs font-bold text-[#525252]">{label}</p>
      <p className="font-black text-2xl mt-1">{value}</p>
      <p className="text-[10px] text-[#525252] mt-1">{sub}</p>
    </div>
  )
}

function AdminSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-52 rounded-none" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-none" />)}
      </div>
      <Skeleton className="h-72 rounded-none" />
    </div>
  )
}

// ─────────────────────────── Tenants ───────────────────────────

interface TenantRow {
  id: string; name: string; slug: string; category: string; status: string
  logoText: string; queuePrefix: string; createdAt: string
  plan?: { id: string; name: string; priceMonthly: number } | null
  _count: { users: number; branches: number; services: number; appointments: number; customers: number }
}

function TenantsSection() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [creating, setCreating] = useState(false)
  const [planChange, setPlanChange] = useState<TenantRow | null>(null)

  const { data, isLoading } = useQuery<{ tenants: TenantRow[] }>({
    queryKey: ['admin-tenants'],
    queryFn: () => apiGet('/api/admin/tenants'),
  })
  const { data: plansData } = useQuery<{ plans: { id: string; name: string }[] }>({
    queryKey: ['admin-plans'],
    queryFn: () => apiGet('/api/admin/plans'),
  })

  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPatch('/api/admin/tenants', body),
    onSuccess: (res: { redirect?: string }) => {
      if (res?.redirect) {
        window.location.hash = res.redirect
        return
      }
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      qc.invalidateQueries({ queryKey: ['admin-overview'] })
      toast({ title: 'انجام شد' })
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : 'خطا', variant: 'destructive' }),
  })

  if (isLoading) return <AdminSkeleton />
  const tenants = data?.tenants || []

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="vb-overline mb-2">Multi-Tenant Management</p>
          <h1 className="vb-display text-3xl">مدیریت مستأجرها</h1>
        </div>
        <button onClick={() => setCreating(true)} className="vb-btn vb-btn-primary">
          <Plus className="w-4 h-4" /> Tenant جدید
        </button>
      </div>

      <div className="vb-card overflow-x-auto nice-scroll">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b-2 border-[#0a0a0a] text-xs">
              {['مرکز', 'پلن', 'شعب/خدمات', 'کاربران', 'مشتریان', 'نوبت‌ها', 'وضعیت', 'عملیات'].map((h) => (
                <th key={h} className="px-4 py-3 text-right font-black text-[#525252]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f0]">
            {tenants.map((t) => (
              <tr key={t.id} className="hover:bg-[#fafafa]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 bg-[#0a0a0a] text-[#fafafa] font-black flex items-center justify-center shrink-0">{t.logoText}</span>
                    <div>
                      <p className="font-black">{t.name}</p>
                      <p className="text-[10px] text-[#525252] vb-code">{t.slug}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs font-bold">{t.plan?.name || '—'}</td>
                <td className="px-4 py-3 text-xs">{faDigits(t._count.branches)} / {faDigits(t._count.services)}</td>
                <td className="px-4 py-3 text-xs">{faDigits(t._count.users)}</td>
                <td className="px-4 py-3 text-xs">{faDigits(t._count.customers)}</td>
                <td className="px-4 py-3 text-xs font-bold">{faDigits(t._count.appointments)}</td>
                <td className="px-4 py-3">
                  <span className={statusChipClass(t.status)}>{t.status === 'ACTIVE' ? 'فعال' : t.status === 'SUSPENDED' ? 'تعلیق' : 'در انتظار'}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {t.status === 'ACTIVE' ? (
                      <IconBtn title="تعلیق" onClick={() => act.mutate({ id: t.id, action: 'suspend' })}>
                        <Pause className="w-3.5 h-3.5 text-[#ca8a04]" />
                      </IconBtn>
                    ) : (
                      <IconBtn title="فعال‌سازی" onClick={() => act.mutate({ id: t.id, action: 'activate' })}>
                        <Play className="w-3.5 h-3.5 text-[#16a34a]" />
                      </IconBtn>
                    )}
                    <IconBtn title="تغییر پلن" onClick={() => setPlanChange(t)}>
                      <Repeat className="w-3.5 h-3.5" />
                    </IconBtn>
                    <IconBtn title="ورود به پنل (Impersonate)" onClick={() => act.mutate({ id: t.id, action: 'impersonate' })}>
                      <LogInIcon className="w-3.5 h-3.5 text-[#ef4444]" />
                    </IconBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateTenantDialog open={creating} plans={plansData?.plans || []} onClose={() => setCreating(false)} />

      {planChange && (
        <Dialog open onOpenChange={(v) => !v && setPlanChange(null)}>
          <DialogContent className="sm:max-w-sm p-6" dir="rtl">
            <DialogHeader><DialogTitle className="font-black">تغییر پلن {planChange.name}</DialogTitle></DialogHeader>
            <div className="space-y-2 mt-2">
              {(plansData?.plans || []).map((p) => (
                <button
                  key={p.id}
                  onClick={() => { act.mutate({ id: planChange.id, action: 'change_plan', planId: p.id }); setPlanChange(null) }}
                  className={`w-full flex items-center justify-between border-2 px-4 py-3 text-sm font-bold transition-colors hover:border-[#ef4444] ${
                    planChange.plan?.id === p.id ? 'border-[#0a0a0a] bg-[#f5f5f5]' : 'border-[#e5e5e5]'
                  }`}
                >
                  <span>{p.name}</span>
                  {planChange.plan?.id === p.id && <Crown className="w-4 h-4 text-[#ef4444]" />}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-8 h-8 border-2 border-[#e5e5e5] flex items-center justify-center text-[#525252] hover:border-[#0a0a0a] hover:text-[#0a0a0a] transition-colors"
    >
      {children}
    </button>
  )
}

function CreateTenantDialog({ open, plans, onClose }: { open: boolean; plans: { id: string; name: string }[]; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('خدمات')
  const [planId, setPlanId] = useState<string | null>(null)
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')

  const create = useMutation({
    mutationFn: () => apiPost('/api/admin/tenants', { name, category, planId, ownerName, ownerEmail }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      toast({ title: 'مستأجر جدید ایجاد شد' })
      onClose()
      setName(''); setOwnerName(''); setOwnerEmail('')
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : 'خطا', variant: 'destructive' }),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md p-6" dir="rtl">
        <DialogHeader><DialogTitle className="font-black">ایجاد Tenant جدید</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs font-bold">نام مرکز *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 rounded-none" placeholder="مثلاً آزمایشگاه ژن" />
          </div>
          <div>
            <Label className="text-xs font-bold">دسته‌بندی</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 rounded-none" />
          </div>
          <div>
            <Label className="text-xs font-bold">پلن اولیه</Label>
            <div className="flex flex-wrap gap-2">
              {plans.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlanId(p.id)}
                  className={`px-3 py-2 text-xs font-bold border-2 transition-colors ${
                    planId === p.id ? 'bg-[#0a0a0a] text-[#fafafa] border-[#0a0a0a]' : 'border-[#e5e5e5] hover:border-[#0a0a0a]'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t-2 border-dashed border-[#e5e5e5] pt-3 space-y-3">
            <p className="text-xs font-bold text-[#525252]">حساب مدیر مرکز (اختیاری):</p>
            <div className="grid grid-cols-2 gap-3">
              <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="h-10 rounded-none" placeholder="نام مدیر" />
              <Input value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className="h-10 rounded-none" placeholder="owner@center.ir" dir="ltr" />
            </div>
            <p className="text-[10px] text-[#525252]">رمز اولیه: demo1234</p>
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()}
            className="w-full h-11 rounded-none bg-[#0a0a0a] text-[#fafafa] hover:bg-[#ef4444] font-bold">
            ایجاد مستأجر
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────── Plans & Feature Flags ───────────────────────────

interface PlanRow {
  id: string; name: string; slug: string; tagline: string | null
  priceMonthly: number; maxBranches: number; maxStaff: number; maxBookings: number; smsQuota: number
  features: string; isPopular: boolean
  _count: { tenants: number }
}

const FEATURE_LABELS: Record<string, string> = {
  multi_branch: 'چند شعبه‌ای',
  sms: 'اطلاع‌رسانی SMS',
  api: 'API عمومی',
  reports: 'گزارش‌های پیشرفته',
  priority_queue: 'صف اولویت‌دار',
  custom_branding: 'برندینگ اختصاصی',
  webhooks: 'Webhooks',
  advanced_analytics: 'تحلیل پیشرفته',
}

function PlansSection() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [editing, setEditing] = useState<PlanRow | null>(null)

  const { data, isLoading } = useQuery<{ plans: PlanRow[]; features: string[] }>({
    queryKey: ['admin-plans-full'],
    queryFn: () => apiGet('/api/admin/plans'),
  })

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPatch('/api/admin/plans', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-plans-full'] })
      qc.invalidateQueries({ queryKey: ['admin-plans'] })
      toast({ title: 'پلن بروزرسانی شد' })
      setEditing(null)
    },
  })

  if (isLoading || !data) return <AdminSkeleton />

  return (
    <div className="space-y-5">
      <div>
        <p className="vb-overline mb-2">Subscription & Feature Flags</p>
        <h1 className="vb-display text-3xl">پلن‌ها</h1>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.plans.map((p) => {
          let features: string[] = []
          try { features = JSON.parse(p.features || '[]') } catch { /* noop */ }
          return (
            <div key={p.id} className={`${p.isPopular ? 'vb-card-elevated' : 'vb-card'} p-5 flex flex-col`}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-black text-lg">{p.name}</p>
                <button onClick={() => setEditing(p)} className="text-xs font-bold text-[#525252] hover:text-[#ef4444]">ویرایش</button>
              </div>
              <p className="text-[11px] text-[#525252] mb-3">{p.tagline}</p>
              <p className="font-black text-xl text-[#ef4444] mb-4">
                {p.priceMonthly > 0 ? tomanFa(p.priceMonthly) : p.slug === 'enterprise' ? 'تماس بگیرید' : 'رایگان'}
              </p>
              <div className="text-xs space-y-1.5 text-[#525252] flex-1">
                <p>شعبه: {p.maxBranches >= 999 ? 'نامحدود' : faDigits(p.maxBranches)}</p>
                <p>کارمند: {p.maxStaff >= 999 ? 'نامحدود' : faDigits(p.maxStaff)}</p>
                <p>نوبت/ماه: {p.maxBookings >= 999999 ? 'نامحدود' : faNumber(p.maxBookings)}</p>
                <p>پیامک/ماه: {faNumber(p.smsQuota)}</p>
              </div>
              <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t-2 border-[#e5e5e5]">
                {features.map((f) => (
                  <span key={f} className="vb-chip vb-chip-muted !text-[9px]">{FEATURE_LABELS[f] || f}</span>
                ))}
              </div>
              <p className="text-[10px] text-[#525252] mt-3">{faDigits(p._count.tenants)} مستأجر فعال</p>
            </div>
          )
        })}
      </div>

      {editing && <PlanEditDialog plan={editing} features={data.features} onSave={(body) => save.mutate(body)} onClose={() => setEditing(null)} />}
    </div>
  )
}

function PlanEditDialog({ plan, features, onSave, onClose }: {
  plan: PlanRow
  features: string[]
  onSave: (body: Record<string, unknown>) => void
  onClose: () => void
}) {
  const [name, setName] = useState(plan.name)
  const [tagline, setTagline] = useState(plan.tagline || '')
  const [price, setPrice] = useState(String(plan.priceMonthly))
  const [maxBranches, setMaxBranches] = useState(String(plan.maxBranches))
  const [maxStaff, setMaxStaff] = useState(String(plan.maxStaff))
  const [maxBookings, setMaxBookings] = useState(String(plan.maxBookings))
  const [smsQuota, setSmsQuota] = useState(String(plan.smsQuota))
  let initial: string[] = []
  try { initial = JSON.parse(plan.features || '[]') } catch { /* noop */ }
  const [selected, setSelected] = useState<string[]>(initial)

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto nice-scroll p-6" dir="rtl">
        <DialogHeader><DialogTitle className="font-black">ویرایش پلن {plan.name}</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold">نام</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 rounded-none" />
            </div>
            <div>
              <Label className="text-xs font-bold">قیمت ماهانه (تومان)</Label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="h-10 rounded-none" dir="ltr" />
            </div>
          </div>
          <div>
            <Label className="text-xs font-bold">توضیح کوتاه</Label>
            <Input value={tagline} onChange={(e) => setTagline(e.target.value)} className="h-10 rounded-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold">حداکثر شعبه</Label>
              <Input type="number" value={maxBranches} onChange={(e) => setMaxBranches(e.target.value)} className="h-10 rounded-none" dir="ltr" />
            </div>
            <div>
              <Label className="text-xs font-bold">حداکثر کارمند</Label>
              <Input type="number" value={maxStaff} onChange={(e) => setMaxStaff(e.target.value)} className="h-10 rounded-none" dir="ltr" />
            </div>
            <div>
              <Label className="text-xs font-bold">حداکثر نوبت/ماه</Label>
              <Input type="number" value={maxBookings} onChange={(e) => setMaxBookings(e.target.value)} className="h-10 rounded-none" dir="ltr" />
            </div>
            <div>
              <Label className="text-xs font-bold">سهمیه پیامک/ماه</Label>
              <Input type="number" value={smsQuota} onChange={(e) => setSmsQuota(e.target.value)} className="h-10 rounded-none" dir="ltr" />
            </div>
          </div>
          <div>
            <Label className="text-xs font-bold mb-2 block">Feature Flags (PRD §28)</Label>
            <div className="grid grid-cols-2 gap-2 border-2 border-[#e5e5e5] p-3">
              {features.map((f) => (
                <label key={f} className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <Switch
                    checked={selected.includes(f)}
                    onCheckedChange={(v) => setSelected((prev) => v ? [...prev, f] : prev.filter((x) => x !== f))}
                    className="data-[state=checked]:bg-[#0a0a0a]"
                  />
                  {FEATURE_LABELS[f] || f}
                </label>
              ))}
            </div>
          </div>
          <Button
            onClick={() => onSave({
              id: plan.id, name, tagline, priceMonthly: Number(price), maxBranches: Number(maxBranches),
              maxStaff: Number(maxStaff), maxBookings: Number(maxBookings), smsQuota: Number(smsQuota), features: selected,
            })}
            className="w-full h-11 rounded-none bg-[#0a0a0a] text-[#fafafa] hover:bg-[#ef4444] font-bold"
          >
            ذخیره پلن
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────── Tickets ───────────────────────────

interface TicketRow {
  id: string; subject: string; body: string; priority: string; status: string
  createdBy: string; assignee: string | null; createdAt: string; updatedAt: string
  tenant?: { name: string } | null
}

const NEXT_STATUS: Record<string, string[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['WAITING_FOR_CUSTOMER', 'RESOLVED'],
  WAITING_FOR_CUSTOMER: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
}

function TicketsSection() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data, isLoading } = useQuery<{ tickets: TicketRow[] }>({
    queryKey: ['admin-tickets'],
    queryFn: () => apiGet('/api/admin/tickets'),
  })

  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPatch('/api/admin/tickets', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tickets'] })
      qc.invalidateQueries({ queryKey: ['admin-overview'] })
      toast({ title: 'وضعیت تیکت بروزرسانی شد' })
    },
  })

  if (isLoading) return <AdminSkeleton />
  const tickets = data?.tickets || []

  return (
    <div className="space-y-5">
      <div>
        <p className="vb-overline mb-2">پشتیبانی مرکزی SaaS</p>
        <h1 className="vb-display text-3xl">تیکت‌ها</h1>
      </div>
      <div className="space-y-3">
        {tickets.map((t) => (
          <div key={t.id} className="vb-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-black">{t.subject}</p>
                <span className={`vb-chip ${t.priority === 'URGENT' || t.priority === 'HIGH' ? 'vb-chip-error' : 'vb-chip-muted'}`}>
                  {TICKET_PRIORITY_FA[t.priority]}
                </span>
                <span className={statusChipClass(t.status)}>{TICKET_STATUS_FA[t.status]}</span>
              </div>
              <span className="text-[10px] text-[#525252] font-bold">
                {t.tenant?.name || '—'} • {formatJalaliFull(t.createdAt)}
              </span>
            </div>
            <p className="text-sm text-[#525252] leading-7 mb-3">{t.body}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-[#525252]">اقدامات:</span>
              {(NEXT_STATUS[t.status] || []).map((next) => (
                <button
                  key={next}
                  onClick={() => act.mutate({ id: t.id, status: next, assignee: t.assignee || 'مدیر سیستم' })}
                  className="vb-btn vb-btn-secondary vb-btn-sm"
                >
                  {next === 'IN_PROGRESS' ? 'شروع بررسی' : next === 'WAITING_FOR_CUSTOMER' ? 'در انتظار پاسخ مشتری' : next === 'RESOLVED' ? 'حل شد' : next === 'CLOSED' ? 'بستن' : TICKET_STATUS_FA[next]}
                </button>
              ))}
              {(NEXT_STATUS[t.status] || []).length === 0 && (
                <span className="text-[11px] text-[#a3a3a3] font-bold">تیکت بسته شده است.</span>
              )}
            </div>
          </div>
        ))}
        {tickets.length === 0 && (
          <p className="text-center text-sm font-bold text-[#525252] py-10">تیکتی وجود ندارد.</p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────── Platform SMS ───────────────────────────

function PlatformSms() {
  const { data, isLoading } = useQuery<{ notifications: {
    id: string; type: string; recipient: string; body: string; status: string; createdAt: string
    tenant?: { name: string } | null
    appointment?: { code: string } | null
  }[] }>({
    queryKey: ['admin-sms'],
    queryFn: () => apiGet('/api/admin/notifications'),
  })
  if (isLoading) return <AdminSkeleton />
  const notifications = data?.notifications || []

  return (
    <div className="space-y-5">
      <div>
        <p className="vb-overline mb-2">Notification Engine — کل پلتفرم</p>
        <h1 className="vb-display text-3xl">پیامک‌های پلتفرم</h1>
      </div>
      <div className="vb-card divide-y divide-[#f0f0f0] max-h-[70vh] overflow-y-auto nice-scroll">
        {notifications.map((n) => (
          <div key={n.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-black text-sm">{NOTIFICATION_TYPE_FA[n.type] || n.type}</span>
              <span className="text-[11px] font-bold text-[#525252]">{n.tenant?.name}</span>
              <span className="vb-code text-[11px] text-[#525252]">{faDigits(n.recipient)}</span>
              {n.appointment && <span className="vb-code text-[11px] font-bold">{n.appointment.code}</span>}
              <span className={statusChipClass(n.status)}>{n.status === 'SENT' ? 'ارسال شد' : n.status}</span>
              <span className="text-[10px] text-[#a3a3a3] ms-auto">
                {formatJalaliFull(n.createdAt)} {faDigits(formatTime(new Date(n.createdAt)))}
              </span>
            </div>
            <p className="text-xs text-[#525252] leading-6 whitespace-pre-line line-clamp-2">{n.body}</p>
          </div>
        ))}
        {notifications.length === 0 && <p className="p-10 text-center text-sm font-bold text-[#525252]">پیامکی ثبت نشده است.</p>}
      </div>
    </div>
  )
}

// ─────────────────────────── Platform Audit ───────────────────────────

function PlatformAudit() {
  const { data, isLoading } = useQuery<{ logs: {
    id: string; actor: string; role: string | null; action: string; entityType: string
    entityId: string | null; detail: string | null; createdAt: string
    tenant?: { name: string } | null
  }[] }>({
    queryKey: ['admin-audit'],
    queryFn: () => apiGet('/api/admin/audit-logs'),
  })
  if (isLoading) return <AdminSkeleton />
  const logs = data?.logs || []

  return (
    <div className="space-y-5">
      <div>
        <p className="vb-overline mb-2">AC-008 — تمام تغییرات حساس</p>
        <h1 className="vb-display text-3xl">Audit Log کل سیستم</h1>
      </div>
      <div className="vb-card overflow-x-auto nice-scroll">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b-2 border-[#0a0a0a] text-xs">
              {['زمان', 'Tenant', 'کاربر', 'عملیات', 'موجودیت', 'جزئیات'].map((h) => (
                <th key={h} className="px-4 py-3 text-right font-black text-[#525252]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f0]">
            {logs.map((l) => (
              <tr key={l.id} className="hover:bg-[#fafafa]">
                <td className="px-4 py-2.5 text-xs">
                  <p className="font-bold">{formatJalaliFull(l.createdAt)}</p>
                  <p className="vb-code text-[#525252]">{faDigits(formatTime(new Date(l.createdAt)))}</p>
                </td>
                <td className="px-4 py-2.5 text-xs">{l.tenant?.name || <span className="text-[#ef4444] font-bold">پلتفرم</span>}</td>
                <td className="px-4 py-2.5 text-xs">
                  <p className="font-bold">{l.actor}</p>
                  <p className="text-[10px] text-[#525252]">{l.role}</p>
                </td>
                <td className="px-4 py-2.5 text-xs font-bold">{AUDIT_ACTION_FA[l.action] || l.action}</td>
                <td className="px-4 py-2.5 text-xs text-[#525252]">{l.entityType}</td>
                <td className="px-4 py-2.5 text-[11px] text-[#525252] max-w-[220px] truncate" dir="ltr">{l.detail || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
