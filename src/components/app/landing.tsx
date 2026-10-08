'use client'

import { useQuery } from '@tanstack/react-query'
import { apiGet } from './api-client'
import { LoginDialog } from './login-dialog'
import { faDigits, faNumber, formatJalaliFull } from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import {
  CalendarClock, Radio, BellRing, Building2, ArrowLeft,
  Stethoscope, Scissors, Wrench, Search, QrCode,
} from 'lucide-react'
import { useState } from 'react'

interface TenantCard {
  id: string
  name: string
  slug: string
  category: string
  logoText: string
  address: string | null
  phone: string | null
  _count: { services: number; branches: number }
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'کلینیک پزشکی': <Stethoscope className="w-6 h-6" />,
  'زیبایی و آرایش': <Scissors className="w-6 h-6" />,
  'خودرو': <Wrench className="w-6 h-6" />,
}

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 bg-[#fafafa]/95 backdrop-blur border-b-2 border-[#0a0a0a]">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        <a href="#/" className="flex items-center gap-2.5">
          <span className="w-9 h-9 bg-[#0a0a0a] text-[#fafafa] font-black text-lg flex items-center justify-center">
            ن
          </span>
          <span className="font-black text-xl">نوب‌یار</span>
          <span className="hidden sm:inline-block text-[10px] font-bold text-[#525252] border-e-2 pe-2.5 ms-1 border-[#0a0a0a]">
            نوبت‌دهی و صف زنده
          </span>
        </a>
        <nav className="flex items-center gap-2">
          <LoginDialog scope="admin">
            <Button variant="ghost" className="font-bold text-sm rounded-none h-9 hover:text-[#ef4444] hover:bg-transparent">
              ورود مدیران
            </Button>
          </LoginDialog>
          <LoginDialog scope="business">
            <button className="vb-btn vb-btn-secondary vb-btn-sm">ورود کسب‌وکارها</button>
          </LoginDialog>
        </nav>
      </div>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="mt-auto bg-[#0a0a0a] text-[#fafafa]">
      <div className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-9 h-9 bg-[#ef4444] text-[#fafafa] font-black text-lg flex items-center justify-center">ن</span>
            <span className="font-black text-xl">نوب‌یار</span>
          </div>
          <p className="text-sm text-[#a3a3a3] leading-7">
            پلتفرم SaaS نوبت‌دهی، مدیریت صف زنده و اطلاع‌رسانی پیامکی — از مطب تا سازمان‌های چندشعبه‌ای.
          </p>
        </div>
        <div className="text-sm space-y-2">
          <p className="font-black mb-3">موتورهای محصول</p>
          <p className="text-[#a3a3a3]">موتور نوبت‌دهی و زمان‌بندی</p>
          <p className="text-[#a3a3a3]">موتور صف و وضعیت زنده</p>
          <p className="text-[#a3a3a3]">موتور اطلاع‌رسانی (SMS)</p>
          <p className="text-[#a3a3a3]">لایه پلتفرم SaaS چندمستاجری</p>
        </div>
        <div className="text-sm space-y-2">
          <p className="font-black mb-3">پنل‌ها</p>
          <a href="#/book" className="block text-[#a3a3a3] hover:text-[#fafafa] transition-colors">دریافت نوبت (مشتریان)</a>
          <a href="#/panel" className="block text-[#a3a3a3] hover:text-[#fafafa] transition-colors">پنل کسب‌وکار</a>
          <a href="#/admin" className="block text-[#a3a3a3] hover:text-[#fafafa] transition-colors">پنل مدیریت پلتفرم</a>
        </div>
      </div>
      <div className="border-t border-[#262626] py-4 text-center text-xs text-[#525252]">
        نوب‌یار — نسخه نمایشی MVP • {formatJalaliFull(new Date())}
      </div>
    </footer>
  )
}

export function Landing() {
  const { data } = useQuery<{ tenants: TenantCard[] }>({
    queryKey: ['public-tenants'],
    queryFn: () => apiGet('/api/public/tenants'),
  })
  const [search, setSearch] = useState('')
  const tenants = (data?.tenants || []).filter(
    (t) => !search || t.name.includes(search) || t.category.includes(search),
  )

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />

      <main className="flex-1">
        {/* ───────── Hero ───────── */}
        <section className="border-b-2 border-[#0a0a0a]">
          <div className="max-w-6xl mx-auto px-4 pt-14 pb-12 grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center">
            <div>
              <p className="vb-overline mb-4">پلتفرم SaaS نوبت‌دهی و صف زنده</p>
              <h1 className="vb-display text-5xl md:text-[68px] leading-[1.08]">
                نوبت بگیر،
                <br />
                <span className="text-[#ef4444]">صف</span> را زنده ببین.
              </h1>
              <p className="mt-6 text-lg text-[#525252] leading-8 max-w-xl">
                دیگر برای نوبت تلفن نزنید و پشت در منتظر نمانید. مشتری بدون ثبت‌نام نوبت می‌گیرد،
                جایگاه خود را در صف لحظه‌به‌لحظه می‌بیند و هر تغییر مهم را با پیامک اعلام می‌شود.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#tenants">
                  <button className="vb-btn vb-btn-primary vb-btn-lg">
                    دریافت نوبت
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                </a>
                <a href="#/panel">
                  <button className="vb-btn vb-btn-secondary vb-btn-lg">پنل کسب‌وکار</button>
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                <Stat value="۱۰,۰۰۰+" label="مستأجر قابل پشتیبانی" />
                <Stat value="< ۲ ثانیه" label="انتشار تغییرات صف" />
                <Stat value="۹۹.۹٪" label="دسترس‌پذیری هدف" />
              </div>
            </div>

            {/* Mock live queue card */}
            <div className="vb-card-elevated p-0 max-w-sm w-full mx-auto lg:mx-0">
              <div className="bg-[#0a0a0a] text-[#fafafa] px-5 py-3 flex items-center justify-between">
                <span className="font-black">صف زنده — دموی واقعی</span>
                <span className="flex items-center gap-2 text-xs text-[#a3a3a3]">
                  <span className="vb-live-dot" /> LIVE
                </span>
              </div>
              <div className="p-5 text-center space-y-4">
                <div>
                  <p className="text-xs font-bold text-[#525252]">شماره نوبت شما</p>
                  <p className="vb-code text-6xl font-black mt-1">A-107</p>
                </div>
                <div className="grid grid-cols-3 gap-2 border-t-2 border-[#e5e5e5] pt-4">
                  <MiniStat label="جایگاه" value={faDigits(3)} />
                  <MiniStat label="قبل از شما" value={faDigits(2)} />
                  <MiniStat label="انتظار" value={faDigits(28)} suffix="دقیقه" />
                </div>
                <div className="bg-[#f5f5f5] border-2 border-[#e5e5e5] p-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-[#525252]">در حال سرویس</span>
                  <span className="vb-code font-black">A-106</span>
                </div>
                <a href="#/panel" className="block text-xs font-bold text-[#525252] hover:text-[#ef4444] transition-colors">
                  این را در پنل کسب‌وکار امتحان کنید ←
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ───────── 四 engines (PRD §62) ───────── */}
        <section className="border-b-2 border-[#0a0a0a] bg-[#f5f5f5]">
          <div className="max-w-6xl mx-auto px-4 py-14">
            <p className="vb-overline mb-3">معماری محصول</p>
            <h2 className="vb-display text-3xl md:text-4xl mb-8">چهار موتور، یک زیرساخت</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <EngineCard
                icon={<CalendarClock className="w-7 h-7" />}
                title="موتور نوبت‌دهی"
                desc="انتخاب مرکز، خدمت، شعبه و زمان با تقویم جلالی؛ کنترل ظرفیت و جلوگیری از رزرو تکراری."
              />
              <EngineCard
                icon={<Radio className="w-7 h-7" />}
                title="موتور صف زنده"
                desc="وضعیت لحظه‌ای صف با WebSocket؛ فراخوانی، رد کردن، جابجایی و اولویت‌دهی انگشتی."
                accent
              />
              <EngineCard
                icon={<BellRing className="w-7 h-7" />}
                title="موتور اطلاع‌رسانی"
                desc="پیامک خودکار برای ثبت، تغییر، لغو و فراخوانی نوبت؛ با الگوهای قابل تنظیم و ضداسپم."
              />
              <EngineCard
                icon={<Building2 className="w-7 h-7" />}
                title="لایه SaaS"
                desc="چندمستاجری کامل، پلن‌ها و Feature Flags، تیکت پشتیبانی و Audit Log برای همه تغییرات."
              />
            </div>
          </div>
        </section>

        {/* ───────── Tenant directory ───────── */}
        <section id="tenants" className="border-b-2 border-[#0a0a0a]">
          <div className="max-w-6xl mx-auto px-4 py-14">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
              <div>
                <p className="vb-overline mb-3">مراکز فعال روی پلتفرم</p>
                <h2 className="vb-display text-3xl md:text-4xl">یکی را انتخاب کنید و نوبت بگیرید</h2>
              </div>
              <div className="relative">
                <Search className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a3a3a3]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="جستجوی مرکز…"
                  className="h-11 w-64 border-2 border-[#d4d4d4] bg-[#fafafa] ps-3 pe-9 text-sm focus:outline-none focus:border-[#0a0a0a]"
                />
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-5">
              {tenants.map((t) => (
                <a key={t.id} href={`#/book/${t.slug}`} className="group block">
                  <div className="vb-card vb-card-hover h-full p-6 flex flex-col">
                    <div className="flex items-start justify-between mb-4">
                      <span className="w-14 h-14 bg-[#0a0a0a] text-[#fafafa] font-black text-2xl flex items-center justify-center">
                        {t.logoText}
                      </span>
                      <span className="text-[#525252] group-hover:text-[#ef4444] transition-colors">
                        {CATEGORY_ICONS[t.category] || <Building2 className="w-6 h-6" />}
                      </span>
                    </div>
                    <h3 className="font-black text-xl mb-1">{t.name}</h3>
                    <p className="text-xs font-bold text-[#525252] mb-3">{t.category}</p>
                    <p className="text-sm text-[#525252] leading-6 flex-1">{t.address}</p>
                    <div className="mt-4 pt-4 border-t-2 border-[#e5e5e5] flex items-center justify-between">
                      <span className="text-xs text-[#525252]">
                        {faDigits(t._count.services)} خدمت • {faDigits(t._count.branches)} شعبه
                      </span>
                      <span className="vb-btn vb-btn-primary vb-btn-sm">رزرو نوبت</span>
                    </div>
                  </div>
                </a>
              ))}
              {tenants.length === 0 && (
                <p className="col-span-3 text-center text-[#525252] py-10 font-bold">
                  مرکزی با این نام یافت نشد.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ───────── Track booking ───────── */}
        <section className="bg-[#0a0a0a] text-[#fafafa]">
          <div className="max-w-6xl mx-auto px-4 py-14 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <p className="text-xs font-bold text-[#ef4444] mb-2">قبلاً نوبت گرفته‌اید؟</p>
              <h2 className="vb-display text-3xl">صف خود را همین حالا زنده ببینید</h2>
              <p className="text-sm text-[#a3a3a3] mt-2">شماره نوبت (مثل A-104) و موبایلی که هنگام رزرو وارد کردید را بنویسید.</p>
            </div>
            <TrackBox />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-black text-2xl">{value}</p>
      <p className="text-xs text-[#525252] mt-0.5">{label}</p>
    </div>
  )
}

function MiniStat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-[#525252]">{label}</p>
      <p className="font-black text-2xl">
        {value}
        {suffix && <span className="text-[10px] font-bold text-[#525252] ms-1">{suffix}</span>}
      </p>
    </div>
  )
}

function EngineCard({ icon, title, desc, accent }: { icon: React.ReactNode; title: string; desc: string; accent?: boolean }) {
  return (
    <div className={`p-6 ${accent ? 'vb-card-elevated' : 'vb-card vb-card-hover'}`}>
      <div className={`mb-4 ${accent ? 'text-[#ef4444]' : 'text-[#0a0a0a]'}`}>{icon}</div>
      <h3 className="font-black text-lg mb-2">{title}</h3>
      <p className="text-sm text-[#525252] leading-7">{desc}</p>
    </div>
  )
}

function TrackBox() {
  const [code, setCode] = useState('')
  const [mobile, setMobile] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const track = async () => {
    setError('')
    setBusy(true)
    try {
      const res = await apiGet<{ appointment: { liveToken: string } }>(
        `/api/public/lookup?code=${encodeURIComponent(code)}&mobile=${encodeURIComponent(mobile)}`,
      )
      window.location.hash = `#/q/${res.appointment.liveToken}`
    } catch (e) {
      setError(e instanceof Error ? e.message : 'یافت نشد')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full max-w-md space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="A-104"
          dir="ltr"
          className="h-12 bg-transparent border-2 border-[#525252] px-3 text-sm vb-code text-[#fafafa] focus:outline-none focus:border-[#ef4444] placeholder:text-[#525252]"
        />
        <input
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          placeholder="09123456789"
          dir="ltr"
          className="h-12 bg-transparent border-2 border-[#525252] px-3 text-sm vb-code text-[#fafafa] focus:outline-none focus:border-[#ef4444] placeholder:text-[#525252]"
        />
      </div>
      {error && <p className="text-xs font-bold text-[#ef4444]">{error}</p>}
      <button onClick={track} disabled={busy} className="vb-btn vb-btn-primary w-full !border-[#ef4444] !bg-[#ef4444] hover:!bg-[#dc2626]">
        <QrCode className="w-4 h-4" />
        {busy ? 'در حال جستجو…' : 'مشاهده صف زنده'}
      </button>
    </div>
  )
}
