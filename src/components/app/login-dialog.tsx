'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiPost } from './api-client'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { LogIn, ShieldCheck } from 'lucide-react'

interface LoginResponse {
  user: { id: string; name: string; role: string; tenantId: string | null; tenantName?: string }
  redirect: string
}

export function LoginDialog({ scope, children }: { scope: 'business' | 'admin'; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const qc = useQueryClient()

  const submit = async (e?: React.FormEvent, demo?: { email: string; password: string }) => {
    e?.preventDefault()
    const creds = demo || { email, password }
    if (!creds.email || !creds.password) {
      toast({ title: 'ایمیل و رمز عبور را وارد کنید', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const res = await apiPost<LoginResponse>('/api/auth/login', creds)
      toast({ title: `خوش آمدید ${res.user.name}` })
      setOpen(false)
      qc.invalidateQueries() // refresh session-dependent queries (e.g. 'me')
      const target = res.redirect // e.g. '#/panel' | '#/admin'
      if (window.location.hash === target) {
        // already on that route → full reload to refresh session-dependent UI
        window.location.reload()
      } else {
        window.location.hash = target
      }
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'خطا در ورود', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0" dir="rtl">
        <div className="border-b-2 border-[#0a0a0a] bg-[#0a0a0a] text-[#fafafa] px-6 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#ef4444]" />
            <span className="font-black text-lg">
              {scope === 'admin' ? 'ورود مدیران پلتفرم' : 'ورود کسب‌وکارها'}
            </span>
          </div>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="font-bold text-xs">ایمیل</Label>
            <Input id="email" type="email" dir="ltr" className="h-11 text-left" placeholder="you@business.ir"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="font-bold text-xs">رمز عبور</Label>
            <Input id="password" type="password" dir="ltr" className="h-11 text-left" placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" disabled={loading} className="w-full h-11 font-bold bg-[#0a0a0a] text-[#fafafa] hover:bg-[#ef4444] rounded-none border-2 border-[#0a0a0a]">
            <LogIn className="w-4 h-4" />
            {loading ? 'در حال ورود…' : 'ورود'}
          </Button>
          <div className="border-t-2 border-dashed border-[#e5e5e5] pt-3 space-y-2">
            <p className="text-xs font-bold text-[#525252]">حساب‌های نمایشی (کلیک کنید):</p>
            <div className="grid grid-cols-1 gap-2">
              {scope === 'business' ? (
                <>
                  <button type="button" onClick={() => submit(undefined, { email: 'owner@mehr.ir', password: 'demo1234' })}
                    className="vb-btn vb-btn-secondary vb-btn-sm justify-between w-full">
                    <span>مدیر کلینیک سلامت مهر</span>
                    <span className="vb-code text-[10px]">owner@mehr.ir</span>
                  </button>
                  <button type="button" onClick={() => submit(undefined, { email: 'operator@mehr.ir', password: 'demo1234' })}
                    className="vb-btn vb-btn-secondary vb-btn-sm justify-between w-full">
                    <span>اپراتور صف کلینیک</span>
                    <span className="vb-code text-[10px]">operator@mehr.ir</span>
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => submit(undefined, { email: 'admin@nobaas.ir', password: 'admin1234' })}
                  className="vb-btn vb-btn-secondary vb-btn-sm justify-between w-full">
                  <span>مدیر کل پلتفرم</span>
                  <span className="vb-code text-[10px]">admin@nobaas.ir</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
