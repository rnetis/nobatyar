'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiPost } from '../api-client'
import { dateKey } from '@/lib/jalali'
import { useToast } from '@/hooks/use-toast'
import { UserPlus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Option { id: string; name: string }

/** Register a walk-in customer directly into today's queue (PRD US-101). */
export function WalkInDialog({ compact = true }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [branchId, setBranchId] = useState<string | null>(null)
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [priority, setPriority] = useState('NORMAL')
  const { toast } = useToast()
  const qc = useQueryClient()

  const { data: refs } = useQuery<{ branches: Option[]; services: Option[] }>({
    queryKey: ['walkin-refs'],
    queryFn: async () => {
      const [b, s] = await Promise.all([
        apiGet<{ branches: Option[] }>('/api/business/branches'),
        apiGet<{ services: Option[] }>('/api/business/services'),
      ])
      return { branches: b.branches, services: s.services.filter((x) => 'status' in x ? true : true) }
    },
    enabled: open,
  })
  const services = (refs?.services || []) as unknown as (Option & { status?: string })[]
  const activeServices = services.filter((s) => s.status !== 'INACTIVE')

  const create = useMutation({
    mutationFn: () =>
      apiPost('/api/business/walk-in', { name, mobile, branchId, serviceId, priority }),
    onSuccess: () => {
      toast({ title: 'نوبت حضوری ثبت و به صف اضافه شد' })
      setOpen(false)
      setName(''); setMobile(''); setPriority('NORMAL')
      qc.invalidateQueries({ queryKey: ['biz-queue'] })
      qc.invalidateQueries({ queryKey: ['biz-overview'] })
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : 'خطا', variant: 'destructive' }),
  })

  const submit = () => {
    if (!name.trim() || !/^09\d{9}$/.test(mobile) || !branchId || !serviceId) {
      toast({ title: 'اطلاعات را کامل و معتبر وارد کنید', variant: 'destructive' })
      return
    }
    create.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {compact ? (
          <button className="vb-btn vb-btn-secondary vb-btn-sm">
            <UserPlus className="w-4 h-4" /> نوبت حضوری
          </button>
        ) : (
          <button className="vb-btn vb-btn-primary"><UserPlus className="w-4 h-4" /> ثبت نوبت حضوری</button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md p-6" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-black">ثبت نوبت حضوری در صف امروز</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs font-bold">نام مشتری</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="نام و نام خانوادگی" className="h-10 rounded-none" />
          </div>
          <div>
            <Label className="text-xs font-bold">موبایل</Label>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="09123456789" dir="ltr" className="h-10 rounded-none text-left vb-code" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold">شعبه</Label>
              <Select value={branchId || ''} onValueChange={(v) => setBranchId(v)}>
                <SelectTrigger className="h-10 rounded-none"><SelectValue placeholder="انتخاب" /></SelectTrigger>
                <SelectContent>
                  {(refs?.branches || []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-bold">خدمت</Label>
              <Select value={serviceId || ''} onValueChange={(v) => setServiceId(v)}>
                <SelectTrigger className="h-10 rounded-none"><SelectValue placeholder="انتخاب" /></SelectTrigger>
                <SelectContent>
                  {activeServices.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs font-bold">اولویت</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v)}>
              <SelectTrigger className="h-10 rounded-none"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NORMAL">عادی</SelectItem>
                <SelectItem value="PRIORITY">ویژه</SelectItem>
                <SelectItem value="VIP">VIP</SelectItem>
                <SelectItem value="EMERGENCY">فوری</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={submit} disabled={create.isPending} className="w-full h-11 rounded-none bg-[#0a0a0a] text-[#fafafa] hover:bg-[#ef4444] font-bold">
            افزودن به صف
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
