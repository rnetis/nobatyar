import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'

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

// Keep in sync with src/lib/password.ts (seed runs standalone under node, without the "@/" alias).
function hashPassword(password: string): string {
  const N = 16384, R = 8, P = 1
  const salt = randomBytes(16)
  const dk = scryptSync(password, salt, 64, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${dk.toString('base64')}`
}

async function upsertPlan(data: Parameters<typeof db.plan.create>[0]['data'] & { slug: string }) {
  await db.plan.upsert({ where: { slug: data.slug }, update: {}, create: data })
}

async function main() {
  const reset = process.argv.includes('--reset')
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@nobaas.ir').trim().toLowerCase()
  const adminPassword = process.env.ADMIN_PASSWORD || ''

  if (reset) {
  console.log('→ --reset: clearing ALL existing data')
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
  }

  // ───────────────────────────── Plans ─────────────────────────────
  console.log('→ plans')
  await upsertPlan({
      name: 'رایگان', slug: 'free', tagline: 'برای شروع کسب‌وکارهای کوچک',
      priceMonthly: 0, maxBranches: 1, maxStaff: 1, maxBookings: 100, smsQuota: 50,
      features: JSON.stringify([]), sortOrder: 1,
    })
  await upsertPlan({
      name: 'استارتر', slug: 'starter', tagline: 'برای مراکز در حال رشد',
      priceMonthly: 490000, maxBranches: 3, maxStaff: 10, maxBookings: 2000, smsQuota: 500,
      features: JSON.stringify(['sms', 'reports']), isPopular: false, sortOrder: 2,
    })
  await upsertPlan({
      name: 'کسب‌وکار', slug: 'business', tagline: 'پرطرفدارترین پلن',
      priceMonthly: 1290000, maxBranches: 10, maxStaff: 30, maxBookings: 20000, smsQuota: 5000,
      features: JSON.stringify(['multi_branch', 'sms', 'api', 'reports', 'priority_queue', 'custom_branding']),
      isPopular: true, sortOrder: 3,
    })
  await upsertPlan({
      name: 'سازمانی', slug: 'enterprise', tagline: 'SLA اختصاصی و یکپارچه‌سازی',
      priceMonthly: 0, maxBranches: 999, maxStaff: 999, maxBookings: 9999999, smsQuota: 999999,
      features: JSON.stringify(['multi_branch', 'sms', 'api', 'reports', 'priority_queue', 'custom_branding', 'webhooks', 'advanced_analytics']),
      sortOrder: 4,
    })

  // ───────────────────────────── Super Admin ─────────────────────────────
  console.log('→ super admin')
  if (!adminPassword || adminPassword.length < 10) {
    throw new Error('ADMIN_PASSWORD must be set in .env and be at least 10 characters')
  }
  const existingAdmin = await db.user.findUnique({ where: { email: adminEmail } })
  if (existingAdmin) {
    // idempotent: re-running the seed rotates the admin password without touching tenant data
    await db.user.update({
      where: { id: existingAdmin.id },
      data: { passwordHash: hashPassword(adminPassword), role: 'SUPER_ADMIN', status: 'ACTIVE' },
    })
  } else {
    await db.user.create({
      data: { tenantId: null, name: 'مدیر پلتفرم', email: adminEmail, passwordHash: hashPassword(adminPassword), role: 'SUPER_ADMIN' },
    })
  }

  console.log('✓ production seed complete')
  console.log(`  super admin: ${adminEmail} (password from ADMIN_PASSWORD env)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
