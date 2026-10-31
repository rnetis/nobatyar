'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '../api-client'
import { faDigits } from '@/lib/jalali'
import { SectionSkeleton } from './panel-shell'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Building2, Phone, MapPin } from 'lucide-react'

interface BranchRow {
  id: string; name: string; address: string | null; phone: string | null; hours: string; status: string
  _count: { services: number; staff: number; queues: number }
}
interface DayHours { open: string; close: string; closed: boolean }

// Iranian week order (Saturday first); keys match availability.ts
const DAYS: { key: string; label: string }[] = [
  { key: 'sat', label: 'شنبه' }, { key: 'sun', label: 'یکشنبه' }, { key: 'mon', label: 'دوشنبه' },
  { key: 'tue', label: 'سه‌شنبه' }, { key: 'wed', label: 'چهارشنبه' }, { key: 'thu', label: 'پنجشنبه' },
  { key: 'fri', label: 'جمعه' },
]

function defaultHours(): Record<string, DayHours> {
  return Object.fromEntries(DAYS.map((d) => [d.key, { open: '09:00', close: '18:00', closed: d.key === 'fri' }]))
}
function parseHours(json: string): Record<string, DayHours> {
  const out = defaultHours()
  try {
    const p = JSON.parse(json || '{}')
    for (const d of DAYS) if (p[d.key]) out[d.key] = { ...out[d.key], ...p[d.key] }
  } catch { /* defaults */ }
  return out
}

export function BranchesSection() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [editing, setEditing] = useState<BranchRow | null>(null)
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery<{ branches: BranchRow[] }>({
    queryKey: ['biz-branches'],
    queryFn: () => apiGet('/api/business/branches'),
  })
  const { data: settings } = useQuery<{ tenant: { plan: { name: string; maxBranches: number } | null } }>({
    queryKey: ['biz-settings'],
    queryFn: () => apiGet('/api/business/settings'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<{ softDeleted?: boolean; message?: string }>(`/api/business/branches?id=${id}`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['biz-branches'] })
      toast({ title: r.softDeleted ? (r.message || 'شعبه غیرفعال شد') : 'شعبه حذف شد' })
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : 'خطا', variant: 'destructive' }),
  })

  if (isLoading) return <SectionSkeleton />
  const branches = data?.branches || []
  const activeCount = branches.filter((b) => b.status === 'ACTIVE').length
  const max = settings?.tenant.plan?.maxBranches

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="vb-overline mb-2">
            {max !== undefined ? `${faDigits(activeCount)} از ${max >= 999 ? 'نامحدود' : faDigits(max)} شعبه فعال` : 'مراکز و ساعات کاری'}
          </p>
          <h1 className="vb-display text-3xl">شعبه‌ها</h1>
        </div>
        <button onClick={() => setCreating(true)} className="vb-btn vb-btn-primary">
          <Plus className="w-4 h-4" /> شعبه جدید
        </button>
      </div>

      {branches.length === 0 && (
        <div className="vb-card p-8 text-center">
          <p className="font-black mb-1">هنوز شعبه‌ای ندارید</p>
          <p className="text-xs text-[#525252] mb-4">برای دریافت نوبت، ابتدا حداقل یک شعبه با ساعات کاری تعریف کنید.</p>
          <button onClick={() => setCreating(true)} className="vb-btn vb-btn-primary"><Plus className="w-4 h-4" /> ساخت اولین شعبه</button>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {branches.map((b) => {
          const hours = parseHours(b.hours)
          const openDays = DAYS.filter((d) => !hours[d.key].closed).length
          return (
            <div key={b.id} className={`p-5 ${b.status === 'ACTIVE' ? 'vb-card' : 'vb-card opacity-60'}`}>
              <div className="flex items-start justify-between mb-3">
                <span className="w-10 h-10 bg-[#0a0a0a] text-[#fafafa] flex items-center justify-center"><Building2 className="w-5 h-5" /></span>
                <div className="flex items-center gap-1.5">
                  <span className={b.status === 'ACTIVE' ? 'vb-chip vb-chip-success' : 'vb-chip vb-chip-muted'}>
                    {b.status === 'ACTIVE' ? 'فعال' : 'غیرفعال'}
                  </span>
                  <button onClick={() => setEditing(b)} title="ویرایش" className="w-7 h-7 border-2 border-[#e5e5e5] flex items-center justify-center hover:border-[#0a0a0a] transition-colors">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => { if (window.confirm(`شعبه «${b.name}» حذف شود؟ (شعبه‌ای که خدمت، کارمند یا نوبت دارد فقط غیرفعال می‌شود)`)) remove.mutate(b.id) }}
                    title="حذف" className="w-7 h-7 border-2 border-[#e5e5e5] flex items-center justify-center hover:border-[#ef4444] transition-colors">
                    <Trash2 className="w-3 h-3 text-[#ef4444]" />
                  </button>
                </div>
              </div>
              <p className="font-black mb-2">{b.name}</p>
              {b.address && <p className="text-xs text-[#525252] flex items-center gap-1.5 mb-1"><MapPin className="w-3 h-3" />{b.address}</p>}
              {b.phone && <p className="text-xs text-[#525252] flex items-center gap-1.5" dir="ltr"><Phone className="w-3 h-3" />{b.phone}</p>}
              <div className="mt-3 pt-3 border-t-2 border-[#e5e5e5] text-xs text-[#525252] flex justify-between">
                <span>{faDigits(openDays)} روز کاری در هفته</span>
                <span>{faDigits(b._count.services)} خدمت • {faDigits(b._count.staff)} کارمند</span>
              </div>
            </div>
          )
        })}
      </div>

      <BranchDialog open={creating || !!editing} branch={editing} onClose={() => { setCreating(false); setEditing(null) }} />
    </div>
  )
}

function BranchDialog({ open, branch, onClose }: { open: boolean; branch: BranchRow | null; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [active, setActive] = useState(true)
  const [hours, setHours] = useState<Record<string, DayHours>>(defaultHours())

  const [seededFor, setSeededFor] = useState<string | null>(null)
  if (open && branch && seededFor !== branch.id) {
    setName(branch.name); setAddress(branch.address || ''); setPhone(branch.phone || '')
    setActive(branch.status === 'ACTIVE'); setHours(parseHours(branch.hours)); setSeededFor(branch.id)
  }
  if (open && !branch && seededFor !== 'new') {
    setName(''); setAddress(''); setPhone(''); setActive(true); setHours(defaultHours()); setSeededFor('new')
  }
  if (!open && seededFor !== null) setSeededFor(null)

  const setDay = (key: string, patch: Partial<DayHours>) => setHours((h) => ({ ...h, [key]: { ...h[key], ...patch } }))
  const badDay = DAYS.find((d) => !hours[d.key].closed && hours[d.key].open >= hours[d.key].close)

  const save = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), address, phone, hours: JSON.stringify(hours), status: active ? 'ACTIVE' : 'INACTIVE' }
      return branch ? apiPatch('/api/business/branches', { id: branch.id, ...payload }) : apiPost('/api/business/branches', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biz-branches'] })
      toast({ title: 'ذخیره شد' })
      onClose()
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : 'خطا', variant: 'destructive' }),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg p-6 max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle className="font-black">{branch ? 'ویرایش شعبه' : 'شعبه جدید'}</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs font-bold">نام شعبه *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 rounded-none" placeholder="مثلاً شعبه مرکزی" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold">تلفن</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10 rounded-none" dir="ltr" />
            </div>
            <div>
              <Label className="text-xs font-bold">آدرس</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} className="h-10 rounded-none" />
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold">ساعات کاری</Label>
            <div className="mt-1 space-y-1.5">
              {DAYS.map((d) => {
                const h = hours[d.key]
                return (
                  <div key={d.key} className="flex items-center gap-2">
                    <label className="flex items-center gap-2 w-24 text-xs font-bold">
                      <Checkbox checked={!h.closed} onCheckedChange={(v) => setDay(d.key, { closed: !v })} />
                      {d.label}
                    </label>
                    {h.closed ? (
                      <span className="text-xs text-[#525252]">تعطیل</span>
                    ) : (
                      <>
                        <Input type="time" value={h.open} onChange={(e) => setDay(d.key, { open: e.target.value })} className="h-9 rounded-none w-28" dir="ltr" />
                        <span className="text-xs">تا</span>
                        <Input type="time" value={h.close} onChange={(e) => setDay(d.key, { close: e.target.value })} className="h-9 rounded-none w-28" dir="ltr" />
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            {badDay && <p className="text-xs text-[#ef4444] mt-1">ساعت شروع {badDay.label} باید قبل از ساعت پایان باشد.</p>}
          </div>

          <label className="flex items-center gap-2 text-sm font-bold">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(!!v)} /> شعبه فعال (قابل رزرو برای مشتریان)
          </label>

          <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim() || !!badDay}
            className="w-full h-11 rounded-none bg-[#0a0a0a] text-[#fafafa] hover:bg-[#ef4444] font-bold">
            ذخیره
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
