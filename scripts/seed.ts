import { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'

const db = new PrismaClient()

function hash(password: string): string {
  return createHash('sha256').update(`nobaas:${password}`).digest('hex')
}

function token(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

function at(day: Date, h: number, m = 0): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0)
}

function dateKeyStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
function hoursFor(fridayClosed = true): string {
  const out: Record<string, { open: string; close: string; closed: boolean }> = {}
  for (const d of WEEK) out[d] = { open: '09:00', close: '19:00', closed: d === 'fri' && fridayClosed }
  return JSON.stringify(out)
}

async function main() {
  console.log('→ clearing old data')
  await db.auditLog.deleteMany()
  await db.notification.deleteMany()
  await db.ticket.deleteMany()
  await db.queueEntry.deleteMany()
  await db.queue.deleteMany()
  await db.appointment.deleteMany()
  await db.customer.deleteMany()
  await db.staff.deleteMany()
  await db.service.deleteMany()
  await db.branch.deleteMany()
  await db.user.deleteMany()
  await db.tenant.deleteMany()
  await db.plan.deleteMany()

  // ───────────────────────────── Plans (PRD §27) ─────────────────────────────
  console.log('→ plans')
  const planFree = await db.plan.create({
    data: {
      name: 'رایگان', slug: 'free', tagline: 'برای شروع کسب‌وکارهای کوچک',
      priceMonthly: 0, maxBranches: 1, maxStaff: 1, maxBookings: 100, smsQuota: 50,
      features: JSON.stringify([]), sortOrder: 1,
    },
  })
  const planStarter = await db.plan.create({
    data: {
      name: 'استارتر', slug: 'starter', tagline: 'برای مراکز در حال رشد',
      priceMonthly: 490000, maxBranches: 3, maxStaff: 10, maxBookings: 2000, smsQuota: 500,
      features: JSON.stringify(['sms', 'reports']), isPopular: false, sortOrder: 2,
    },
  })
  const planBusiness = await db.plan.create({
    data: {
      name: 'کسب‌وکار', slug: 'business', tagline: 'پرطرفدارترین پلن',
      priceMonthly: 1290000, maxBranches: 10, maxStaff: 30, maxBookings: 20000, smsQuota: 5000,
      features: JSON.stringify(['multi_branch', 'sms', 'api', 'reports', 'priority_queue', 'custom_branding']),
      isPopular: true, sortOrder: 3,
    },
  })
  await db.plan.create({
    data: {
      name: 'سازمانی', slug: 'enterprise', tagline: 'SLA اختصاصی و یکپارچه‌سازی',
      priceMonthly: 0, maxBranches: 999, maxStaff: 999, maxBookings: 9999999, smsQuota: 999999,
      features: JSON.stringify(['multi_branch', 'sms', 'api', 'reports', 'priority_queue', 'custom_branding', 'webhooks', 'advanced_analytics']),
      sortOrder: 4,
    },
  })

  // ───────────────────────────── Tenant 1: کلینیک ─────────────────────────────
  console.log('→ tenant 1: mehr-clinic')
  const clinic = await db.tenant.create({
    data: {
      name: 'مرکز پزشکی سلامت مهر', slug: 'mehr-clinic', category: 'کلینیک پزشکی',
      logoText: 'م', phone: '۰۲۱-۹۱۰۰۵۵۴۴', address: 'تهران، سعادت‌آباد، بلوار دریا، پلاک ۴۸',
      planId: planBusiness.id, queuePrefix: 'A',
      notifPolicy: JSON.stringify({ smsOnBooking: true, smsOnQueueChange: true, smsOnReschedule: true, smsOnCancel: true, smsBeforeTurn: true, smsOnCalled: true, smsOnNoShow: true, minorThreshold: 3 }),
      cancelPolicy: JSON.stringify({ allowCustomerCancel: true, minMinutesBefore: 120, sendCancelSms: true }),
    },
  })

  const b1 = await db.branch.create({
    data: {
      tenantId: clinic.id, name: 'شعبه مرکزی (سعادت‌آباد)',
      address: 'تهران، سعادت‌آباد، بلوار دریا، پلاک ۴۸', phone: '۰۲۱-۹۱۰۰۵۵۴۴',
      hours: hoursFor(),
    },
  })
  const b2 = await db.branch.create({
    data: {
      tenantId: clinic.id, name: 'شعبه غرب (پونک)',
      address: 'تهران، پونک، خیابان سیمون بولیوار، برج آرین', phone: '۰۲۱-۹۱۰۰۵۵۵۵',
      hours: hoursFor(),
    },
  })

  const sVisit = await db.service.create({
    data: { tenantId: clinic.id, branchId: b1.id, name: 'ویزیت عمومی', description: 'ویزیت پزشک عمومی با تعیین وقت قبلی', duration: 15, price: 350000, capacity: 2 },
  })
  const sSpec = await db.service.create({
    data: { tenantId: clinic.id, branchId: b1.id, name: 'ویزیت متخصص داخلی', description: 'ویزیت تخصصی دستگاه گوارش و داخلی', duration: 30, price: 800000, capacity: 1 },
  })
  const sVax = await db.service.create({
    data: { tenantId: clinic.id, branchId: b1.id, name: 'واکسیناسیون', description: 'تزریق واکسن آنفلوانزا و سایر واکسن‌ها', duration: 10, price: 450000, capacity: 3 },
  })
  const sLab = await db.service.create({
    data: { tenantId: clinic.id, branchId: b2.id, name: 'آزمایش خون', description: 'نمونه‌گیری و آزمایش کامل خون', duration: 10, price: 250000, capacity: 4 },
  })

  const stDoctor = await db.staff.create({
    data: { tenantId: clinic.id, branchId: b1.id, name: 'دکتر سارا محمدی', title: 'متخصص داخلی', serviceIds: JSON.stringify([sVisit.id, sSpec.id]) },
  })
  const stGp = await db.staff.create({
    data: { tenantId: clinic.id, branchId: b1.id, name: 'دکتر امیر رضایی', title: 'پزشک عمومی', serviceIds: JSON.stringify([sVisit.id, sVax.id]) },
  })
  await db.staff.create({
    data: { tenantId: clinic.id, branchId: b2.id, name: 'مریم احمدی', title: 'کارشناس آزمایشگاه', serviceIds: JSON.stringify([sLab.id]) },
  })

  await db.user.createMany({
    data: [
      { tenantId: null, name: 'مدیر سیستم', email: 'admin@nobaas.ir', passwordHash: hash('admin1234'), role: 'SUPER_ADMIN' },
      { tenantId: clinic.id, name: 'دکتر رضا کریمی', email: 'owner@mehr.ir', passwordHash: hash('demo1234'), role: 'TENANT_OWNER' },
      { tenantId: clinic.id, name: 'زهرا نوری', email: 'operator@mehr.ir', passwordHash: hash('demo1234'), role: 'OPERATOR' },
    ],
  })

  // ───────────────────────────── Tenant 2: سالن زیبایی ─────────────────────────────
  console.log('→ tenant 2: aramis-beauty')
  const salon = await db.tenant.create({
    data: {
      name: 'سالن زیبایی آرامیس', slug: 'aramis-beauty', category: 'زیبایی و آرایش',
      logoText: 'آ', phone: '۰۲۱-۲۲۴۴۸۸۷۷', address: 'تهران، اندرزگو، خیابان ساعدی، پلاک ۱۲',
      planId: planStarter.id, queuePrefix: 'B',
      notifPolicy: JSON.stringify({ smsOnBooking: true, smsOnQueueChange: true, smsOnReschedule: true, smsOnCancel: true, smsOnCalled: true }),
      cancelPolicy: JSON.stringify({ allowCustomerCancel: true, minMinutesBefore: 180, sendCancelSms: true }),
    },
  })
  const bSalon = await db.branch.create({
    data: {
      tenantId: salon.id, name: 'شعبه اندرزگو',
      address: 'تهران، اندرزگو، ساعدی، پلاک ۱۲', phone: '۰۲۱-۲۲۴۴۸۸۷۷',
      hours: hoursFor(),
    },
  })
  const sHair = await db.service.create({
    data: { tenantId: salon.id, branchId: bSalon.id, name: 'کوتاهی و حالت‌دهی مو', duration: 45, price: 600000, capacity: 2 },
  })
  const sColor = await db.service.create({
    data: { tenantId: salon.id, branchId: bSalon.id, name: 'رنگ و لایت', duration: 120, price: 2200000, capacity: 1 },
  })
  const sNail = await db.service.create({
    data: { tenantId: salon.id, branchId: bSalon.id, name: 'مانیکور و پدیکور', duration: 60, price: 850000, capacity: 1 },
  })
  await db.staff.createMany({
    data: [
      { tenantId: salon.id, branchId: bSalon.id, name: 'نیلوفر کریمی', title: 'مدیر فنی و متخصص رنگ', serviceIds: JSON.stringify([sHair.id, sColor.id]) },
      { tenantId: salon.id, branchId: bSalon.id, name: 'سپیده موسوی', title: 'متخصص ناخن', serviceIds: JSON.stringify([sNail.id, sHair.id]) },
    ],
  })
  await db.user.create({
    data: { tenantId: salon.id, name: 'آرامیس صالحی', email: 'owner@aramis.ir', passwordHash: hash('demo1234'), role: 'TENANT_OWNER' },
  })

  // ───────────────────────────── Tenant 3: تعمیرگاه ─────────────────────────────
  console.log('→ tenant 3: pars-repair')
  const garage = await db.tenant.create({
    data: {
      name: 'تعمیرگاه تخصصی پارس', slug: 'pars-repair', category: 'خودرو',
      logoText: 'پ', phone: '۰۲۱-۴۴۵۵۶۶۳۳', address: 'تهران، جاده مخصوص کرج، کیلومتر ۸',
      planId: planFree.id, queuePrefix: 'C',
      notifPolicy: JSON.stringify({ smsOnBooking: true, smsOnCalled: true, smsOnCancel: true }),
      cancelPolicy: JSON.stringify({ allowCustomerCancel: false, minMinutesBefore: 60, sendCancelSms: false }),
      reasonRequired: true,
    },
  })
  const bGarage = await db.branch.create({
    data: {
      tenantId: garage.id, name: 'شعبه جاده مخصوص',
      address: 'تهران، جاده مخصوص کرج، کیلومتر ۸', phone: '۰۲۱-۴۴۵۵۶۶۳۳',
      hours: hoursFor(),
    },
  })
  const sService = await db.service.create({
    data: { tenantId: garage.id, branchId: bGarage.id, name: 'سرویس دوره‌ای', description: 'تعویض روغن و فیلترها + چک کامل', duration: 60, price: 1800000, capacity: 3 },
  })
  await db.service.create({
    data: { tenantId: garage.id, branchId: bGarage.id, name: 'عیب‌یابی الکترونیکی (دیاگ)', duration: 30, price: 900000, capacity: 2 },
  })
  await db.staff.create({
    data: { tenantId: garage.id, branchId: bGarage.id, name: 'مهدی توکلی', title: 'تکنسین ارشد', serviceIds: JSON.stringify([sService.id]) },
  })
  await db.user.create({
    data: { tenantId: garage.id, name: 'حسین پارسا', email: 'owner@pars.ir', passwordHash: hash('demo1234'), role: 'TENANT_OWNER' },
  })

  // ───────────────────────────── Customers ─────────────────────────────
  console.log('→ customers & appointments')
  const names = [
    'علی احمدی', 'فاطمه حسینی', 'محمد رضایی', 'زهرا موسوی', 'حسین کریمی',
    'مریم جعفری', 'رضا نادری', 'سارا قاسمی', 'امیر تهرانی', 'نرگس سلطانی',
    'مهدی شریفی', 'لیلا اکبری', 'پویا صادقی', 'شیرین مرادی', 'کاوه دهقان',
    'الهام رحیمی', 'بهرام کاظمی', 'پریسا یوسفی', 'سینا هاشمی', 'مهسا فرهادی',
  ]
  function mkCustomer(i: number, tenantId: string) {
    return {
      tenantId,
      name: names[i % names.length],
      mobile: `0912${String(1000000 + ((i * 7919) % 8999999)).slice(0, 7)}`,
    }
  }

  const today = new Date()
  const todayKey = dateKeyStr(today)

  async function mkAppt(args: {
    tenantId: string; branchId: string; serviceId: string; staffId?: string | null
    customerIdx: number; scheduledAt: Date; status: string; priority?: string
    source?: string; idx: number; code: string
  }) {
    const base = mkCustomer(args.customerIdx, args.tenantId)
    const c = await db.customer.upsert({
      where: { tenantId_mobile: { tenantId: args.tenantId, mobile: base.mobile } },
      update: {},
      create: base,
    })
    const appt = await db.appointment.create({
      data: {
        tenantId: args.tenantId,
        branchId: args.branchId,
        serviceId: args.serviceId,
        staffId: args.staffId || null,
        customerId: c.id,
        code: args.code,
        scheduledAt: args.scheduledAt,
        durationMin: 15,
        status: args.status,
        source: args.source || 'ONLINE',
        priority: args.priority || 'NORMAL',
        liveToken: token(),
      },
    })
    return appt
  }

  // ── Live queue today (tenant 1, service: ویزیت عمومی, branch b1) ──
  const liveSpec: Array<{
    status: string; h: number; m: number; priority?: string; customerIdx: number
  }> = [
    { status: 'COMPLETED', h: 9, m: 0, customerIdx: 0 },
    { status: 'COMPLETED', h: 9, m: 20, customerIdx: 1 },
    { status: 'COMPLETED', h: 9, m: 40, customerIdx: 2 },
    { status: 'IN_SERVICE', h: 10, m: 0, customerIdx: 3 },
    { status: 'WAITING', h: 10, m: 20, customerIdx: 4 },
    { status: 'WAITING', h: 10, m: 40, customerIdx: 5 },
    { status: 'WAITING', h: 11, m: 0, customerIdx: 6, priority: 'VIP' },
    { status: 'WAITING', h: 11, m: 20, customerIdx: 7 },
    { status: 'WAITING', h: 11, m: 40, customerIdx: 8 },
    { status: 'WAITING', h: 12, m: 0, customerIdx: 9 },
    { status: 'SKIPPED', h: 12, m: 20, customerIdx: 10 },
    { status: 'CANCELLED', h: 12, m: 40, customerIdx: 11 },
  ]

  const queue = await db.queue.create({
    data: {
      tenantId: clinic.id, branchId: b1.id, serviceId: sVisit.id, date: todayKey,
      status: 'OPEN', currentServing: 'A-104', avgServiceMin: 14,
    },
  })

  let pos = 1
  for (let i = 0; i < liveSpec.length; i++) {
    const spec = liveSpec[i]
    const code = `A-${101 + i}`
    const appt = await mkAppt({
      tenantId: clinic.id, branchId: b1.id, serviceId: sVisit.id,
      staffId: spec.status === 'IN_SERVICE' ? stDoctor.id : stGp.id,
      customerIdx: spec.customerIdx, code,
      scheduledAt: at(today, spec.h, spec.m),
      status: spec.status, priority: spec.priority,
    })
    await db.queueEntry.create({
      data: {
        queueId: queue.id,
        appointmentId: appt.id,
        position: spec.status === 'WAITING' ? pos++ : i + 1,
        status: spec.status,
        priority: spec.priority || 'NORMAL',
        joinedAt: at(today, Math.max(8, spec.h - 1), 30),
        calledAt: spec.status === 'IN_SERVICE' ? at(today, 10, 0) : spec.status === 'COMPLETED' ? at(today, spec.h, spec.m) : null,
        startedAt: spec.status === 'IN_SERVICE' ? new Date(Date.now() - 8 * 60 * 1000) : null,
        completedAt: spec.status === 'COMPLETED' ? at(today, spec.h, 15) : null,
      },
    })
  }

  // ── History: past 14 days for KPIs (tenant 1) ──
  console.log('→ history')
  for (let d = 1; d <= 14; d++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d, 12)
    if (day.getDay() === 5) continue // جمعه
    const n = 12 + ((d * 7) % 9)
    for (let i = 0; i < n; i++) {
      const r = (d * 31 + i * 17) % 20
      const status = r < 14 ? 'COMPLETED' : r < 16 ? 'NO_SHOW' : r < 18 ? 'CANCELLED' : 'COMPLETED'
      const svc = [sVisit, sSpec, sVax][i % 3]
      await mkAppt({
        tenantId: clinic.id, branchId: b1.id, serviceId: svc.id,
        staffId: svc.id === sSpec.id ? stDoctor.id : stGp.id,
        customerIdx: (d * 5 + i) % names.length,
        code: `A-${200 + d * 20 + i}`,
        scheduledAt: at(day, 9 + (i % 8), (i % 3) * 20),
        status,
        source: i % 4 === 0 ? 'WALK_IN' : 'ONLINE',
        idx: i,
      })
    }
  }
  for (let d = 1; d <= 10; d++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d, 12)
    if (day.getDay() === 5) continue
    for (let i = 0; i < 4; i++) {
      const svcSalon = [sHair, sColor, sNail][i % 3]
      await mkAppt({
        tenantId: salon.id, branchId: bSalon.id, serviceId: svcSalon.id,
        customerIdx: (d * 3 + i) % names.length,
        code: `B-${100 + d * 10 + i}`,
        scheduledAt: at(day, 10 + i * 2, 0),
        status: i === 3 ? 'NO_SHOW' : 'COMPLETED',
        idx: i,
      })
      await mkAppt({
        tenantId: garage.id, branchId: bGarage.id, serviceId: sService.id,
        customerIdx: (d * 2 + i) % names.length,
        code: `C-${100 + d * 10 + i}`,
        scheduledAt: at(day, 9 + i * 2, 0),
        status: i === 2 ? 'CANCELLED' : 'COMPLETED',
        idx: i,
      })
    }
  }

  // ── Future bookings (next days) ──
  console.log('→ future bookings')
  for (let d = 1; d <= 5; d++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + d, 12)
    if (day.getDay() === 5) continue
    for (let i = 0; i < 3; i++) {
      const svc = [sVisit, sSpec, sVax][i % 3]
      await mkAppt({
        tenantId: clinic.id, branchId: b1.id,
        serviceId: svc.id, staffId: svc.id === sSpec.id ? stDoctor.id : stGp.id,
        customerIdx: (d + i * 2) % names.length,
        code: `A-${500 + d * 10 + i}`,
        scheduledAt: at(day, 9 + i * 3, 30),
        status: 'CONFIRMED',
        idx: i,
      })
    }
  }

  // ── Notifications (SMS log) ──
  console.log('→ notifications, tickets, audit')
  const todays = await db.appointment.findMany({
    where: { tenantId: clinic.id, code: { in: liveSpec.map((_, i) => `A-${101 + i}`) } },
    include: { customer: true },
    orderBy: { code: 'asc' },
  })
  for (const ap of todays) {
    await db.notification.create({
      data: {
        tenantId: clinic.id, appointmentId: ap.id, type: 'BOOKING_CREATED',
        recipient: ap.customer.mobile,
        body: `نوبت شما ثبت شد.\nمرکز پزشکی سلامت مهر | ویزیت عمومی\nشماره نوبت: ${ap.code}\nمشاهده صف زنده: https://nobaas.ir/#/q/${ap.liveToken.slice(0, 12)}…`,
        status: 'SENT', sentAt: at(today, 8, 15), providerMessageId: `sim-${token().slice(0, 8)}`,
      },
    })
  }
  const inService = todays.find((a) => a.code === 'A-104')
  if (inService) {
    await db.notification.create({
      data: {
        tenantId: clinic.id, appointmentId: inService.id, type: 'CALLED',
        recipient: inService.customer.mobile,
        body: 'نوبت شما فراخوانده شد. لطفاً برای دریافت خدمت مراجعه کنید.\nشماره نوبت: A-104',
        status: 'SENT', sentAt: at(today, 10, 0), providerMessageId: `sim-${token().slice(0, 8)}`,
      },
    })
  }

  // ── Tickets (PRD §29) ──
  await db.ticket.createMany({
    data: [
      { tenantId: clinic.id, createdBy: 'دکتر رضا کریمی', subject: 'افزایش سهمیه پیامک پلن کسب‌وکار', body: 'سلام، برای کمپین نوبت‌دهی مهر ماه به سهمیه پیامک بیشتری نیاز داریم. لطفاً راهنمایی بفرمایید.', priority: 'HIGH', status: 'IN_PROGRESS', assignee: 'تیم پشتیبانی' },
      { tenantId: salon.id, createdBy: 'آرامیس صالحی', subject: 'خطا در نمایش تقویم جلالی', body: 'در فیلتر تاریخ نوبت‌ها، آخرین روز اسفند درست نمایش داده نمی‌شود.', priority: 'NORMAL', status: 'OPEN' },
      { tenantId: garage.id, createdBy: 'حسین پارسا', subject: 'درخواست فعال‌سازی صف اولویت‌دار', body: 'برای مشتریان VIP تعمیرگاه می‌خواهیم اولویت فعال کنیم.', priority: 'LOW', status: 'WAITING_FOR_CUSTOMER' },
      { tenantId: clinic.id, createdBy: 'زهرا نوری', subject: 'سؤال درباره گزارش No-show', body: 'میانگین No-show هفته گذشته چطور محاسبه می‌شود؟', priority: 'NORMAL', status: 'RESOLVED', assignee: 'سارا – پشتیبانی' },
    ],
  })

  // ── Audit logs ──
  await db.auditLog.createMany({
    data: [
      { tenantId: clinic.id, actor: 'زهرا نوری', role: 'OPERATOR', action: 'QUEUE_CALL_NEXT', entityType: 'QueueEntry', detail: JSON.stringify({ code: 'A-104' }), createdAt: at(today, 10, 0) },
      { tenantId: clinic.id, actor: 'زهرا نوری', role: 'OPERATOR', action: 'QUEUE_START_SERVICE', entityType: 'QueueEntry', detail: JSON.stringify({ code: 'A-104' }), createdAt: at(today, 10, 2) },
      { tenantId: clinic.id, actor: 'دکتر رضا کریمی', role: 'TENANT_OWNER', action: 'QUEUE_PRIORITY', entityType: 'QueueEntry', detail: JSON.stringify({ code: 'A-107', priority: 'VIP' }), createdAt: at(today, 9, 45) },
      { tenantId: null, actor: 'مدیر سیستم', role: 'SUPER_ADMIN', action: 'TENANT_SUSPEND', entityType: 'Tenant', entityId: garage.id, detail: JSON.stringify({ reason: 'عدم پرداخت' }), createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000) },
      { tenantId: null, actor: 'مدیر سیستم', role: 'SUPER_ADMIN', action: 'PLAN_CHANGE', entityType: 'Tenant', entityId: clinic.id, detail: JSON.stringify({ from: 'استارتر', to: 'کسب‌وکار' }), createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000) },
    ],
  })

  console.log('✓ seed complete')
  console.log('  login business: owner@mehr.ir / demo1234')
  console.log('  login admin:    admin@nobaas.ir / admin1234')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
