'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet, apiPost } from '../api-client'
import { PublicHeader, Footer } from '../landing'
import { upcomingDays, faDigits, faNumber, formatJalaliFull, formatJalaliMedium, timeToMinutes } from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import {
  ChevronRight, ChevronLeft, CalendarDays, Clock, User, Building2,
  CheckCircle2, UserRound, BellRing, Loader2, Link2,
} from 'lucide-react'

interface TenantDetail {
  id: string
  name: string
  slug: string
  category: string
  logoText: string
  address: string | null
  phone: string | null
  branches: { id: string; name: string; address: string | null; phone: string | null; hours: string }[]
  services: { id: string; name: string; description: string | null; duration: number; price: number; capacity: number; branchId: string | null }[]
  staff: { id: string; name: string; title: string | null; branchId: string | null; serviceIds: string }[]
}

interface SlotInfo { time: string; available: boolean; remaining: number }

interface BookingResult {
  appointment: { id: string; code: string; liveToken: string; scheduledAt: string; status: string }
  businessName: string
  serviceName: string
  branchName: string
}

const STEPS = ['خدمت', 'شعبه', 'متخصص', 'زمان', 'اطلاعات', 'تأیید']

export function BookingFlow({ slug }: { slug?: string }) {
  const { data, isLoading, error } = useQuery<{ tenant: TenantDetail }>({
    queryKey: ['tenant', slug],
    queryFn: () => apiGet(`/api/public/tenants/${slug}`),
    enabled: !!slug,
  })

  if (!slug) return <Centered title="مرکزی انتخاب نشده" desc="برای رزرو نوبت ابتدا یک مرکز را از فهرست مراکز انتخاب کنید." cta="مشاهده مراکز" href="#tenants" />
  if (isLoading) return <Loading />
  if (error || !data?.tenant) return <Centered title="مرکز یافت نشد" desc="این مرکز در دسترس نیست یا آدرس اشتباه است." cta="بازگشت" href="#/" secondary />

  return <BookingWizard tenant={data.tenant} />
}

function Centered({ title, desc, cta, href, secondary }: { title: string; desc: string; cta: string; href: string; secondary?: boolean }) {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="vb-card p-10 text-center max-w-md">
          <h1 className="vb-display text-2xl mb-4">{title}</h1>
          <p className="text-sm text-[#525252] mb-6">{desc}</p>
          <a href={href}><button className={secondary ? 'vb-btn vb-btn-secondary' : 'vb-btn vb-btn-primary'}>{cta}</button></a>
        </div>
      </main>
      <Footer />
    </div>
  )
}

function Loading() {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1 max-w-3xl mx-auto w-full p-6 space-y-4">
        <Skeleton className="h-10 w-48 rounded-none" />
        <Skeleton className="h-32 w-full rounded-none" />
        <Skeleton className="h-64 w-full rounded-none" />
      </main>
    </div>
  )
}

function BookingWizard({ tenant }: { tenant: TenantDetail }) {
  const [step, setStep] = useState(0)
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [branchId, setBranchId] = useState<string | null>(null)
  const [staffId, setStaffId] = useState<string | null>(null)
  const [date, setDate] = useState<string | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [result, setResult] = useState<BookingResult | null>(null)
  const { toast } = useToast()

  const service = tenant.services.find((s) => s.id === serviceId) || null

  const branchOptions = useMemo(() => {
    if (!service) return tenant.branches
    const linked = tenant.branches.filter((b) => b.id === service.branchId)
    return linked.length ? linked : tenant.branches
  }, [service, tenant.branches])

  const staffOptions = useMemo(() => {
    if (!serviceId || !branchId) return []
    return tenant.staff.filter((s) => {
      if (s.branchId && s.branchId !== branchId) return false
      try {
        return (JSON.parse(s.serviceIds || '[]') as string[]).includes(serviceId)
      } catch {
        return false
      }
    })
  }, [tenant.staff, serviceId, branchId])

  const days = useMemo(() => upcomingDays(10), [])
  const day = days.find((d) => d.key === date)
  const branch = tenant.branches.find((b) => b.id === branchId)
  const staffName = staffId ? tenant.staff.find((s) => s.id === staffId)?.name || null : null

  const validInfo = name.trim().length > 1 && /^09\d{9}$/.test(mobile)
  const canNext = [!!serviceId, !!branchId, true, !!(date && time), validInfo, true][step]

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <span className="w-14 h-14 bg-[#0a0a0a] text-[#fafafa] font-black text-2xl flex items-center justify-center">{tenant.logoText}</span>
          <div>
            <h1 className="vb-display text-2xl">{tenant.name}</h1>
            <p className="text-xs font-bold text-[#525252] mt-0.5">{tenant.category} • {tenant.phone}</p>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-1 nice-scroll">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center shrink-0">
              <button
                onClick={() => i < step && setStep(i)}
                className={`px-3 py-1.5 text-xs font-bold border-2 transition-colors ${
                  i === step ? 'bg-[#0a0a0a] text-[#fafafa] border-[#0a0a0a]' :
                  i < step ? 'bg-[#fafafa] text-[#0a0a0a] border-[#0a0a0a]' :
                  'bg-[#fafafa] text-[#a3a3a3] border-[#e5e5e5]'
                }`}
              >
                {faDigits(i + 1)}. {s}
              </button>
              {i < STEPS.length - 1 && <span className="w-4 h-0.5 bg-[#d4d4d4]" />}
            </div>
          ))}
        </div>

        {result ? (
          <BookingSuccess result={result} />
        ) : step === 0 && (
          <StepShell title="کدام خدمت را نیاز دارید؟" icon={<CalendarDays className="w-5 h-5" />}>
            <div className="grid sm:grid-cols-2 gap-4">
              {tenant.services.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setServiceId(s.id); setBranchId(null); setStaffId(null); setStep(1) }}
                  className={`text-right p-5 border-2 transition-colors hover:border-[#0a0a0a] ${
                    serviceId === s.id ? 'border-[#0a0a0a] bg-[#f5f5f5]' : 'border-[#e5e5e5]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <span className="font-black">{s.name}</span>
                    <span className="vb-chip vb-chip-muted">{faDigits(s.duration)} دقیقه</span>
                  </div>
                  {s.description && <p className="text-xs text-[#525252] mb-3">{s.description}</p>}
                  <p className="text-sm font-bold text-[#ef4444]">{s.price > 0 ? `${faNumber(s.price)} تومان` : 'رایگان'}</p>
                </button>
              ))}
            </div>
          </StepShell>
        )}

        {!result && step === 1 && (
          <StepShell title="کدام شعبه؟" icon={<Building2 className="w-5 h-5" />}>
            <div className="grid sm:grid-cols-2 gap-4">
              {branchOptions.map((b) => (
                <button
                  key={b.id}
                  onClick={() => { setBranchId(b.id); setStaffId(null); setStep(2) }}
                  className={`text-right p-5 border-2 transition-colors hover:border-[#0a0a0a] ${
                    branchId === b.id ? 'border-[#0a0a0a] bg-[#f5f5f5]' : 'border-[#e5e5e5]'
                  }`}
                >
                  <p className="font-black mb-1">{b.name}</p>
                  <p className="text-xs text-[#525252]">{b.address}</p>
                </button>
              ))}
            </div>
          </StepShell>
        )}

        {!result && step === 2 && (
          <StepShell title="ارائه‌دهنده خدمت (اختیاری)" icon={<UserRound className="w-5 h-5" />}>
            <p className="text-xs text-[#525252] mb-4">اگر متخصص خاصی مدنظر دارید انتخاب کنید؛ در غیر این صورت «اولین متخصص آزاد» سریع‌ترین گزینه است.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <button
                onClick={() => { setStaffId(null); setStep(3) }}
                className="text-right p-5 border-2 border-[#0a0a0a] bg-[#f5f5f5] hover:border-[#ef4444] transition-colors"
              >
                <p className="font-black">اولین متخصص آزاد</p>
                <p className="text-xs text-[#525252] mt-1">سریع‌ترین زمان موجود رزرو می‌شود</p>
              </button>
              {staffOptions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setStaffId(s.id); setStep(3) }}
                  className={`text-right p-5 border-2 transition-colors hover:border-[#0a0a0a] ${
                    staffId === s.id ? 'border-[#0a0a0a] bg-[#f5f5f5]' : 'border-[#e5e5e5]'
                  }`}
                >
                  <p className="font-black">{s.name}</p>
                  {s.title && <p className="text-xs text-[#525252] mt-1">{s.title}</p>}
                </button>
              ))}
            </div>
          </StepShell>
        )}

        {!result && step === 3 && (
          <TimeStep
            days={days} date={date || days[0].key} time={time}
            branchId={branchId!} serviceId={serviceId!} staffId={staffId}
            onPickDate={(d) => { setDate(d); setTime(null) }}
            onPickTime={(t) => setTime(t)}
          />
        )}

        {!result && step === 4 && (
          <StepShell title="اطلاعات تماس شما" icon={<User className="w-5 h-5" />}>
            <div className="max-w-md space-y-4">
              <div>
                <label className="text-xs font-bold mb-1.5 block">نام و نام خانوادگی *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثلاً: علی محمدی"
                  className="w-full h-11 border-2 border-[#d4d4d4] px-3 text-sm focus:outline-none focus:border-[#0a0a0a]"
                />
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">شماره موبایل * (برای اطلاع‌رسانی پیامکی)</label>
                <input
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="09123456789"
                  dir="ltr"
                  className="w-full h-11 border-2 border-[#d4d4d4] px-3 text-sm vb-code text-left focus:outline-none focus:border-[#0a0a0a]"
                />
                {mobile && !/^09\d{9}$/.test(mobile) && (
                  <p className="text-xs text-[#ef4444] font-bold mt-1">شماره باید با ۰۹ شروع شود و ۱۱ رقم باشد.</p>
                )}
              </div>
              <p className="text-xs text-[#525252] leading-6">
                برای دریافت نوبت نیازی به ساخت حساب کاربری نیست. پس از ثبت، لینک اختصاصی مشاهده صف زنده به شما پیامک می‌شود.
              </p>
            </div>
          </StepShell>
        )}

        {!result && step === 5 && (
          <ConfirmStep
            tenantSlug={tenant.slug}
            tenantName={tenant.name}
            serviceName={service?.name || ''}
            branchName={branch?.name || ''}
            staffName={staffName}
            serviceId={serviceId!}
            branchId={branchId!}
            date={date || days[0].key}
            time={time || ''}
            name={name.trim()}
            mobile={mobile}
            onBooked={setResult}
          />
        )}

        {/* Nav */}
        {!result && (
          <div className="flex items-center justify-between mt-8">
            <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="vb-btn vb-btn-ghost">
              <ChevronRight className="w-4 h-4" /> قبلی
            </button>
            {(step === 3 || step === 4) ? (
              <button
                onClick={() => {
                  if (step === 3 && !time) { toast({ title: 'یک ساعت را انتخاب کنید', variant: 'destructive' }); return }
                  setStep((s) => s + 1)
                }}
                className="vb-btn vb-btn-primary"
              >
                بعدی <ChevronLeft className="w-4 h-4" />
              </button>
            ) : step < 3 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext}
                className="vb-btn vb-btn-primary"
              >
                بعدی <ChevronLeft className="w-4 h-4" />
              </button>
            ) : <span />}
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}

function StepShell({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <span className="w-9 h-9 bg-[#0a0a0a] text-[#fafafa] flex items-center justify-center">{icon}</span>
        <h2 className="vb-display text-xl">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function TimeStep(args: {
  days: { key: string; label: string; weekdayShort: string; isFriday: boolean; full: string }[]
  date: string; time: string | null
  branchId: string; serviceId: string; staffId: string | null
  onPickDate: (d: string) => void
  onPickTime: (t: string) => void
}) {
  const { data, isFetching } = useQuery<{ closed: boolean; slots: SlotInfo[] }>({
    queryKey: ['availability', args.branchId, args.serviceId, args.staffId, args.date],
    queryFn: () =>
      apiGet(`/api/public/availability?branchId=${args.branchId}&serviceId=${args.serviceId}&date=${args.date}${args.staffId ? `&staffId=${args.staffId}` : ''}`),
    enabled: !!args.date,
  })

  const morning = (data?.slots || []).filter((s) => timeToMinutes(s.time) < 12 * 60)
  const evening = (data?.slots || []).filter((s) => timeToMinutes(s.time) >= 12 * 60)

  return (
    <StepShell title="تاریخ و ساعت" icon={<Clock className="w-5 h-5" />}>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 nice-scroll">
        {args.days.map((d) => {
          const selected = d.key === args.date
          return (
            <button
              key={d.key}
              onClick={() => args.onPickDate(d.key)}
              className={`shrink-0 w-[74px] py-3 border-2 text-center transition-colors ${
                selected ? 'bg-[#0a0a0a] text-[#fafafa] border-[#0a0a0a]' :
                d.isFriday ? 'border-[#e5e5e5] text-[#a3a3a3]' : 'border-[#e5e5e5] hover:border-[#0a0a0a]'
              }`}
            >
              <p className="text-[10px] font-bold">{d.weekdayShort}</p>
              <p className="font-black text-lg leading-6">{d.label.split(' ')[0]}</p>
              <p className="text-[10px]">{d.label.split(' ')[1]}</p>
            </button>
          )
        })}
      </div>

      <p className="text-sm font-bold mb-4">{formatJalaliFull(args.date)}</p>

      {isFetching && !data ? (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-none" />)}
        </div>
      ) : data?.closed ? (
        <div className="vb-card p-8 text-center">
          <p className="font-black mb-1">این روز تعطیل است</p>
          <p className="text-xs text-[#525252]">لطفاً روز دیگری از تقویم انتخاب کنید.</p>
        </div>
      ) : (
        <>
          {morning.length > 0 && <SlotGroup title="صبح" slots={morning} time={args.time} onPick={args.onPickTime} />}
          {evening.length > 0 && <SlotGroup title="بعدازظهر" slots={evening} time={args.time} onPick={args.onPickTime} />}
          {data && data.slots.length > 0 && data.slots.every((s) => !s.available) && (
            <div className="vb-card p-8 text-center">
              <p className="font-black mb-1">ظرفیت این روز تکمیل شده</p>
              <p className="text-xs text-[#525252]">روز دیگری را انتخاب کنید.</p>
            </div>
          )}
        </>
      )}
    </StepShell>
  )
}

function SlotGroup({ title, slots, time, onPick }: { title: string; slots: SlotInfo[]; time: string | null; onPick: (t: string) => void }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-bold text-[#525252] mb-2">{title}</p>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
        {slots.map((s) => (
          <button
            key={s.time}
            disabled={!s.available}
            onClick={() => onPick(s.time)}
            className={`h-10 border-2 text-sm font-bold vb-code transition-colors ${
              !s.available ? 'border-[#e5e5e5] text-[#a3a3a3] line-through cursor-not-allowed bg-[#f5f5f5]' :
              time === s.time ? 'bg-[#0a0a0a] text-[#fafafa] border-[#0a0a0a]' :
              'border-[#d4d4d4] hover:border-[#0a0a0a]'
            }`}
          >
            {faDigits(s.time)}
          </button>
        ))}
      </div>
    </div>
  )
}

function ConfirmStep(args: {
  tenantSlug: string; tenantName: string; serviceName: string; branchName: string; staffName: string | null
  serviceId: string; branchId: string
  date: string; time: string; name: string; mobile: string
  onBooked: (r: BookingResult) => void
}) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [])

  const confirm = async () => {
    setBusy(true)
    try {
      const res = await apiPost<BookingResult>('/api/public/bookings', {
        tenantSlug: args.tenantSlug,
        branchId: args.branchId,
        serviceId: args.serviceId,
        date: args.date,
        time: args.time,
        name: args.name,
        mobile: args.mobile,
        idempotencyKey,
      })
      args.onBooked(res)
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'خطا در ثبت نوبت', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepShell title="بازبینی نهایی" icon={<CheckCircle2 className="w-5 h-5" />}>
      <div className="vb-card-elevated max-w-lg">
        <div className="bg-[#0a0a0a] text-[#fafafa] px-5 py-3 font-black">جزئیات نوبت</div>
        <dl className="p-5 divide-y-2 divide-[#e5e5e5]">
          <Row label="مرکز" value={args.tenantName} />
          <Row label="خدمت" value={args.serviceName} />
          <Row label="شعبه" value={args.branchName} />
          {args.staffName && <Row label="متخصص" value={args.staffName} />}
          <Row label="تاریخ" value={formatJalaliMedium(args.date)} />
          <Row label="ساعت" value={faDigits(args.time)} />
          <Row label="نام" value={args.name} />
          <Row label="موبایل" value={faDigits(args.mobile)} mono />
        </dl>
      </div>
      <button onClick={confirm} disabled={busy} className="vb-btn vb-btn-primary vb-btn-lg mt-6">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
        {busy ? 'در حال ثبت…' : 'ثبت نهایی نوبت'}
      </button>
      <p className="text-xs text-[#525252] mt-3 max-w-lg leading-6">
        پس از ثبت، شماره نوبت و لینک مشاهده زنده صف برای شما پیامک می‌شود. در این نسخه نمایشی، پیامک‌ها در «گزارش پیامک‌ها» ثبت می‌شوند.
      </p>
    </StepShell>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3">
      <dt className="text-xs font-bold text-[#525252]">{label}</dt>
      <dd className={`font-bold text-sm ${mono ? 'vb-code' : ''}`}>{value}</dd>
    </div>
  )
}

function BookingSuccess({ result }: { result: BookingResult }) {
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/#/q/${result.appointment.liveToken}`
  return (
    <div className="max-w-lg">
      <div className="vb-card-elevated">
        <div className="bg-[#16a34a] text-[#fafafa] px-5 py-3 font-black flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          نوبت شما با موفقیت ثبت شد
        </div>
        <div className="p-6 text-center">
          <p className="text-xs font-bold text-[#525252]">شماره نوبت شما</p>
          <p className="vb-code text-5xl font-black my-3">{result.appointment.code}</p>
          <div className="border-t-2 border-[#e5e5e5] pt-4 text-sm space-y-1.5">
            <p className="font-bold">{result.businessName}</p>
            <p className="text-[#525252]">{result.serviceName} — {result.branchName}</p>
          </div>
          <div className="mt-5 bg-[#f5f5f5] border-2 border-[#e5e5e5] p-3 flex items-center gap-2 text-xs">
            <BellRing className="w-4 h-4 text-[#ef4444] shrink-0" />
            <span className="text-[#525252] text-right leading-5">
              پیامک تأیید نوبت همراه با لینک صف زنده ارسال شد. وضعیت صف را لحظه‌به‌لحظه از همان لینک دنبال کنید.
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-5">
            <a href={`#/q/${result.appointment.liveToken}`}>
              <button className="vb-btn vb-btn-primary w-full">
                <Link2 className="w-4 h-4" />
                مشاهده صف زنده
              </button>
            </a>
            <button
              onClick={() => { navigator.clipboard?.writeText(url).catch(() => {}) }}
              className="vb-btn vb-btn-secondary w-full"
            >
              کپی لینک صف
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
