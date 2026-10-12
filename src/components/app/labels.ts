'use client'

// ───────────────── Persian labels for all system enums ─────────────────

export const APPOINTMENT_STATUS_FA: Record<string, string> = {
  PENDING: 'در انتظار تأیید',
  CONFIRMED: 'تأیید شده',
  WAITING: 'در صف انتظار',
  CALLED: 'فراخوانده شده',
  IN_SERVICE: 'در حال سرویس',
  COMPLETED: 'تکمیل شده',
  CANCELLED: 'لغو شده',
  NO_SHOW: 'عدم حضور',
  SKIPPED: 'رد شده',
}

export const QUEUE_STATUS_FA: Record<string, string> = {
  OPEN: 'فعال',
  PAUSED: 'متوقف',
  CLOSED: 'بسته',
}

export const PRIORITY_FA: Record<string, string> = {
  NORMAL: 'عادی',
  PRIORITY: 'ویژه',
  VIP: 'VIP',
  EMERGENCY: 'فوری',
}

export const NOTIFICATION_TYPE_FA: Record<string, string> = {
  BOOKING_CREATED: 'ثبت نوبت',
  QUEUE_CHANGED: 'تغییر صف',
  RESCHEDULED: 'تغییر زمان',
  CANCELLED: 'لغو نوبت',
  YOUR_TURN: 'نوبت نزدیک است',
  CALLED: 'فراخوانی',
  NO_SHOW: 'عدم حضور',
  PLATFORM_BROADCAST: 'پیامک پلتفرم',
}

export const AUDIT_ACTION_FA: Record<string, string> = {
  AUTH_LOGIN: 'ورود به سیستم',
  SERVICE_CREATE: 'ایجاد خدمت',
  SERVICE_UPDATE: 'ویرایش خدمت',
  STAFF_CREATE: 'افزودن کارمند',
  SETTINGS_UPDATE: 'تغییر تنظیمات',
  APPOINTMENT_RESCHEDULE: 'جابجایی نوبت',
  APPOINTMENT_WALK_IN: 'ثبت نوبت حضوری',
  QUEUE_CALL_NEXT: 'فراخوانی نفر بعد',
  QUEUE_CALL: 'فراخوانی نوبت',
  QUEUE_RECALL: 'فراخوانی مجدد',
  QUEUE_START_SERVICE: 'شروع سرویس',
  QUEUE_COMPLETE: 'تکمیل سرویس',
  QUEUE_SKIP: 'رد کردن نوبت',
  QUEUE_CANCEL: 'لغو نوبت در صف',
  QUEUE_NO_SHOW: 'ثبت عدم حضور',
  QUEUE_MOVE: 'تغییر ترتیب صف',
  QUEUE_PRIORITY: 'تغییر اولویت',
  QUEUE_PAUSE: 'توقف صف',
  QUEUE_RESUME: 'ادامه صف',
  TENANT_CREATE: 'ایجاد مستأجر',
  TENANT_SUSPEND: 'تعلیق مستأجر',
  TENANT_ACTIVATE: 'فعال‌سازی مستأجر',
  TENANT_IMPERSONATE: 'ورود به پنل مستأجر',
  TENANT_UPDATE: 'ویرایش مستأجر',
  TENANT_DELETE: 'حذف مستأجر',
  TENANT_UNDELETE: 'بازسازی مستأجر',
  PLAN_CREATE: 'ایجاد پلن',
  PLAN_DELETE: 'حذف پلن',
  PLAN_CHANGE: 'تغییر پلن',
  PLAN_UPDATE: 'ویرایش پلن',
  TICKET_CREATE: 'ایجاد تیکت',
  TICKET_UPDATE: 'بروزرسانی تیکت',
  PLATFORM_SMS_SEND: 'ارسال پیامک پلتفرم',
  PLATFORM_NOTIFICATION_ACK: 'خوانده شد',
  PLATFORM_NOTIFICATION_CLEAR: 'پاک کردن وضعیت خوانده',
  USER_APPROVE: 'تأیید ثبت‌نام',
  USER_REJECT: 'رد ثبت‌نام',
  USER_REACTIVATE: 'فعال‌سازی مجدد کاربر',
  BRANCH_CREATE: 'ایجاد شعبه',
  BRANCH_UPDATE: 'ویرایش شعبه',
  BRANCH_DELETE: 'حذف شعبه',
  NOTIFICATION_ACK: 'خواندن پیامک',
}

export const TICKET_STATUS_FA: Record<string, string> = {
  OPEN: 'باز',
  IN_PROGRESS: 'در حال بررسی',
  WAITING_FOR_CUSTOMER: 'در انتظار پاسخ',
  RESOLVED: 'حل شده',
  CLOSED: 'بسته',
}

export const TICKET_PRIORITY_FA: Record<string, string> = {
  LOW: 'کم',
  NORMAL: 'معمولی',
  HIGH: 'بالا',
  URGENT: 'فوری',
}

export const SOURCE_FA: Record<string, string> = {
  ONLINE: 'آنلاین',
  WALK_IN: 'حضوری',
  PHONE: 'تلفنی',
}

export function statusChipClass(status: string): string {
  switch (status) {
    case 'COMPLETED': return 'vb-chip vb-chip-success'
    case 'CONFIRMED': return 'vb-chip vb-chip-black'
    case 'PENDING': return 'vb-chip vb-chip-warning'
    case 'WAITING': return 'vb-chip vb-chip-warning'
    case 'CALLED': return 'vb-chip vb-chip-black'
    case 'IN_SERVICE': return 'vb-chip vb-chip-black'
    case 'CANCELLED': return 'vb-chip vb-chip-error'
    case 'NO_SHOW': return 'vb-chip vb-chip-error'
    case 'SKIPPED': return 'vb-chip vb-chip-muted'
    case 'SENT': return 'vb-chip vb-chip-success'
    case 'PENDING_SENT': return 'vb-chip vb-chip-warning'
    case 'FAILED': return 'vb-chip vb-chip-error'
    case 'OPEN': return 'vb-chip vb-chip-success'
    case 'PAUSED': return 'vb-chip vb-chip-warning'
    case 'CLOSED': return 'vb-chip vb-chip-error'
    case 'ACTIVE': return 'vb-chip vb-chip-success'
    case 'SUSPENDED': return 'vb-chip vb-chip-error'
    case 'IN_PROGRESS': return 'vb-chip vb-chip-warning'
    case 'WAITING_FOR_CUSTOMER': return 'vb-chip vb-chip-muted'
    case 'RESOLVED': return 'vb-chip vb-chip-success'
    default: return 'vb-chip vb-chip-muted'
  }
}
