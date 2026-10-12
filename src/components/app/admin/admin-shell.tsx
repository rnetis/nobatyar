'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete } from '../api-client'
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
  Pause, Play, Repeat, LogIn as LogInIcon, Plus, Crown, UserPlus,
} from 'lucide-react'

const NAV = [
  { key: 'overview', label: 'نمای کلی پلتفرم', icon: Gauge },
  { key: 'tenants', label: 'مدیریت مستأجرها', icon: Building2 },
  { key: 'plans', label: 'پلن‌ها و Feature Flags', icon: Layers },
  { key: 'tickets', label: 'تیکت‌های پشتیبانی', icon: LifeBuoy },
  { key: 'users', label: 'کاربران و تأیید درخواست‌ها', icon: UserPlus },
  { key: 'sms', label: 'پیامک‌های پلتفرم', icon: MessageSquareText },
  { key: 'tenant-sms', label: 'تنظیمات پیامک (پلتفرم)', icon: MessageSquareText },
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
          {active === 'users' && <UsersSection />}
          {active === 'sms' && <PlatformSms />}
          {active === 'tenant-sms' && <TenantSmsConfig />}
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
    mutationFn: (body: Record<string, unknown>) => apiPatch<{ redirect?: string }>('/api/admin/tenants', body),
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
  const [issuedPassword, setIssuedPassword] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => apiPost<{ initialPassword?: string }>('/api/admin/tenants', { name, category, planId, ownerName, ownerEmail }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      toast({ title: 'مستأجر جدید ایجاد شد' })
      setName(''); setOwnerName(''); setOwnerEmail('')
      if (res?.initialPassword) {
        setIssuedPassword(res.initialPassword)
      } else {
        onClose()
      }
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : 'خطا', variant: 'destructive' }),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md p-6" dir="rtl">
        <DialogHeader><DialogTitle className="font-black">ایجاد Tenant جدید</DialogTitle></DialogHeader>
        {issuedPassword ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-bold">حساب مدیر مرکز ساخته شد.</p>
            <p className="text-xs text-[#525252]">این رمز عبور اولیه فقط همین یک‌بار نمایش داده می‌شود — آن را برای مدیر مرکز کپی کنید:</p>
            <div className="border-2 border-[#0a0a0a] bg-[#f5f5f5] px-4 py-3 vb-code text-center text-lg font-black select-all" dir="ltr">
              {issuedPassword}
            </div>
            <Button onClick={() => { setIssuedPassword(null); onClose() }}
              className="w-full h-11 rounded-none bg-[#0a0a0a] text-[#fafafa] hover:bg-[#ef4444] font-bold">
              کپی شد — بستن
            </Button>
          </div>
        ) : (
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
            <p className="text-[10px] text-[#525252]">یک رمز عبور اولیهٔ امن به‌صورت خودکار ساخته و یک‌بار در همین دیالوگ نمایش داده می‌شود.</p>
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()}
            className="w-full h-11 rounded-none bg-[#0a0a0a] text-[#fafafa] hover:bg-[#ef4444] font-bold">
            ایجاد مستأجر
          </Button>
        </div>
        )}
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

// ─────────────────────────── Users (admin-managed) ───────────────────────────

interface UserRow {
  id: string
  tenantId: string | null
  name: string
  email: string
  mobile: string | null
  role: string
  status: string
  createdAt: string
}

const ROLE_FA: Record<string, string> = {
  TENANT_OWNER: 'مالک کسب‌وکار',
  TENANT_ADMIN: 'مدیر مرکز',
  MANAGER: 'مدیر',
  OPERATOR: 'اپراتور',
  STAFF: 'کارمند',
}

interface PendingUserRow {
  id: string
  name: string
  email: string
  mobile: string | null
  role: string
  plannedBusinessName: string | null
  createdAt: string
}

function UsersSection() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [filter, setFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [approving, setApproving] = useState<PendingUserRow | null>(null)
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null)

  const { data, isLoading } = useQuery<{ users: UserRow[]; total: number; pending: PendingUserRow[] }>({
    queryKey: ['admin-users'],
    queryFn: () => apiGet(`/api/admin/users${filter ? `?q=${encodeURIComponent(filter)}` : ''}`),
  })
  const { data: tenantsData } = useQuery<{ tenants: { id: string; name: string }[] }>({
    queryKey: ['admin-tenants'],
    queryFn: () => apiGet('/api/admin/tenants'),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-users'] })
    qc.invalidateQueries({ queryKey: ['admin-overview'] })
  }

  const act = useMutation({
    mutationFn: async ({ method, body }: { method: 'patch' | 'delete'; body?: Record<string, unknown> }) => {
      if (method === 'patch') {
        return await apiPatch<{ initialPassword?: string; message?: string }>('/api/admin/users', body || {})
      }
      await apiDelete<{ ok: boolean }>(`/api/admin/users?id=${body?.id}`)
      return {}
    },
    onSuccess: (res: { initialPassword?: string; message?: string }) => {
      invalidate()
      setCreating(false)
      setEditing(null)
      if (res?.initialPassword) {
        // approver path: remember which pending request was approved
        setIssued({ email: approving?.email || '', password: res.initialPassword })
        setApproving(null)
      }
      toast({ title: res?.message || 'انجام شد' })
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : 'خطا', variant: 'destructive' }),
  })

  if (isLoading) return <AdminSkeleton />
  const users = data?.users || []

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="vb-overline mb-2">مدیریت کاربران</p>
          <h1 className="vb-display text-3xl">کاربران</h1>
        </div>
        <button onClick={() => setCreating(true)} className="vb-btn vb-btn-primary">
          <Plus className="w-4 h-4" /> کاربر جدید
        </button>
      </div>

      {/* Registration requests awaiting review */}
      {(data?.pending || []).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-black text-[#525252]">درخواست‌های ثبت‌نام در انتظار تأیید:</p>
          {(data?.pending || []).map((u) => (
            <div key={u.id} className="vb-card p-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-black text-sm">{u.name}</p>
                <span className="vb-code text-[11px] text-[#525252]" dir="ltr">{u.email}</span>
                {u.plannedBusinessName && <span className="vb-chip vb-chip-muted text-[10px]">{u.plannedBusinessName}</span>}
                {u.mobile && <span className="vb-code text-[11px] text-[#525252]">{faDigits(u.mobile)}</span>}
                <span className="text-[10px] text-[#a3a3a3] font-bold">{formatJalaliFull(u.createdAt)}</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="vb-btn vb-btn-primary vb-btn-sm" onClick={() => setApproving(u)}>
                  <UserPlus className="w-3.5 h-3.5" /> تأیید
                </button>
                <button
                  className="vb-btn vb-btn-ghost vb-btn-sm"
                  onClick={() => act.mutate({ method: 'patch', body: { email: u.email, action: 'reject' } })}
                >
                  رد
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Input placeholder="جستجو: نام، ایمیل یا موبایل..." value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-sm" />

      <div className="vb-card overflow-x-auto nice-scroll">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b-2 border-[#0a0a0a] text-xs">
              {['کاربر', 'نقش', 'وضعیت', 'تاریخ ایجاد', 'عملیات'].map((h) => (
                <th key={h} className="px-4 py-3 text-right font-black text-[#525252]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f0]">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-[#fafafa]">
                <td className="px-4 py-3">
                  <p className="font-black">{u.name}</p>
                  <p className="text-[10px] text-[#525252] vb-code" dir="ltr">{u.email}</p>
                </td>
                <td className="px-4 py-3 text-xs font-bold">{ROLE_FA[u.role] || u.role}</td>
                <td className="px-4 py-3">
                  <span className={statusChipClass(u.status)}>{u.status === 'ACTIVE' ? 'فعال' : 'غیرفعال'}</span>
                </td>
                <td className="px-4 py-3 text-xs">{formatJalaliFull(u.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <IconBtn title="ویرایش" onClick={() => setEditing(u)}>
                      <Repeat className="w-3.5 h-3.5" />
                    </IconBtn>
                    <IconBtn title="ریست رمز عبور" onClick={() => act.mutate({ method: 'patch', body: { id: u.id, resetPassword: true } })}>
                      <Crown className="w-3.5 h-3.5 text-[#ca8a04]" />
                    </IconBtn>
                    <IconBtn
                      title={u.status === 'ACTIVE' ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                      onClick={() => act.mutate({ method: 'patch', body: { id: u.id, status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' } })}
                    >
                      {u.status === 'ACTIVE' ? <Pause className="w-3.5 h-3.5 text-[#ca8a04]" /> : <Play className="w-3.5 h-3.5 text-[#16a34a]" />}
                    </IconBtn>
                    <IconBtn title="حذف" onClick={() => act.mutate({ method: 'delete', body: { id: u.id } })}>
                      <LogOut className="w-3.5 h-3.5 text-[#ef4444]" />
                    </IconBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <p className="p-10 text-center text-sm font-bold text-[#525252]">کاربری یافت نشد.</p>}
      </div>

      {creating && <UserFormDialog onClose={() => setCreating(false)} onCreated={(pw) => { setIssued(pw); invalidate() }} tenants={tenantsData?.tenants} />}

      {editing && <UserEditDialog user={editing} onClose={() => setEditing(null)} onSaved={(pw) => { if (pw) setIssued(pw); invalidate() }} />}

      {approving && (
        <Dialog open onOpenChange={(v) => !v && setApproving(null)}>
          <DialogContent className="sm:max-w-sm p-6" dir="rtl">
            <DialogHeader><DialogTitle className="font-black">تأیید ثبت‌نام {approving.name}</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <p className="text-xs text-[#525252]" dir="ltr">{approving.email}</p>
              {approving.plannedBusinessName && (
                <p className="text-xs font-bold">کسب‌وکار موردنظر: {approving.plannedBusinessName}</p>
              )}
              <div>
                <Label className="text-xs font-black mb-1.5 block">نقش</Label>
                <select
                  defaultValue={approving.role || 'TENANT_OWNER'}
                  id="approve-role"
                  className="w-full border-2 border-[#0a0a0a] px-3 py-2 text-sm bg-[#fafafa]"
                >
                  <option value="TENANT_OWNER">مالک کسب‌وکار</option>
                  <option value="TENANT_ADMIN">مدیر مرکز</option>
                  <option value="MANAGER">مدیر</option>
                  <option value="OPERATOR">اپراتور</option>
                  <option value="STAFF">کارمند</option>
                </select>
              </div>
              <button
                className="vb-btn vb-btn-primary w-full"
                disabled={act.isPending}
                onClick={() => {
                  const el = document.getElementById('approve-role') as HTMLSelectElement | null
                  act.mutate({ method: 'patch', body: { email: approving.email, action: 'approve', role: el?.value || 'TENANT_OWNER' } })
                }}
              >
                {act.isPending ? 'در حال تأیید...' : 'تأیید و صدور رمز'}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {issued && (
        <Dialog open onOpenChange={(v) => !v && setIssued(null)}>
          <DialogContent className="sm:max-w-sm p-6" dir="rtl">
            <DialogHeader><DialogTitle className="font-black">رمز عبور اولیه</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <p className="text-sm text-[#525252]">این رمز فقط یک‌بار نمایش داده می‌شود. آن را به صورت امن در اختیار <span className="font-black">{issued.email || 'کاربر'}</span> بگذارید.</p>
              <p className="vb-code bg-[#f5f5f5] border-2 border-[#0a0a0a] p-3 text-center text-lg font-black" dir="ltr">{issued.password}</p>
              <Button className="w-full" onClick={() => { navigator.clipboard.writeText(issued.password); toast({ title: 'رمز کپی شد' }) }}>
                کپی رمز
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// ─────────────────────────── User dialogs ───────────────────────────

interface UserFormDialogProps {
  onClose: () => void
  onCreated: (issued: { email: string; password: string }) => void
  tenants?: { id: string; name: string }[]
}

function UserFormDialog({ onClose, onCreated, tenants }: UserFormDialogProps) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [role, setRole] = useState('TENANT_OWNER')
  const [tenantId, setTenantId] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const res = await apiPost<{ initialPassword: string; user: { email: string } }>('/api/admin/users', {
        name, email, mobile: mobile || undefined, role, tenantId: tenantId || undefined,
      })
      onCreated({ email: res.user.email, password: res.initialPassword })
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'خطا', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm p-6" dir="rtl">
        <DialogHeader><DialogTitle className="font-black">کاربر جدید</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs font-black mb-1.5 block">نام</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-black mb-1.5 block">ایمیل</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
          </div>
          <div>
            <Label className="text-xs font-black mb-1.5 block">موبایل (اختیاری)</Label>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} dir="ltr" placeholder="09..." />
          </div>
          <div>
            <Label className="text-xs font-black mb-1.5 block">نقش</Label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full border-2 border-[#0a0a0a] px-3 py-2 text-sm bg-[#fafafa]">
              <option value="TENANT_OWNER">مالک کسب‌وکار</option>
              <option value="TENANT_ADMIN">مدیر مرکز</option>
              <option value="MANAGER">مدیر</option>
              <option value="OPERATOR">اپراتور</option>
              <option value="STAFF">کارمند</option>
            </select>
          </div>
          <div>
            <Label className="text-xs font-black mb-1.5 block">مستأجر (اختیاری)</Label>
            <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="w-full border-2 border-[#0a0a0a] px-3 py-2 text-sm bg-[#fafafa]">
              <option value="">-- بدون مستأجر --</option>
              {(tenants || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <button className="vb-btn vb-btn-primary w-full" disabled={busy || !name || !email} onClick={submit}>
            {busy ? 'در حال ایجاد...' : 'ایجاد کاربر و صدور رمز'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function UserEditDialog({ user, onClose, onSaved }: { user: UserRow; onClose: () => void; onSaved: (pw?: { email: string; password: string }) => void }) {
  const { toast } = useToast()
  const [name, setName] = useState(user.name)
  const [mobile, setMobile] = useState(user.mobile || '')
  const [role, setRole] = useState(user.role)
  const [status, setStatus] = useState(user.status)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const res = await apiPatch<{ initialPassword?: string }>('/api/admin/users', {
        id: user.id, name, mobile: mobile || undefined, role, status,
      })
      onSaved(res?.initialPassword ? { email: user.email, password: res.initialPassword } : undefined)
      if (!res?.initialPassword) onClose()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'خطا', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm p-6" dir="rtl">
        <DialogHeader><DialogTitle className="font-black">ویرایش {user.name}</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs font-black mb-1.5 block">نام</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-black mb-1.5 block">موبایل</Label>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} dir="ltr" />
          </div>
          <div>
            <Label className="text-xs font-black mb-1.5 block">نقش</Label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full border-2 border-[#0a0a0a] px-3 py-2 text-sm bg-[#fafafa]">
              <option value="TENANT_OWNER">مالک کسب‌وکار</option>
              <option value="TENANT_ADMIN">مدیر مرکز</option>
              <option value="MANAGER">مدیر</option>
              <option value="OPERATOR">اپراتور</option>
              <option value="STAFF">کارمند</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={status === 'ACTIVE'} onCheckedChange={(v) => setStatus(v ? 'ACTIVE' : 'DISABLED')} />
            <Label className="text-xs font-black">فعال</Label>
          </div>
          <button className="vb-btn vb-btn-primary w-full" disabled={busy} onClick={submit}>
            {busy ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────── Platform SMS ───────────────────────────

interface TenantSmsConfigState {
  provider: 'sms.ir' | 'httpsms' | 'disabled'
  config: { apiKey?: string; lineNumber?: string; from?: string }
}

/** Admin: tenant-level SMS provider + notification templates. */
function TenantSmsConfig() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [tenantId, setTenantId] = useState('')
  const [smsConfig, setSmsConfig] = useState<TenantSmsConfigState>({ provider: 'disabled', config: {} })
  const [templates, setTemplates] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const { data: tenantsData } = useQuery<{ tenants: { id: string; name: string }[] }>({
    queryKey: ['admin-tenants'],
    queryFn: () => apiGet('/api/admin/tenants'),
  })

  const save = useMutation({
    mutationFn: () => apiPost('/api/admin/tenants', { id: tenantId, smsConfig, notificationTemplates: templates }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      toast({ title: 'تنظیمات پیامک ذخیره شد' })
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : 'خطا', variant: 'destructive' }),
  })

  const tplTypeOptions = [
    { key: 'BOOKING_CREATED', label: 'تایید نوبت' },
    { key: 'QUEUE_CHANGED', label: 'تغییر جایگاه صف' },
    { key: 'RESCHEDULED', label: 'جابجایی زمان' },
    { key: 'CANCELLED', label: 'لغو نوبت' },
    { key: 'YOUR_TURN', label: 'نوبت نزدیک' },
    { key: 'CALLED', label: 'فراخوانی' },
    { key: 'NO_SHOW', label: 'عدم حضور' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <p className="vb-overline mb-2">پیکربندی ارائه‌دهنده پیامک (PRD §19-21)</p>
        <h1 className="vb-display text-3xl">تنظیمات پیامک پلتفرم</h1>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <div className="vb-card p-5">
          <p className="font-black mb-4">تنظیمات ارائه‌دهنده پیامک</p>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-bold">مستأجر</Label>
              <select
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="w-full border-2 border-[#0a0a0a] px-3 py-2 text-sm bg-[#fafafa]"
              >
                <option value="">-- انتخاب مستأجر --</option>
                {(tenantsData?.tenants || []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs font-bold">ارائه‌دهنده پیامک</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {(['sms.ir', 'httpsms', 'disabled'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setSmsConfig((prev) => ({ ...prev, provider: p, config: prev.config }))}
                    className={`px-3 py-2 text-xs font-bold border-2 transition-colors ${
                      smsConfig.provider === p ? 'bg-[#0a0a0a] text-[#fafafa] border-[#0a0a0a]' : 'border-[#e5e5e5] hover:border-[#0a0a0a]'
                    }`}
                  >
                    {p === 'sms.ir' ? 'sms.ir' : p === 'httpsms' ? 'httpsms.com' : 'خالی (پلتفرم)'}
                  </button>
                ))}
              </div>
            </div>
            {smsConfig.provider === 'sms.ir' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold">API Key (sms.ir)</Label>
                  <Input
                    value={smsConfig.config.apiKey || ''}
                    onChange={(e) => setSmsConfig((prev) => ({ ...prev, config: { ...prev.config, apiKey: e.target.value } }))}
                    dir="ltr"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold">شماره خط (مثال 989999783444)</Label>
                  <Input
                    value={smsConfig.config.lineNumber || ''}
                    onChange={(e) => setSmsConfig((prev) => ({ ...prev, config: { ...prev.config, lineNumber: e.target.value } }))}
                    dir="ltr"
                    placeholder="بدون صفر"
                  />
                </div>
              </div>
            )}
            {smsConfig.provider === 'httpsms' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold">API Key (x-api-Key)</Label>
                  <Input
                    value={smsConfig.config.apiKey || ''}
                    onChange={(e) => setSmsConfig((prev) => ({ ...prev, config: { ...prev.config, apiKey: e.target.value } }))}
                    dir="ltr"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold">شماره ارسالگر (from)</Label>
                  <Input
                    value={smsConfig.config.from || ''}
                    onChange={(e) => setSmsConfig((prev) => ({ ...prev, config: { ...prev.config, from: e.target.value } }))}
                    dir="ltr"
                    placeholder="+98..."
                  />
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs font-bold">توضیحات</Label>
              <p className="text-[11px] text-[#525252] mt-1 leading-6">
                این تنظیمات برای این مستأجر کامل است. وقتی خالی باشد، از تنظیمات پلتفرم استفاده می‌شود.
              </p>
            </div>
            <Button
              onClick={() => save.mutate()}
              disabled={saving || !tenantId}
              className="w-full h-11 rounded-none bg-[#0a0a0a] text-[#fafafa] hover:bg-[#ef4444] font-bold"
            >
              {saving ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}
            </Button>
          </div>
        </div>

        <div className="vb-card p-5">
          <p className="font-black mb-4">الگوهای پیامک (jinja2-style)</p>
          <p className="text-[11px] text-[#525252] mb-4 leading-6">
            برای هر نوع پیامک الگویی تعریف کنید. از {'{{ variable }}'} برای مقادیر پویا استفاده کنید.
          </p>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto nice-scroll border-2 border-[#e5e5e5] p-3">
            {tplTypeOptions.map((t) => (
              <div key={t.key} className="border-b border-[#e5e5e5] pb-3 mb-3 last:border-0 last:pb-0 last:mb-0">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs font-bold">{t.label}</Label>
                  <span className="vb-code text-[10px] text-[#525252]">{t.key}</span>
                </div>
                <textarea
                  value={templates[t.key] || ''}
                  onChange={(e) => setTemplates((prev) => ({ ...prev, [t.key]: e.target.value }))}
                  className="w-full border-2 border-[#d4d4d4] px-3 py-2 text-xs h-16 resize-none focus:outline-none focus:border-[#0a0a0a]"
                  placeholder={`مثلا: نوبت شما ثبت شد.\n{{ business_name }} | {{ service_name }}\nتاریخ: {{ appointment_date }} ساعت {{ appointment_time }}\nشماره نوبت: {{ appointment_number }}\nمشاهده صف: {{ live_queue_url }}`}
                />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[#a3a3a3] mt-2">
            متغیرهای پشتیبانی‌شده: customer_name, business_name, branch_name, service_name, appointment_number, appointment_date, appointment_time, queue_position, people_ahead, estimated_wait, live_queue_url
          </p>
        </div>
      </div>
    </div>
  )
}

function PlatformSms() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [sendForm, setSendForm] = useState({ mobile: '', messageText: '', tenantId: '', action: 'broadcast' as 'broadcast' | 'test' })
  const [testResult, setTestResult] = useState<{ ok: boolean; provider: string; messageId?: string; error?: string } | null>(null)

  const { data, isLoading } = useQuery<{ notifications: {
    id: string; type: string; recipient: string; body: string; status: string; createdAt: string
    tenant?: { name: string } | null
    appointment?: { code: string } | null
  }[] }>({
    queryKey: ['admin-sms'],
    queryFn: () => apiGet('/api/admin/notifications'),
    refetchInterval: 15_000,
  })

  const send = useMutation({
    mutationFn: async () => {
      if (sendForm.action === 'test') {
        return await apiPost<{ ok: boolean; sent: boolean; provider: string; messageId?: string; error?: string; message?: string }>('/api/admin/notifications', {
          action: 'test-send',
          mobile: sendForm.mobile,
          messageText: sendForm.messageText,
          tenantId: sendForm.tenantId || undefined,
        })
      }
      return await apiPost<{ ok: boolean; sent: number; failed: number; results?: { recipient: string; ok: boolean }[]; message?: string }>('/api/admin/notifications', {
        mobile: sendForm.mobile,
        messageText: sendForm.messageText,
        tenantId: sendForm.tenantId || undefined,
      })
    },
    onSuccess: (res) => {
      setTestResult(null)
      qc.invalidateQueries({ queryKey: ['admin-sms'] })
      qc.invalidateQueries({ queryKey: ['admin-overview'] })
      if ('provider' in res) {
        setTestResult({ ok: res.ok, provider: res.provider, messageId: res.messageId, error: res.error })
        toast({ title: res.message || (res.ok ? 'تست پیامک ارسال شد' : 'ارسال ناموفق') })
      } else {
        toast({ title: res.message || `پیامک ارسال شد: ${res.sent} موفق، ${res.failed} مشکل` })
      }
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : 'خطا', variant: 'destructive' }),
  })

  if (isLoading) return <AdminSkeleton />
  const notifications = data?.notifications || []

  return (
    <div className="space-y-5">
      <div>
        <p className="vb-overline mb-2">Notification Engine — کل پلتفرم</p>
        <h1 className="vb-display text-3xl">پیامک‌های پلتفرم</h1>
      </div>

      {/* compose panel */}
      <div className="vb-card p-5">
        <p className="font-black mb-4">ارسال پیامک فوراً</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-bold">شماره موبایل دریافت‌کننده</Label>
            <Input
              value={sendForm.mobile}
              onChange={(e) => setSendForm((p) => ({ ...p, mobile: e.target.value }))}
              dir="ltr"
              placeholder="09120000000"
              className="h-10 rounded-none"
            />
          </div>
          <div>
            <Label className="text-xs font-bold">نوع ارسال</Label>
            <div className="flex gap-2 mt-1">
              <button
                className={`px-3 py-1.5 text-xs font-bold border-2 transition-colors ${
                  sendForm.action === 'broadcast' ? 'bg-[#0a0a0a] text-[#fafafa] border-[#0a0a0a]' : 'border-[#e5e5e5] hover:border-[#0a0a0a]'
                }`}
                onClick={() => setSendForm((p) => ({ ...p, action: 'broadcast' }))}
              >
                پخش‌پذیر (موبایل)
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-bold border-2 transition-colors ${
                  sendForm.action === 'test' ? 'bg-[#0a0a0a] text-[#fafafa] border-[#0a0a0a]' : 'border-[#e5e5e5] hover:border-[#0a0a0a]'
                }`}
                onClick={() => setSendForm((p) => ({ ...p, action: 'test' }))}
              >
                تست (یک‌بار)
              </button>
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs font-bold">متن پیامک</Label>
            <textarea
              value={sendForm.messageText}
              onChange={(e) => setSendForm((p) => ({ ...p, messageText: e.target.value }))}
              className="w-full border-2 border-[#0a0a0a] px-3 py-2 text-xs h-20 resize-none focus:outline-none"
              placeholder="متن پیامک را اینجا بنویسید."
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs font-bold">Tenant خاص (اختیاری — خالی = پلتفرم)</Label>
            <select
              value={sendForm.tenantId}
              onChange={(e) => setSendForm((p) => ({ ...p, tenantId: e.target.value }))}
              className="w-full border-2 border-[#0a0a0a] px-3 py-2 text-sm bg-[#fafafa]"
            >
              <option value="">پلتفرم (بدون مستأجر)</option>
              {(data?.notifications || []).length > 0 && (function extractTenants(ns: { tenant?: { name: string } | null }[]) {
                const seen = new Set<string>()
                const out: { value: string; label: string }[] = []
                for (const n of ns) if (n.tenant?.name && !seen.has(n.tenant.name)) { seen.add(n.tenant.name); out.push({ value: n.tenant.name, label: n.tenant.name }) }
                return out
              })(notifications).map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <Button
            onClick={() => send.mutate()}
            disabled={send.isPending || !sendForm.mobile || !sendForm.messageText}
            className="h-11 rounded-none bg-[#0a0a0a] text-[#fafafa] hover:bg-[#ef4444] font-bold"
          >
            {send.isPending ? 'در حال ارسال...' : sendForm.action === 'test' ? 'ارسال تست' : 'ارسال پیامک'}
          </Button>
          {testResult && (
            <div className={`flex items-center gap-3 px-4 py-2 border-2 ${
              testResult.ok ? 'border-[#16a34a] bg-[#f0fdf4]' : 'border-[#ef4444] bg-[#fef2f2]'
            }`}>
              <span className="text-sm font-bold">{testResult.ok ? 'تست موفق' : 'تست ناموفق'}</span>
              {testResult.provider && <span className="text-xs text-[#525252]">ارائه‌دهنده: {testResult.provider}</span>}
              {testResult.messageId && <span className="vb-code text-xs text-[#525252]">{testResult.messageId}</span>}
              {testResult.error && <span className="text-xs text-[#ef4444] font-bold">{testResult.error}</span>}
            </div>
          )}
        </div>
      </div>

      {/* log */}
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
