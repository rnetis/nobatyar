'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '../api-client'
import { faDigits, minutesFa, dateKey } from '@/lib/jalali'
import { APPOINTMENT_STATUS_FA, PRIORITY_FA, statusChipClass } from '../labels'
import { SectionSkeleton } from './panel-shell'
import { WalkInDialog } from './walk-in-dialog'
import { useToast } from '@/hooks/use-toast'
import {
  Megaphone, Play, CheckCheck, SkipForward, XCircle, UserX, Pause, Play as PlayIcon,
  ArrowUp, ArrowDown, Crown, UserPlus, PhoneCall, Star, Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Snapshot {
  queue: {
    id: string; status: string; date: string; currentServing: string | null
    avgServiceMin: number; branchName: string; serviceName: string; tenantName: string; logoText: string
  }
  counts: { total: number; waiting: number; completed: number; noShow: number; skipped: number }
  serving: { id: string; code: string; status: string; customerName: string; calledAt: string | null }[]
  waiting: {
    id: string; code: string; position: number; peopleAhead: number; estimatedWait: number
    priority: string; status: string; token: string; customerName: string; joinedAt: string
  }[]
  recent: { id: string; code: string; status: string; customerName: string; completedAt: string | null }[]
}

export function QueueSection() {
  const { data, isLoading } = useQuery<{ queues: Snapshot[] }>({
    queryKey: ['biz-queue'],
    queryFn: () => apiGet(`/api/business/queue?date=${dateKey(new Date())}`),
    refetchInterval: 15_000,
  })

  if (isLoading) return <SectionSkeleton />
  const queues = data?.queues || []
  if (queues.length === 0) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="vb-card p-12 text-center">
          <p className="font-black text-lg mb-2">امروز صفی تشکیل نشده</p>
          <p className="text-sm text-[#525252] mb-6">
            با ثبت نوبت حضوری یا آنلاین، صف امروز ساخته می‌شود. می‌توانید همین حالا یک نوبت حضوری ثبت کنید.
          </p>
          <WalkInDialog compact={false} />
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <Header />
      {queues.map((q) => <QueueBoard key={q.queue.id} snapshot={q} />)}
    </div>
  )
}

function Header() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="vb-overline mb-2">کنسول عملیاتی</p>
        <h1 className="vb-display text-3xl">مدیریت صف زنده</h1>
      </div>
      <div className="flex items-center gap-2">
        <WalkInDialog />
      </div>
    </div>
  )
}

function QueueBoard({ snapshot }: { snapshot: Snapshot }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [reasonOpen, setReasonOpen] = useState<{ action: string; entryId?: string } | null>(null)
  const [reason, setReason] = useState('')

  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost<{ snapshot: Snapshot }>('/api/business/queue/action', { queueId: snapshot.queue.id, ...body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biz-queue'] })
      qc.invalidateQueries({ queryKey: ['biz-overview'] })
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : 'خطا', variant: 'destructive' }),
  })

  const serving = snapshot.serving[0]
  const waiting = snapshot.waiting

  const doAction = (action: string, extra: Record<string, unknown> = {}) => {
    if (['skip', 'cancel', 'move'].includes(action)) {
      setReasonOpen({ action, entryId: (extra.entryId as string) || serving?.id })
      act.mutate({ action, ...extra }) // still execute; reason is optional unless tenant requires
      setReasonOpen(null)
      return
    }
    act.mutate({ action, ...extra })
  }

  return (
    <div className="grid lg:grid-cols-[1fr_1.25fr] gap-4 items-start">
      {/* ── Now serving console ── */}
      <div className="space-y-4">
        <div className="vb-card-elevated p-0">
          <div className="bg-[#0a0a0a] text-[#fafafa] px-5 py-3 flex items-center justify-between">
            <div>
              <p className="font-black text-sm">{snapshot.queue.serviceName}</p>
              <p className="text-[10px] text-[#a3a3a3]">{snapshot.queue.branchName}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={snapshot.queue.status === 'OPEN' ? 'vb-chip vb-chip-success' : 'vb-chip vb-chip-warning'}>
                {snapshot.queue.status === 'OPEN' ? 'فعال' : snapshot.queue.status === 'PAUSED' ? 'متوقف' : 'بسته'}
              </span>
              <button
                onClick={() => act.mutate({ action: snapshot.queue.status === 'OPEN' ? 'pause' : 'resume' })}
                className="text-[#a3a3a3] hover:text-[#ef4444] transition-colors"
                title={snapshot.queue.status === 'OPEN' ? 'توقف صف' : 'ادامه صف'}
              >
                {snapshot.queue.status === 'OPEN' ? <Pause className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="p-6 text-center">
            <p className="text-xs font-bold text-[#525252] mb-1">در حال سرویس</p>
            <p className="vb-code text-6xl font-black mb-1">{serving?.code || '—'}</p>
            <p className="text-sm font-bold text-[#525252]">
              {serving ? serving.customerName : 'هیچ نوبتی فراخوانده نشده'}
            </p>
            {serving && (
              <span className="inline-block mt-2">
                <span className={statusChipClass(serving.status)}>{APPOINTMENT_STATUS_FA[serving.status]}</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 px-4 pb-4">
            <button onClick={() => doAction('next')} disabled={act.isPending} className="vb-btn vb-btn-primary !py-3">
              <Megaphone className="w-4 h-4" /> فراخوانی بعدی
            </button>
            <button onClick={() => doAction('serve')} disabled={!serving || serving.status !== 'CALLED'} className="vb-btn vb-btn-secondary !py-3">
              <Play className="w-4 h-4" /> شروع سرویس
            </button>
            <button onClick={() => doAction('complete')} disabled={!serving} className="vb-btn vb-btn-secondary !py-3">
              <CheckCheck className="w-4 h-4" /> تکمیل
            </button>
            <button onClick={() => doAction('recall')} disabled={!serving} className="vb-btn vb-btn-ghost !py-3">
              <PhoneCall className="w-4 h-4" /> فراخوانی مجدد
            </button>
            <button onClick={() => doAction('skip')} disabled={!serving} className="vb-btn vb-btn-ghost !py-3 !text-[#ca8a04]">
              <SkipForward className="w-4 h-4" /> رد کردن
            </button>
            <button onClick={() => doAction('no_show')} disabled={!serving} className="vb-btn vb-btn-ghost !py-3 !text-[#ef4444]">
              <UserX className="w-4 h-4" /> عدم حضور
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2">
          <MiniStat label="در انتظار" value={faDigits(snapshot.counts.waiting)} />
          <MiniStat label="تکمیل" value={faDigits(snapshot.counts.completed)} />
          <MiniStat label="رد شده" value={faDigits(snapshot.counts.skipped)} />
          <MiniStat label="میانگین" value={minutesFa(snapshot.queue.avgServiceMin).replace(' دقیقه', "'")} />
        </div>

        {/* Recently finished */}
        {snapshot.recent.length > 0 && (
          <div className="vb-card p-4">
            <p className="text-xs font-black mb-3">آخرین خروجی‌ها از صف</p>
            <div className="space-y-1.5">
              {snapshot.recent.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs border-b border-[#f5f5f5] pb-1.5 last:border-0 last:pb-0">
                  <span className="flex items-center gap-2">
                    <span className="vb-code font-bold">{r.code}</span>
                    <span className="text-[#525252]">{r.customerName}</span>
                  </span>
                  <span className={statusChipClass(r.status)}>{APPOINTMENT_STATUS_FA[r.status]}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Waiting list ── */}
      <div className="vb-card p-0">
        <div className="px-5 py-3.5 border-b-2 border-[#e5e5e5] flex items-center justify-between">
          <p className="font-black text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#ef4444]" />
            صف انتظار ({faDigits(waiting.length)} نفر)
          </p>
          <span className="text-[10px] font-bold text-[#525252]">تغییرات به‌صورت زنده اعمال می‌شود</span>
        </div>
        <div className="max-h-[560px] overflow-y-auto nice-scroll divide-y divide-[#f0f0f0]">
          {waiting.length === 0 && (
            <p className="text-center text-sm text-[#525252] font-bold py-12">صف خالی است — نفر بعدی را فراخوانی کنید.</p>
          )}
          {waiting.map((w) => (
            <div key={w.id} className="px-5 py-3 flex items-center gap-3 hover:bg-[#fafafa]">
              {/* position */}
              <span className={`w-9 h-9 flex items-center justify-center font-black text-lg shrink-0 ${
                w.position === 1 ? 'bg-[#ef4444] text-[#fafafa]' : 'bg-[#f5f5f5] text-[#0a0a0a]'
              }`}>
                {faDigits(w.position)}
              </span>
              {/* identity */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="vb-code font-black">{w.code}</span>
                  {w.priority !== 'NORMAL' && (
                    <span className="vb-chip vb-chip-error !py-0"><Crown className="w-3 h-3" />{PRIORITY_FA[w.priority]}</span>
                  )}
                </div>
                <p className="text-xs text-[#525252] truncate">
                  {w.customerName} • انتظار {minutesFa(w.estimatedWait)}
                </p>
              </div>
              {/* actions */}
              <div className="flex items-center gap-1 shrink-0">
                <IconBtn title="فراخوانی" onClick={() => doAction('call', { entryId: w.id })}><Megaphone className="w-3.5 h-3.5" /></IconBtn>
                <IconBtn title="بالا" onClick={() => doAction('move', { entryId: w.id, direction: 'up' })}><ArrowUp className="w-3.5 h-3.5" /></IconBtn>
                <IconBtn title="پایین" onClick={() => doAction('move', { entryId: w.id, direction: 'down' })}><ArrowDown className="w-3.5 h-3.5" /></IconBtn>
                <IconBtn title="اولویت VIP" onClick={() => doAction('priority', { entryId: w.id, priority: w.priority === 'VIP' ? 'NORMAL' : 'VIP' })}>
                  <Star className={`w-3.5 h-3.5 ${w.priority === 'VIP' ? 'text-[#ef4444]' : ''}`} />
                </IconBtn>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="vb-card p-3 text-center">
      <p className="text-[10px] font-bold text-[#525252]">{label}</p>
      <p className="font-black text-xl mt-0.5">{value}</p>
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
