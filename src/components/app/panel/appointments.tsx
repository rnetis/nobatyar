'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch } from '../api-client'
import { faDigits, dateKey, formatJalaliFull, upcomingDays, minutesToTime, timeToMinutes } from '@/lib/jalali'
import { APPOINTMENT_STATUS_FA, SOURCE_FA, PRIORITY_FA, statusChipClass } from '../labels'
import { SectionSkeleton } from './panel-shell'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import {
  Search, CheckCheck, Ban, UserX, LogIn, CalendarRange, ChevronDown, Crown, Ellipsis,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Appt {
  id: string
  code: string
  scheduledAt: string
  durationMin: number
  status: string
  source: string
  priority: string
  note: string | null
  customer: { name: string; mobile: string }
  service: { name: string; duration: number }
  branch: { name: string }
  staff?: { name: string } | null
  queueEntry?: { position: number; status: string; priority: string } | null
}

const STATUS_TABS = [
  { key: 'all', label: 'همه' },
  { key: 'CONFIRMED', label: 'تأییدشده' },
  { key: 'WAITING', label: 'در صف' },
  { key: 'COMPLETED', label: 'تکمیل‌شده' },
  { key: 'CANCELLED', label: 'لغوشده' },
  { key: 'NO_SHOW', label: 'عدم حضور' },
]

export function AppointmentsSection() {
  const [date, setDate] = useState<string>('today')
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [reschedule, setReschedule] = useState<Appt | null>(null)

  const days = useMemo(() => upcomingDays(14), [])
  const queryDate = date === 'all' ? 'all' : date === 'today' ? dateKey(new Date()) : date

  const { data, isLoading } = useQuery<{ appointments: Appt[] }>({
    queryKey: ['biz-appts', queryDate, status, q],
    queryFn: () => apiGet(`/api/business/appointments?date=${queryDate}&status=${status}&q=${encodeURIComponent(q)}`),
  })

  const appointments = data?.appointments || []

  return (
    <div className="space-y-5">
      <div>
        <p className="vb-overline mb-2">مدیریت نوبت‌ها</p>
        <h1 className="vb-display text-3xl">نوبت‌ها</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto pb-1 nice-scroll">
          <DateChip label="امروز" active={date === 'today'} onClick={() => setDate('today')} />
          <DateChip label="همه" active={date === 'all'} onClick={() => setDate('all')} />
          {days.slice(1, 8).map((d) => (
            <DateChip key={d.key} label={d.label} sub={d.weekdayShort} active={date === d.key} onClick={() => setDate(d.key)} />
          ))}
        </div>
        <div className="relative ms-auto">
          <Search className="absolute end-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a3a3a3]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="کد نوبت، نام یا موبایل…"
            className="h-10 w-56 border-2 border-[#d4d4d4] bg-[#fafafa] ps-3 pe-9 text-sm focus:outline-none focus:border-[#0a0a0a]"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-3.5 py-1.5 text-xs font-bold border-2 transition-colors ${
              status === t.key ? 'bg-[#0a0a0a] text-[#fafafa] border-[#0a0a0a]' : 'border-[#d4d4d4] text-[#525252] hover:border-[#0a0a0a]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? <SectionSkeleton /> : appointments.length === 0 ? (
        <div className="vb-card p-12 text-center">
          <p className="font-black">نوبتی یافت نشد</p>
          <p className="text-xs text-[#525252] mt-1">فیلترها را تغییر دهید یا روز دیگری را انتخاب کنید.</p>
        </div>
      ) : (
        <div className="vb-card overflow-x-auto nice-scroll">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b-2 border-[#0a0a0a] text-xs">
                <Th>کد</Th>
                <Th>مشتری</Th>
                <Th>خدمت</Th>
                <Th>زمان</Th>
                <Th>منبع</Th>
                <Th>وضعیت</Th>
                <Th>عملیات</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0f0]">
              {appointments.map((a) => (
                <tr key={a.id} className="hover:bg-[#fafafa]">
                  <Td>
                    <span className="vb-code font-black">{a.code}</span>
                    {a.priority !== 'NORMAL' && <Crown className="inline w-3 h-3 ms-1 text-[#ef4444]" />}
                  </Td>
                  <Td>
                    <p className="font-bold">{a.customer.name}</p>
                    <p className="text-[11px] text-[#525252] vb-code">{faDigits(a.customer.mobile)}</p>
                  </Td>
                  <Td>
                    <p>{a.service.name}</p>
                    <p className="text-[11px] text-[#525252]">{a.staff?.name || '—'}</p>
                  </Td>
                  <Td>
                    <p className="font-bold vb-code">{faDigits(new Date(a.scheduledAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))}</p>
                    <p className="text-[11px] text-[#525252]">{formatJalaliFull(a.scheduledAt)}</p>
                  </Td>
                  <Td><span className="vb-chip vb-chip-muted">{SOURCE_FA[a.source]}</span></Td>
                  <Td><span className={statusChipClass(a.status)}>{APPOINTMENT_STATUS_FA[a.status]}</span></Td>
                  <Td>
                    <ApptActions appt={a} onReschedule={() => setReschedule(a)} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reschedule && <RescheduleDialog appt={reschedule} onClose={() => setReschedule(null)} />}
    </div>
  )
}

function DateChip({ label, sub, active, onClick }: { label: string; sub?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 border-2 text-xs font-bold text-center transition-colors ${
        active ? 'bg-[#0a0a0a] text-[#fafafa] border-[#0a0a0a]' : 'border-[#e5e5e5] hover:border-[#0a0a0a]'
      }`}
    >
      {sub && <span className="block text-[9px] opacity-70">{sub}</span>}
      {label}
    </button>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-right font-black text-[#525252]">{children}</th>
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-middle">{children}</td>
}

function ApptActions({ appt, onReschedule }: { appt: Appt; onReschedule: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPatch('/api/business/appointments', { id: appt.id, ...body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biz-appts'] })
      qc.invalidateQueries({ queryKey: ['biz-queue'] })
      qc.invalidateQueries({ queryKey: ['biz-overview'] })
      toast({ title: 'انجام شد' })
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : 'خطا', variant: 'destructive' }),
  })

  const canCheckin = ['CONFIRMED', 'PENDING'].includes(appt.status)
  const canCancel = !['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(appt.status)

  return (
    <div className="flex items-center gap-1">
      {canCheckin && (
        <IconBtn title="چک-این (ورود به صف)" onClick={() => act.mutate({ action: 'checkin' })}><LogIn className="w-3.5 h-3.5" /></IconBtn>
      )}
      {appt.status === 'PENDING' && (
        <IconBtn title="تأیید" onClick={() => act.mutate({ action: 'confirm' })}><CheckCheck className="w-3.5 h-3.5" /></IconBtn>
      )}
      <IconBtn title="جابجایی زمان" onClick={onReschedule}><CalendarRange className="w-3.5 h-3.5" /></IconBtn>
      {canCancel && <IconBtn title="لغو" onClick={() => act.mutate({ action: 'cancel' })}><Ban className="w-3.5 h-3.5 text-[#ef4444]" /></IconBtn>}
      {!canCancel && appt.status === 'CONFIRMED' && (
        <IconBtn title="عدم حضور" onClick={() => act.mutate({ action: 'no_show' })}><UserX className="w-3.5 h-3.5" /></IconBtn>
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

function RescheduleDialog({ appt, onClose }: { appt: Appt; onClose: () => void }) {
  const days = useMemo(() => upcomingDays(10), [])
  const [date, setDate] = useState(days[0].key)
  const [time, setTime] = useState<string | null>(null)
  const qc = useQueryClient()
  const { toast } = useToast()

  // Fetch appointment meta (branchId/serviceId) for slot lookup
  const { data: allData } = useQuery<{ appointments: (Appt & { branchId: string; serviceId: string })[] }>({
    queryKey: ['biz-appts-meta'],
    queryFn: () => apiGet('/api/business/appointments?date=all&status=all'),
  })
  const meta = allData?.appointments.find((x) => x.id === appt.id)

  const { data: slotsData, isFetching } = useQuery<{ closed: boolean; slots: { time: string; available: boolean }[] }>({
    queryKey: ['reschedule-slots', meta?.branchId, meta?.serviceId, date],
    queryFn: () => apiGet(`/api/public/availability?branchId=${meta?.branchId}&serviceId=${meta?.serviceId}&date=${date}`),
    enabled: !!meta,
  })

  const move = useMutation({
    mutationFn: () => apiPatch('/api/business/appointments', { id: appt.id, action: 'reschedule', date, time }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biz-appts'] })
      qc.invalidateQueries({ queryKey: ['biz-queue'] })
      toast({ title: 'زمان نوبت تغییر کرد و پیامک اطلاع‌رسانی شد' })
      onClose()
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : 'خطا', variant: 'destructive' }),
  })

  const slots = (slotsData?.slots || []).filter((s) => s.available)

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg p-6" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-black">جابجایی نوبت {appt.code}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-[#525252]">مشتری: {appt.customer.name} — تغییر زمان با پیامک اطلاع‌رسانی می‌شود.</p>
        <div className="flex gap-1.5 overflow-x-auto pb-1 nice-scroll mt-2">
          {days.map((d) => (
            <button
              key={d.key}
              onClick={() => { setDate(d.key); setTime(null) }}
              className={`shrink-0 px-3 py-2 border-2 text-xs font-bold text-center transition-colors ${
                date === d.key ? 'bg-[#0a0a0a] text-[#fafafa] border-[#0a0a0a]' : 'border-[#e5e5e5] hover:border-[#0a0a0a]'
              }`}
            >
              <span className="block text-[9px] opacity-70">{d.weekdayShort}</span>
              {d.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-2 max-h-40 overflow-y-auto nice-scroll">
          {isFetching && <p className="col-span-5 text-xs text-[#525252] py-4 text-center">در حال بارگذاری ساعات آزاد…</p>}
          {slots.map((s) => (
            <button
              key={s.time}
              onClick={() => setTime(s.time)}
              className={`h-9 border-2 text-xs font-bold vb-code transition-colors ${
                time === s.time ? 'bg-[#0a0a0a] text-[#fafafa] border-[#0a0a0a]' : 'border-[#d4d4d4] hover:border-[#0a0a0a]'
              }`}
            >
              {faDigits(s.time)}
            </button>
          ))}
          {!isFetching && slots.length === 0 && (
            <p className="col-span-5 text-xs text-[#525252] py-4 text-center font-bold">ساعت آزادی برای این روز نیست.</p>
          )}
        </div>
        <Button
          onClick={() => move.mutate()}
          disabled={!time || move.isPending}
          className="w-full h-11 rounded-none bg-[#0a0a0a] text-[#fafafa] hover:bg-[#ef4444] font-bold"
        >
          تأیید جابجایی
        </Button>
      </DialogContent>
    </Dialog>
  )
}
