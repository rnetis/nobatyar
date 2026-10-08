'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch } from '../api-client'
import { faDigits, faNumber, formatJalaliFull, formatTime } from '@/lib/jalali'
import { NOTIFICATION_TYPE_FA, AUDIT_ACTION_FA, statusChipClass } from '../labels'
import { SectionSkeleton } from './panel-shell'
import { useToast } from '@/hooks/use-toast'
import { Switch } from '@/components/ui/switch'
import { BellRing, ShieldCheck, ScrollText, MessageSquareText } from 'lucide-react'

// ─────────────────────────── Settings ───────────────────────────

interface SettingsResponse {
  tenant: {
    id: string; name: string; slug: string; category: string; phone: string | null
    address: string | null; queuePrefix: string; reasonRequired: boolean; smsProvider: string
    plan: { name: string; maxBookings: number; maxStaff: number; maxBranches: number; smsQuota: number } | null
  }
  notifPolicy: Record<string, boolean>
  cancelPolicy: { allowCustomerCancel?: boolean; minMinutesBefore?: number; sendCancelSms?: boolean }
}

const NOTIF_OPTIONS: { key: string; label: string; desc: string }[] = [
  { key: 'smsOnBooking', label: 'ثبت نوبت', desc: 'پس از ثبت موفق نوبت همراه با لینک صف زنده' },
  { key: 'smsOnQueueChange', label: 'تغییر مؤثر صف', desc: 'وقتی جایگاه مشتری واقعاً جابجا شود (ضداسپم)' },
  { key: 'smsOnReschedule', label: 'جابجایی زمان', desc: 'زمانی که نوبت به زمان دیگری منتقل شود' },
  { key: 'smsOnCancel', label: 'لغو نوبت', desc: 'لغو از سمت مرکز یا مشتری' },
  { key: 'smsOnCalled', label: 'فراخوانی', desc: 'وقتی نوبت مشتری فراخوانده می‌شود' },
  { key: 'smsOnNoShow', label: 'عدم حضور', desc: 'ثبت خودکار No-show' },
]

export function SettingsSection() {
  const { data, isLoading } = useQuery<SettingsResponse>({
    queryKey: ['biz-settings'],
    queryFn: () => apiGet('/api/business/settings'),
  })
  if (isLoading || !data) return <SectionSkeleton />

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <p className="vb-overline mb-2">پیکربندی مرکز</p>
        <h1 className="vb-display text-3xl">تنظیمات</h1>
      </div>

      {/* Business identity */}
      <div className="vb-card p-5">
        <p className="font-black mb-4">اطلاعات کسب‌وکار</p>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <Info label="نام مرکز" value={data.tenant.name} />
          <Info label="شناسه (Slug)" value={data.tenant.slug} mono />
          <Info label="دسته‌بندی" value={data.tenant.category} />
          <Info label="پیشوند شماره نوبت" value={data.tenant.queuePrefix} mono />
          <Info label="تلفن" value={data.tenant.phone || '—'} />
          <Info label="ارائه‌دهنده پیامک" value={data.tenant.smsProvider} />
          <Info label="آدرس" value={data.tenant.address || '—'} wide />
        </div>
      </div>

      {/* Plan */}
      {data.tenant.plan && (
        <div className="vb-card-elevated p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-black">پلن اشتراک: {data.tenant.plan.name}</p>
            <span className="vb-chip vb-chip-black">فعال</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
            <PlanLimit label="شعبه" value={data.tenant.plan.maxBranches} />
            <PlanLimit label="کارمند" value={data.tenant.plan.maxStaff} />
            <PlanLimit label="نوبت در ماه" value={data.tenant.plan.maxBookings} />
            <PlanLimit label="پیامک در ماه" value={data.tenant.plan.smsQuota} />
          </div>
          <p className="text-[11px] text-[#525252] mt-3">ارتقا و تغییر پلن از طریق پنل مدیریت پلتفرم انجام می‌شود.</p>
        </div>
      )}

      <NotificationPolicyCard notifPolicy={data.notifPolicy} />
      <CancellationPolicyCard cancelPolicy={data.cancelPolicy} reasonRequired={data.tenant.reasonRequired} />
    </div>
  )
}

function PlanLimit({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-2 border-[#e5e5e5] p-3">
      <p className="font-black text-xl">{value >= 999999 ? '∞' : faNumber(value)}</p>
      <p className="text-[10px] text-[#525252] mt-1">{label}</p>
    </div>
  )
}

function Info({ label, value, mono, wide }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <p className="text-[11px] font-bold text-[#525252] mb-0.5">{label}</p>
      <p className={`font-bold ${mono ? 'vb-code' : ''}`}>{value}</p>
    </div>
  )
}

function NotificationPolicyCard({ notifPolicy }: { notifPolicy: Record<string, boolean> }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const toggle = useMutation({
    mutationFn: (patch: Record<string, boolean>) => apiPatch('/api/business/settings', { notifPolicy: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biz-settings'] })
      toast({ title: 'سیاست اطلاع‌رسانی بروزرسانی شد' })
    },
  })

  return (
    <div className="vb-card p-5">
      <div className="flex items-center gap-2 mb-1">
        <BellRing className="w-4 h-4 text-[#ef4444]" />
        <p className="font-black">سیاست اطلاع‌رسانی پیامکی</p>
      </div>
      <p className="text-xs text-[#525252] mb-4 leading-6">
        تغییرات جزئی صف فقط از طریق WebSocket (بدون پیامک) اطلاع‌رسانی می‌شود تا از اسپم جلوگیری شود (PRD §21).
      </p>
      <div className="divide-y divide-[#f0f0f0]">
        {NOTIF_OPTIONS.map((opt) => (
          <div key={opt.key} className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-bold">{opt.label}</p>
              <p className="text-[11px] text-[#525252]">{opt.desc}</p>
            </div>
            <Switch
              checked={notifPolicy[opt.key] !== false}
              onCheckedChange={(v) => toggle.mutate({ [opt.key]: v })}
              className="data-[state=checked]:bg-[#0a0a0a]"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function CancellationPolicyCard({ cancelPolicy, reasonRequired }: { cancelPolicy: SettingsResponse['cancelPolicy']; reasonRequired: boolean }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [minMinutes, setMinMinutes] = useState(String(cancelPolicy.minMinutesBefore ?? 120))
  const [reasonReq, setReasonReq] = useState(reasonRequired)

  useEffect(() => { setReasonReq(reasonRequired) }, [reasonRequired])

  const save = useMutation({
    mutationFn: () => apiPatch('/api/business/settings', {
      cancelPolicy: {
        ...cancelPolicy,
        allowCustomerCancel: cancelPolicy.allowCustomerCancel !== false,
        sendCancelSms: cancelPolicy.sendCancelSms !== false,
        minMinutesBefore: Number(minMinutes) || 0,
      },
      reasonRequired: reasonReq,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biz-settings'] })
      toast({ title: 'قوانین لغو ذخیره شد' })
    },
  })

  return (
    <div className="vb-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="w-4 h-4 text-[#ef4444]" />
        <p className="font-black">قوانین لغو و تغییر دستی</p>
      </div>
      <div className="space-y-4 text-sm">
        <div className="flex items-center justify-between">
          <p>امکان لغو توسط مشتری</p>
          <p className="text-xs font-bold text-[#525252]">{cancelPolicy.allowCustomerCancel !== false ? 'مجاز' : 'غیرمجاز'}</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="shrink-0">حداقل فاصله لغو (دقیقه قبل از نوبت)</p>
          <input
            type="number" value={minMinutes} onChange={(e) => setMinMinutes(e.target.value)}
            className="w-24 h-9 border-2 border-[#d4d4d4] px-2 text-sm vb-code text-left focus:outline-none focus:border-[#0a0a0a]"
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p>دلیل اجباری برای تغییرات دستی صف</p>
            <p className="text-[11px] text-[#525252]">اپراتور موظف است دلیل Skip/جابجایی را ثبت کند</p>
          </div>
          <Switch checked={reasonReq} onCheckedChange={setReasonReq} className="data-[state=checked]:bg-[#0a0a0a]" />
        </div>
        <button onClick={() => save.mutate()} disabled={save.isPending} className="vb-btn vb-btn-primary vb-btn-sm">
          ذخیره قوانین
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────── SMS Log ───────────────────────────

interface NotificationRow {
  id: string; type: string; recipient: string; body: string; status: string
  createdAt: string; sentAt: string | null
  appointment?: { code: string } | null
}

export function SmsSection() {
  const { data, isLoading } = useQuery<{ notifications: NotificationRow[] }>({
    queryKey: ['biz-sms'],
    queryFn: () => apiGet('/api/business/notifications'),
  })
  if (isLoading) return <SectionSkeleton />
  const notifications = data?.notifications || []

  return (
    <div className="space-y-5">
      <div>
        <p className="vb-overline mb-2">موتور اطلاع‌رسانی</p>
        <h1 className="vb-display text-3xl">گزارش پیامک‌ها</h1>
      </div>
      <div className="vb-card divide-y divide-[#f0f0f0]">
        {notifications.length === 0 && (
          <p className="p-10 text-center text-sm font-bold text-[#525252]">هنوز پیامکی ارسال نشده است.</p>
        )}
        {notifications.map((n) => (
          <div key={n.id} className="p-4 flex items-start gap-3">
            <MessageSquareText className="w-4 h-4 mt-1 text-[#525252] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-black text-sm">{NOTIFICATION_TYPE_FA[n.type] || n.type}</span>
                <span className="vb-code text-[11px] text-[#525252]">{faDigits(n.recipient)}</span>
                {n.appointment && <span className="vb-code text-[11px] font-bold">{n.appointment.code}</span>}
                <span className={statusChipClass(n.status)}>
                  {n.status === 'SENT' ? 'ارسال شد' : n.status === 'PENDING' ? 'در صف ارسال' : 'ناموفق'}
                </span>
              </div>
              <p className="text-xs text-[#525252] leading-6 whitespace-pre-line">{n.body}</p>
              <p className="text-[10px] text-[#a3a3a3] mt-1">
                {formatJalaliFull(n.createdAt)} — {faDigits(formatTime(new Date(n.createdAt)))}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────── Audit Log ───────────────────────────

interface AuditRow {
  id: string; actor: string; role: string | null; action: string
  entityType: string; entityId: string | null; detail: string | null; createdAt: string
}

export function AuditSection() {
  const { data, isLoading } = useQuery<{ logs: AuditRow[] }>({
    queryKey: ['biz-audit'],
    queryFn: () => apiGet('/api/business/audit'),
  })
  if (isLoading) return <SectionSkeleton />
  const logs = data?.logs || []

  return (
    <div className="space-y-5">
      <div>
        <p className="vb-overline mb-2">شفافیت کامل عملیات</p>
        <h1 className="vb-display text-3xl">رخدادها (Audit Log)</h1>
      </div>
      <div className="vb-card overflow-x-auto nice-scroll">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b-2 border-[#0a0a0a] text-xs">
              <th className="px-4 py-3 text-right font-black text-[#525252]">زمان</th>
              <th className="px-4 py-3 text-right font-black text-[#525252]">کاربر</th>
              <th className="px-4 py-3 text-right font-black text-[#525252]">عملیات</th>
              <th className="px-4 py-3 text-right font-black text-[#525252]">موجودیت</th>
              <th className="px-4 py-3 text-right font-black text-[#525252]">جزئیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f0]">
            {logs.map((l) => (
              <tr key={l.id} className="hover:bg-[#fafafa]">
                <td className="px-4 py-2.5 text-xs">
                  <p className="font-bold">{formatJalaliFull(l.createdAt)}</p>
                  <p className="vb-code text-[#525252]">{faDigits(formatTime(new Date(l.createdAt)))}</p>
                </td>
                <td className="px-4 py-2.5">
                  <p className="font-bold text-xs">{l.actor}</p>
                  <p className="text-[10px] text-[#525252]">{l.role || '—'}</p>
                </td>
                <td className="px-4 py-2.5 text-xs font-bold">
                  <span className="flex items-center gap-1.5">
                    <ScrollText className="w-3 h-3 text-[#ef4444]" />
                    {AUDIT_ACTION_FA[l.action] || l.action}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-[#525252]">{l.entityType}</td>
                <td className="px-4 py-2.5 text-[11px] text-[#525252] max-w-[240px] truncate" dir="ltr">
                  {l.detail || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <p className="p-10 text-center text-sm font-bold text-[#525252]">رخدادی ثبت نشده است.</p>}
      </div>
    </div>
  )
}
