'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '../api-client'
import { faDigits, faNumber, formatJalaliFull } from '@/lib/jalali'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Send } from 'lucide-react'

interface CustomerRow {
  id: string
  name: string
  mobile: string
  email: string | null
  note: string | null
  visits: number
  lastVisit: string | null
  createdAt: string
}

export function CustomersSection() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteText, setInviteText] = useState('')

  const { data, isLoading } = useQuery<{ customers: CustomerRow[] }>({
    queryKey: ['biz-customers', filter],
    queryFn: () => apiGet(`/api/business/customers${filter ? `?q=${encodeURIComponent(filter)}` : ''}`),
  })

  const invite = useMutation({
    mutationFn: (body: { ids: string[]; messageText?: string }) =>
      apiPost<{ invited: number; skipped: number; message: string }>('/api/business/customers', body),
    onSuccess: (res) => {
      toast({ title: res.message })
      setSelected(new Set())
      setInviteOpen(false)
      qc.invalidateQueries({ queryKey: ['biz-sms'] })
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : 'خطا', variant: 'destructive' }),
  })

  if (isLoading) return <SectionSkeleton />

  const customers = data?.customers || []
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="vb-overline mb-2">مشتریان قدیمی</p>
          <h1 className="vb-display text-3xl">مشتریان</h1>
        </div>
        <button
          className="vb-btn vb-btn-primary"
          disabled={selected.size === 0 || invite.isPending}
          onClick={() => setInviteOpen(true)}
        >
          <Send className="w-4 h-4" /> دعوت به رزرو ({faDigits(selected.size)})
        </button>
      </div>

      <Input placeholder="جستجو: نام یا موبایل..." value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-sm" />

      <div className="vb-card overflow-x-auto nice-scroll">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b-2 border-[#0a0a0a] text-xs">
              <th className="px-4 py-3 w-10"></th>
              {['مشتری', 'موبایل', 'تعداد مراجعه', 'آخرین مراجعه', 'عضویت'].map((h) => (
                <th key={h} className="px-4 py-3 text-right font-black text-[#525252]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f0]">
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-[#fafafa]">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="w-4 h-4 accent-[#0a0a0a]"
                  />
                </td>
                <td className="px-4 py-3">
                  <p className="font-black">{c.name}</p>
                  {c.note && <p className="text-[10px] text-[#525252]">{c.note}</p>}
                </td>
                <td className="px-4 py-3 text-xs vb-code" dir="ltr">{faDigits(c.mobile)}</td>
                <td className="px-4 py-3 text-xs font-bold">{faNumber(c.visits)}</td>
                <td className="px-4 py-3 text-xs">{c.lastVisit ? formatJalaliFull(c.lastVisit) : '--'}</td>
                <td className="px-4 py-3 text-xs">{formatJalaliFull(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {customers.length === 0 && (
          <p className="p-10 text-center text-sm font-bold text-[#525252]">هنوز مشتری‌ای ثبت نشده است.</p>
        )}
      </div>

      {inviteOpen && (
        <Dialog open onOpenChange={(v) => !v && setInviteOpen(false)}>
          <DialogContent className="sm:max-w-md p-6" dir="rtl">
            <DialogHeader><DialogTitle className="font-black">دعوت به رزرو ({faDigits(selected.size)} مشتری)</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <p className="text-xs text-[#525252] leading-6">
                یک پیامک دعوت برای مشتریان انتخاب‌شده ارسال می‌شود. اگر متن زیر را خالی بگذارید، لینک رزرو نوبت به‌صورت خودکار ارسال می‌شود.
              </p>
              <div>
                <Label className="text-xs font-black mb-1.5 block">متن دلخواه (اختیاری)</Label>
                <textarea
                  value={inviteText}
                  onChange={(e) => setInviteText(e.target.value)}
                  className="w-full border-2 border-[#d4d4d4] px-3 py-2 text-xs h-20 resize-none focus:outline-none focus:border-[#0a0a0a]"
                  placeholder="مثلاً: تخفیف ویژه این هفته را از دست ندهید."
                />
              </div>
              <button
                className="vb-btn vb-btn-primary w-full"
                disabled={invite.isPending}
                onClick={() => invite.mutate({ ids: Array.from(selected), messageText: inviteText.trim() || undefined })}
              >
                {invite.isPending ? 'در حال ارسال...' : 'ارسال پیامک دعوت'}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-64 rounded-none" />
      <Skeleton className="h-64 rounded-none" />
    </div>
  )
}
