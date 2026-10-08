'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '../api-client'
import { faDigits, faNumber, tomanFa } from '@/lib/jalali'
import { SectionSkeleton } from './panel-shell'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Pencil, Briefcase, UsersRound, Phone, MapPin } from 'lucide-react'

interface BranchOpt { id: string; name: string }

// ─────────────────────────── Services ───────────────────────────

interface ServiceRow {
  id: string; name: string; description: string | null; duration: number
  price: number; capacity: number; status: string
  branch?: { id: string; name: string } | null
  _count: { appointments: number }
}

export function ServicesSection() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [editing, setEditing] = useState<ServiceRow | null>(null)
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery<{ services: ServiceRow[] }>({
    queryKey: ['biz-services'],
    queryFn: () => apiGet('/api/business/services'),
  })

  if (isLoading) return <SectionSkeleton />
  const services = data?.services || []

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="vb-overline mb-2">کاتالوگ خدمات</p>
          <h1 className="vb-display text-3xl">خدمات</h1>
        </div>
        <button onClick={() => setCreating(true)} className="vb-btn vb-btn-primary">
          <Plus className="w-4 h-4" /> خدمت جدید
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((s) => (
          <div key={s.id} className={`p-5 ${s.status === 'ACTIVE' ? 'vb-card' : 'vb-card opacity-60'}`}>
            <div className="flex items-start justify-between mb-3">
              <span className="w-10 h-10 bg-[#0a0a0a] text-[#fafafa] flex items-center justify-center">
                <Briefcase className="w-5 h-5" />
              </span>
              <div className="flex items-center gap-1.5">
                <span className="vb-chip vb-chip-muted">{faDigits(s.duration)} دقیقه</span>
                <button onClick={() => setEditing(s)} title="ویرایش"
                  className="w-7 h-7 border-2 border-[#e5e5e5] flex items-center justify-center hover:border-[#0a0a0a] transition-colors">
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            </div>
            <p className="font-black mb-1">{s.name}</p>
            <p className="text-xs text-[#525252] leading-5 min-h-[32px]">{s.description || '—'}</p>
            <div className="mt-3 pt-3 border-t-2 border-[#e5e5e5] flex items-center justify-between text-xs">
              <span className="font-black text-[#ef4444]">{tomanFa(s.price)}</span>
              <span className="text-[#525252]">ظرفیت: {faDigits(s.capacity)} • {faDigits(s._count.appointments)} نوبت</span>
            </div>
            {s.branch && <p className="text-[10px] text-[#525252] mt-2">{s.branch.name}</p>}
          </div>
        ))}
        {services.length === 0 && (
          <p className="col-span-full text-center text-sm font-bold text-[#525252] py-10">هنوز خدمتی تعریف نکرده‌اید.</p>
        )}
      </div>

      <ServiceDialog
        open={creating || !!editing}
        service={editing}
        onClose={() => { setCreating(false); setEditing(null) }}
      />
    </div>
  )
}

function ServiceDialog({ open, service, onClose }: { open: boolean; service: ServiceRow | null; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState('30')
  const [price, setPrice] = useState('0')
  const [capacity, setCapacity] = useState('1')
  const [branchId, setBranchId] = useState<string>('none')

  const { data: branchesData } = useQuery<{ branches: BranchOpt[] }>({
    queryKey: ['biz-branches'],
    queryFn: () => apiGet('/api/business/branches'),
  })

  // seed fields when opening for edit
  const [seededFor, setSeededFor] = useState<string | null>(null)
  if (open && service && seededFor !== service.id) {
    setName(service.name)
    setDescription(service.description || '')
    setDuration(String(service.duration))
    setPrice(String(service.price))
    setCapacity(String(service.capacity))
    setBranchId(service.branch?.id || 'none')
    setSeededFor(service.id)
  }
  if (open && !service && seededFor !== 'new') {
    setName(''); setDescription(''); setDuration('30'); setPrice('0'); setCapacity('1'); setBranchId('none')
    setSeededFor('new')
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name, description, duration: Number(duration), price: Number(price),
        capacity: Number(capacity), branchId: branchId === 'none' ? null : branchId,
      }
      return service ? apiPatch('/api/business/services', { id: service.id, ...payload }) : apiPost('/api/business/services', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biz-services'] })
      toast({ title: 'ذخیره شد' })
      onClose()
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : 'خطا', variant: 'destructive' }),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md p-6" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-black">{service ? 'ویرایش خدمت' : 'خدمت جدید'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs font-bold">نام خدمت *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 rounded-none" placeholder="مثلاً ویزیت عمومی" />
          </div>
          <div>
            <Label className="text-xs font-bold">توضیحات</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-10 rounded-none" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs font-bold">مدت (دقیقه)</Label>
              <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} className="h-10 rounded-none" dir="ltr" />
            </div>
            <div>
              <Label className="text-xs font-bold">قیمت (تومان)</Label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="h-10 rounded-none" dir="ltr" />
            </div>
            <div>
              <Label className="text-xs font-bold">ظرفیت هر اسلات</Label>
              <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="h-10 rounded-none" dir="ltr" />
            </div>
          </div>
          <div>
            <Label className="text-xs font-bold">شعبه</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="h-10 rounded-none"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">همه شعبه‌ها</SelectItem>
                {(branchesData?.branches || []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}
            className="w-full h-11 rounded-none bg-[#0a0a0a] text-[#fafafa] hover:bg-[#ef4444] font-bold">
            ذخیره
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────── Staff ───────────────────────────

interface StaffRow {
  id: string; name: string; title: string | null; serviceIds: string; status: string
  branch?: { id: string; name: string } | null
}

export function StaffSection() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [editing, setEditing] = useState<StaffRow | null>(null)
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery<{ staff: StaffRow[] }>({
    queryKey: ['biz-staff'],
    queryFn: () => apiGet('/api/business/staff'),
  })
  const { data: servicesData } = useQuery<{ services: { id: string; name: string }[] }>({
    queryKey: ['biz-services'],
    queryFn: () => apiGet('/api/business/services'),
  })
  const services = servicesData?.services || []

  if (isLoading) return <SectionSkeleton />
  const staff = data?.staff || []

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="vb-overline mb-2">ارائه‌دهندگان خدمت</p>
          <h1 className="vb-display text-3xl">کارکنان</h1>
        </div>
        <button onClick={() => setCreating(true)} className="vb-btn vb-btn-primary">
          <Plus className="w-4 h-4" /> کارمند جدید
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {staff.map((s) => {
          let ids: string[] = []
          try { ids = JSON.parse(s.serviceIds || '[]') } catch { /* noop */ }
          const myServices = services.filter((x) => ids.includes(x.id))
          return (
            <div key={s.id} className="vb-card p-5">
              <div className="flex items-start justify-between mb-3">
                <span className="w-12 h-12 bg-[#f5f5f5] border-2 border-[#0a0a0a] font-black text-lg flex items-center justify-center">
                  {s.name.replace('دکتر ', '').slice(0, 1)}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className={s.status === 'ACTIVE' ? 'vb-chip vb-chip-success' : 'vb-chip vb-chip-muted'}>
                    {s.status === 'ACTIVE' ? 'فعال' : 'غیرفعال'}
                  </span>
                  <button onClick={() => setEditing(s)} title="ویرایش"
                    className="w-7 h-7 border-2 border-[#e5e5e5] flex items-center justify-center hover:border-[#0a0a0a] transition-colors">
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <p className="font-black">{s.name}</p>
              <p className="text-xs text-[#525252] mt-0.5 mb-3">{s.title || 'کارمند'}</p>
              {s.branch && <p className="text-[11px] text-[#525252] mb-2 flex items-center gap-1"><MapPin className="w-3 h-3" />{s.branch.name}</p>}
              <div className="flex flex-wrap gap-1">
                {myServices.map((x) => (
                  <span key={x.id} className="vb-chip vb-chip-muted !text-[10px]">{x.name}</span>
                ))}
                {myServices.length === 0 && <span className="text-[11px] text-[#a3a3a3]">بدون خدمت منتخب</span>}
              </div>
            </div>
          )
        })}
        {staff.length === 0 && (
          <p className="col-span-full text-center text-sm font-bold text-[#525252] py-10">کارمندی ثبت نشده است.</p>
        )}
      </div>

      <StaffDialog
        open={creating || !!editing}
        staff={editing}
        services={services}
        onClose={() => { setCreating(false); setEditing(null) }}
      />
    </div>
  )
}

function StaffDialog({ open, staff, services, onClose }: { open: boolean; staff: StaffRow | null; services: { id: string; name: string }[]; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [branchId, setBranchId] = useState('none')
  const [selected, setSelected] = useState<string[]>([])

  const { data: branchesData } = useQuery<{ branches: BranchOpt[] }>({
    queryKey: ['biz-branches'],
    queryFn: () => apiGet('/api/business/branches'),
  })

  const [seededFor, setSeededFor] = useState<string | null>(null)
  if (open && staff && seededFor !== staff.id) {
    setName(staff.name)
    setTitle(staff.title || '')
    setBranchId(staff.branch?.id || 'none')
    try { setSelected(JSON.parse(staff.serviceIds || '[]')) } catch { setSelected([]) }
    setSeededFor(staff.id)
  }
  if (open && !staff && seededFor !== 'new') {
    setName(''); setTitle(''); setBranchId('none'); setSelected([])
    setSeededFor('new')
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name, title, branchId: branchId === 'none' ? null : branchId, serviceIds: selected,
      }
      return staff ? apiPatch('/api/business/staff', { id: staff.id, ...payload }) : apiPost('/api/business/staff', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biz-staff'] })
      toast({ title: 'ذخیره شد' })
      onClose()
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : 'خطا', variant: 'destructive' }),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md p-6" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-black">{staff ? 'ویرایش کارمند' : 'کارمند جدید'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs font-bold">نام *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 rounded-none" placeholder="مثلاً دکتر سارا محمدی" />
          </div>
          <div>
            <Label className="text-xs font-bold">عنوان شغلی</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-10 rounded-none" placeholder="مثلاً متخصص داخلی" />
          </div>
          <div>
            <Label className="text-xs font-bold">شعبه</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="h-10 rounded-none"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">همه شعبه‌ها</SelectItem>
                {(branchesData?.branches || []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-bold mb-2 block">خدمات قابل ارائه</Label>
            <div className="space-y-2 max-h-36 overflow-y-auto nice-scroll border-2 border-[#e5e5e5] p-3">
              {services.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={selected.includes(s.id)}
                    onCheckedChange={(v) => setSelected((prev) => v ? [...prev, s.id] : prev.filter((x) => x !== s.id))}
                    className="rounded-none border-2 border-[#0a0a0a] data-[state=checked]:bg-[#0a0a0a]"
                  />
                  {s.name}
                </label>
              ))}
              {services.length === 0 && <p className="text-xs text-[#525252]">ابتدا خدمتی تعریف کنید.</p>}
            </div>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}
            className="w-full h-11 rounded-none bg-[#0a0a0a] text-[#fafafa] hover:bg-[#ef4444] font-bold">
            ذخیره
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
