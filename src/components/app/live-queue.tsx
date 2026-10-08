'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from './api-client'
import { subscribeQueue } from './socket'
import { faDigits, minutesFa, formatTime, formatJalaliMedium } from '@/lib/jalali'
import { APPOINTMENT_STATUS_FA, PRIORITY_FA } from './labels'
import { PublicHeader } from './landing'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Radio, Wifi, WifiOff, PhoneCall, CheckCircle2, XCircle, UserX,
  RefreshCw, ArrowRight,
} from 'lucide-react'

interface QueueStateResponse {
  appointment: {
    code: string
    status: string
    priority: string
    scheduledAt: string
    durationMin: number
    customerName: string
    serviceName: string
    branchName: string
    tenantName: string
    logoText: string
    staffName: string | null
  }
  queue: {
    id: string
    status: string
    currentServing: string | null
    waiting: number
    completed: number
    avgServiceMin: number
  } | null
  me: {
    position: number | null
    status: string
    peopleAhead: number
    estimatedWait: number
    joinedAt: string
    calledAt: string | null
    startedAt: string | null
  } | null
  finalStatus: boolean
  error?: string
}

export function LiveQueue({ token }: { token: string }) {
  const [connected, setConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<number>(0)
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data, isLoading, error, refetch, isFetching } = useQuery<QueueStateResponse>({
    queryKey: ['live-queue', token],
    queryFn: () => apiGet(`/api/public/queue/${token}`),
    refetchInterval: 30_000, // safety net; primary channel is WebSocket
  })

  // Real-time subscription (PRD §9 — queue.updated events)
  useEffect(() => {
    const cleanup = subscribeQueue(
      token,
      () => {
        setLastEvent(Date.now())
        refetch()
        if (flashRef.current) clearTimeout(flashRef.current)
      },
      setConnected,
    )
    return cleanup
  }, [token, refetch])

  if (isLoading) return <QueueSkeleton />

  if (error || !data?.appointment) {
    return (
      <div className="min-h-screen flex flex-col">
        <PublicHeader />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="vb-card p-10 text-center max-w-md">
            <p className="vb-overline mb-3 justify-center">خطا</p>
            <h1 className="vb-display text-2xl mb-3">لینک صف معتبر نیست</h1>
            <p className="text-sm text-[#525252] mb-6">
              این لینک منقضی شده یا اشتباه است. از پیامک دریافتی دوباره استفاده کنید.
            </p>
            <a href="#/"><button className="vb-btn vb-btn-secondary">صفحه اصلی</button></a>
          </div>
        </main>
      </div>
    )
  }

  const { appointment, queue, me } = data
  const isWaiting = me?.status === 'WAITING' && queue?.status !== 'CLOSED'
  const isCalled = appointment.status === 'CALLED' || me?.status === 'CALLED'
  const inService = appointment.status === 'IN_SERVICE' || me?.status === 'IN_SERVICE'
  const done = ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'SKIPPED'].includes(appointment.status)
  const queueClosed = queue?.status === 'CLOSED'
  const queuePaused = queue?.status === 'PAUSED'

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      {/* Header */}
      <header className="bg-[#0a0a0a] text-[#fafafa]">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 bg-[#ef4444] font-black text-lg flex items-center justify-center">{appointment.logoText}</span>
            <div>
              <p className="font-black">{appointment.tenantName}</p>
              <p className="text-xs text-[#a3a3a3]">{appointment.serviceName} • {appointment.branchName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold">
            {connected ? (
              <span className="flex items-center gap-1.5 text-[#fafafa]">
                <span className="vb-live-dot" /> زنده
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[#a3a3a3]">
                <WifiOff className="w-3.5 h-3.5" /> قطع
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8">
        {/* ── CALLED — big attention state ── */}
        {isCalled && (
          <div className="border-4 border-[#ef4444] bg-[#fef2f2] p-8 text-center mb-6 vb-flash">
            <PhoneCall className="w-10 h-10 text-[#ef4444] mx-auto mb-3" />
            <p className="font-black text-3xl text-[#ef4444] mb-1">نوبت شماست!</p>
            <p className="text-sm text-[#525252]">لطفاً برای دریافت خدمت مراجعه کنید.</p>
          </div>
        )}

        {inService && (
          <div className="border-4 border-[#16a34a] bg-[#f0fdf4] p-8 text-center mb-6">
            <CheckCircle2 className="w-10 h-10 text-[#16a34a] mx-auto mb-3" />
            <p className="font-black text-2xl text-[#16a34a] mb-1">در حال دریافت خدمت</p>
            <p className="text-sm text-[#525252]">از حضور شما متشکریم.</p>
          </div>
        )}

        {done && (
          <div className="vb-card p-8 text-center mb-6">
            {appointment.status === 'COMPLETED' ? (
              <>
                <CheckCircle2 className="w-10 h-10 text-[#16a34a] mx-auto mb-3" />
                <p className="font-black text-xl mb-1">نوبت شما تکمیل شد</p>
                <p className="text-sm text-[#525252]">از انتخاب نوب‌یار متشکریم.</p>
              </>
            ) : (
              <>
                <XCircle className="w-10 h-10 text-[#ef4444] mx-auto mb-3" />
                <p className="font-black text-xl mb-1">{APPOINTMENT_STATUS_FA[appointment.status]}</p>
                <p className="text-sm text-[#525252]">
                  {appointment.status === 'CANCELLED' && 'این نوبت لغو شده است. در صورت نیاز می‌توانید نوبت جدیدی بگیرید.'}
                  {appointment.status === 'NO_SHOW' && 'به دلیل عدم حضور، این نوبت بسته شد.'}
                  {appointment.status === 'SKIPPED' && 'این نوبت از صف خارج شد. با پذیرش مرکز تماس بگیرید.'}
                </p>
                <a href="#/" className="inline-block mt-4"><span className="vb-btn vb-btn-secondary vb-btn-sm">دریافت نوبت جدید</span></a>
              </>
            )}
          </div>
        )}

        {/* ── Main board ── */}
        <div className="vb-card-elevated p-0">
          <div className="px-6 py-4 border-b-2 border-[#e5e5e5] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-[#ef4444]" />
              <span className="font-black text-sm">وضعیت صف — {formatJalaliMedium(appointment.scheduledAt)}</span>
            </div>
            <button onClick={() => refetch()} className="flex items-center gap-1 text-xs font-bold text-[#525252] hover:text-[#ef4444]">
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              بروزرسانی
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* My number */}
            <div className="text-center">
              <p className="text-xs font-bold text-[#525252] mb-1">نوبت شما</p>
              <p className="vb-code text-[64px] leading-none font-black" key={appointment.code}>{appointment.code}</p>
              <div className="flex items-center justify-center gap-2 mt-3">
                <span className="vb-chip vb-chip-black">{APPOINTMENT_STATUS_FA[me?.status || appointment.status]}</span>
                {appointment.priority !== 'NORMAL' && (
                  <span className="vb-chip vb-chip-error">اولویت: {PRIORITY_FA[appointment.priority]}</span>
                )}
              </div>
            </div>

            {/* Live metrics */}
            {isWaiting && (
              <div className="grid grid-cols-3 gap-0 divide-x-2 divide-x-reverse divide-[#e5e5e5] border-2 border-[#e5e5e5]">
                <Metric label="جایگاه شما" value={me?.position != null ? faDigits(me.position) : '—'} />
                <Metric label="افراد قبل از شما" value={faDigits(me?.peopleAhead ?? 0)} />
                <Metric label="انتظار تقریبی" value={minutesFa(me?.estimatedWait ?? 0)} small />
              </div>
            )}

            {/* Now serving */}
            <div className={`bg-[#0a0a0a] text-[#fafafa] p-4 flex items-center justify-between ${isCalled || inService || done ? 'opacity-60' : ''}`}>
              <div>
                <p className="text-[10px] font-bold text-[#a3a3a3] mb-0.5">در حال سرویس</p>
                <p className="vb-code text-3xl font-black">{queue?.currentServing || '—'}</p>
              </div>
              <div className="text-left">
                <p className="text-[10px] font-bold text-[#a3a3a3] mb-0.5">افراد در صف</p>
                <p className="font-black text-2xl">{faDigits(queue?.waiting ?? 0)}</p>
              </div>
            </div>

            {/* Queue status notices */}
            {queueClosed && (
              <div className="border-2 border-[#ef4444] bg-[#fef2f2] p-4 text-center">
                <p className="font-black text-[#ef4444] text-sm">صف امروز بسته شده است</p>
                <p className="text-xs text-[#525252] mt-1">نوبت‌های جدید پذیرش نمی‌شود. برای هماهنگی با مرکز تماس بگیرید.</p>
              </div>
            )}
            {queuePaused && !done && (
              <div className="border-2 border-[#ca8a04] bg-[#fefce8] p-4 text-center">
                <p className="font-black text-[#ca8a04] text-sm">صف موقتاً متوقف شده</p>
                <p className="text-xs text-[#525252] mt-1">به‌محض ادامه کار، این صفحه به‌روزرسانی می‌شود.</p>
              </div>
            )}

            {/* Footer info */}
            <div className="border-t-2 border-[#e5e5e5] pt-4 grid grid-cols-2 gap-3 text-xs">
              <InfoRow label="زمان نوبت" value={faDigits(new Date(appointment.scheduledAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))} />
              <InfoRow label="آخرین بروزرسانی" value={faDigits(formatTime(new Date(lastEvent || Date.now())))} />
              <InfoRow label="تکمیل‌شده امروز" value={faDigits(queue?.completed ?? 0)} />
              <InfoRow label="میانگین سرویس" value={minutesFa(queue?.avgServiceMin ?? appointment.durationMin)} />
            </div>
          </div>
        </div>

        <a href="#/" className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-[#525252] hover:text-[#ef4444] transition-colors">
          <ArrowRight className="w-4 h-4" />
          بازگشت به صفحه اصلی
        </a>
      </main>
    </div>
  )
}

function Metric({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="py-4 text-center px-2">
      <p className="text-[10px] font-bold text-[#525252] mb-1">{label}</p>
      <p className={`font-black ${small ? 'text-xl' : 'text-3xl'}`}>{value}</p>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#525252]">{label}</span>
      <span className="font-bold vb-code">{value}</span>
    </div>
  )
}

function QueueSkeleton() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-[#0a0a0a] h-[72px]" />
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8">
        <Skeleton className="h-32 w-full rounded-none" />
        <Skeleton className="h-64 w-full rounded-none mt-6" />
      </main>
    </div>
  )
}
