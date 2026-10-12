import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { resolveSmsProvider, type SmsProviderId } from '@/lib/sms'

/**
 * Platform SMS provider configuration (read-only status).
 * Reports which providers are configured platform-wide via environment
 * variables / platform secrets, and which one is used as the fallback when a
 * tenant has no smsConfig of its own.
 *
 * Secrets are never returned — only a masked prefix.
 */

interface PlatformSmsConfigResponse {
  providers: { id: SmsProviderId; label: string; requires: string[] }[]
  activeProvider: SmsProviderId
  configured: {
    smsIr: { configured: boolean; maskedKey?: string; lineNumber?: string }
    httpsms: { configured: boolean; maskedKey?: string; from?: string }
  }
}

function mask(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value.length <= 4 ? '••••' : `${value.slice(0, 4)}••••`
}

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })

  const smsIrKey = process.env.SMSIR_API_KEY
  const smsIrLine = process.env.SMSIR_LINE_NUMBER
  const httpsmsKey = process.env.HTTPSMS_API_KEY
  const httpsmsFrom = process.env.HTTPSMS_FROM_NUMBER

  const active = resolveSmsProvider({ smsConfig: null, smsProvider: null })

  return NextResponse.json<PlatformSmsConfigResponse>({
    providers: [
      { id: 'sms.ir', label: 'sms.ir (ایران‌پیامک)', requires: ['API Key', 'شماره خط'] },
      { id: 'httpsms', label: 'httpsms.com', requires: ['API Key', 'شماره ارسالگر'] },
    ],
    activeProvider: active.provider,
    configured: {
      smsIr: {
        configured: Boolean(smsIrKey && smsIrLine),
        maskedKey: mask(smsIrKey),
        lineNumber: smsIrLine || undefined,
      },
      httpsms: {
        configured: Boolean(httpsmsKey && httpsmsFrom),
        maskedKey: mask(httpsmsKey),
        from: httpsmsFrom || undefined,
      },
    },
  })
}
