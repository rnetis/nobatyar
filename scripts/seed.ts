import { PrismaClient } from '@prisma/client'
import { createHmac } from 'crypto'

/**
 * Production seed.
 * Creates ONLY:
 *  - the 4 subscription plans (product catalogue, not demo data)
 *  - the platform SUPER_ADMIN account (credentials come from ADMIN_EMAIL / ADMIN_PASSWORD)
 *
 * No tenants, customers, appointments, queues, notifications, tickets or audit
 * logs are created — those belong to real businesses signing up on the platform.
 *
 * All demo accounts (owner@mehr.ir / operator@mehr.ir / owner@aramis.ir /
 * owner@pars.ir) and demo demo data were removed for production.
 */

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = createHmac('sha256', 'nobaas:pwd-salt').update('static-v1').digest('hex').slice(0, 32)
  return createHmac('sha256', salt).update(`nobaas:${password}`).digest('hex')
}

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@nobaas.ir').trim().toLowerCase()
  const adminPassword = process.env.ADMIN_PASSWORD || ''

  console.log('→ clearing existing data (production reset)')
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

  // ───────────────────────────── Plans ─────────────────────────────
  console.log('→ plans')
  await db.plan.create({
    data: {
      name: 'رایگان', slug: 'free', tagline: 'برای شروع کسب‌وکارهای کوچک',
      priceMonthly: 0, maxBranches: 1, maxStaff: 1, maxBookings: 100, smsQuota: 50,
      features: JSON.stringify([]), sortOrder: 1,
    },
  })
  await db.plan.create({
    data: {
      name: 'استارتر', slug: 'starter', tagline: 'برای مراکز در حال رشد',
      priceMonthly: 490000, maxBranches: 3, maxStaff: 10, maxBookings: 2000, smsQuota: 500,
      features: JSON.stringify(['sms', 'reports']), isPopular: false, sortOrder: 2,
    },
  })
  await db.plan.create({
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

  // ───────────────────────────── Super Admin ─────────────────────────────
  console.log('→ super admin')
  if (!adminPassword || adminPassword.length < 10) {
    throw new Error('ADMIN_PASSWORD must be set in .env and be at least 10 characters')
  }
  await db.user.create({
    data: {
      tenantId: null,
      name: 'مدیر پلتفرم',
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      role: 'SUPER_ADMIN',
    },
  })

  console.log('✓ production seed complete')
  console.log(`  super admin: ${adminEmail} (password from ADMIN_PASSWORD env)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
