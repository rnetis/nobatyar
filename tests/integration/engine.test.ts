import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import { setSession } from './auth-stub'
import { POST as book } from '@/app/api/public/bookings/route'
import { PATCH as patchAppt } from '@/app/api/business/appointments/route'
import { POST as publicCancel } from '@/app/api/public/queue/[token]/cancel/route'
import { POST as walkInRoute } from '@/app/api/business/walk-in/route'
import { executeQueueAction, enqueueAppointment, checkInAppointment, createWalkIn, getLiveState, calcEta } from '@/lib/queue-engine'
import { getAvailability } from '@/lib/availability'
import { hashPassword, verifyPassword } from '@/lib/password'
import { normalizeMobile } from '@/lib/phone'
import { renderTemplate } from '@/lib/sms'
import { createHmac } from 'node:crypto'

const ALL_DAYS = Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map((d) => [d, { open: '08:00', close: '20:00', closed: false }]))
const dayKey = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
let ipN = 0
const req = (body: unknown) => new Request('http://x/api', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${++ipN}` }, body: JSON.stringify(body) })
const patchReq = (body: unknown) => new Request('http://x/api', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

let T: { id: string; slug: string }, B: { id: string }, S: { id: string }, T2: { id: string; slug: string }, B2: { id: string }, S2: { id: string }
let mob = 0
const nextMobile = () => `0912${String(1000000 + ++mob)}`
const bookBody = (o: Record<string, unknown> = {}) => ({ tenantSlug: T.slug, branchId: B.id, serviceId: S.id, date: dayKey(1), time: '10:00', name: 'علی', mobile: nextMobile(), ...o })

before(async () => {
  const plan = await db.plan.create({ data: { name: 'p', slug: 'p', maxBookings: 1000, maxBranches: 3, maxStaff: 2, smsQuota: 1000 } })
  const mk = async (slug: string) => {
    const t = await db.tenant.create({ data: { name: slug, slug, queuePrefix: 'A', planId: plan.id } })
    const b = await db.branch.create({ data: { tenantId: t.id, name: 'main', hours: JSON.stringify(ALL_DAYS) } })
    const s = await db.service.create({ data: { tenantId: t.id, name: 'cut', duration: 30, capacity: 1 } })
    return { t, b, s }
  }
  const a = await mk('t1'); T = a.t; B = a.b; S = a.s
  const c = await mk('t2'); T2 = c.t; B2 = c.b; S2 = c.s
  const u = await db.user.create({ data: { tenantId: T.id, name: 'owner', email: 'o@t1.ir', passwordHash: 'x', role: 'TENANT_OWNER' } })
  setSession({ userId: u.id, name: 'owner', role: 'TENANT_OWNER', tenantId: T.id })
})

test('double-booking: 6 concurrent requests for one slot → exactly one wins', async () => {
  const results = await Promise.all(Array.from({ length: 6 }, () => book(req(bookBody({ time: '11:00' })))))
  const codes = results.map((r) => r.status)
  assert.equal(codes.filter((c) => c === 200).length, 1, `statuses: ${codes}`)
  assert.equal(codes.filter((c) => c === 409).length, 5)
  const n = await db.appointment.count({ where: { tenantId: T.id, scheduledAt: new Date(new Date(dayKey(1) + 'T11:00:00')) } })
  assert.equal(n, 1)
})

test('booking codes never collide across tenants sharing a prefix', async () => {
  const codes = new Set<string>()
  for (let i = 0; i < 6; i++) {
    const t = i % 2 ? T : T2
    const b = i % 2 ? B : B2, s = i % 2 ? S : S2
    const r = await book(req({ tenantSlug: t.slug, branchId: b.id, serviceId: s.id, date: dayKey(2), time: `${9 + i}:00`.padStart(5, '0'), name: 'x', mobile: nextMobile() }))
    assert.equal(r.status, 200)
    codes.add((await r.json()).appointment.code)
  }
  assert.equal(codes.size, 6)
  for (const c of codes) assert.match(c, /^A-[2-9A-Z]{5}$/)
})

test('past dates and invalid calendar dates are rejected', async () => {
  assert.equal((await book(req(bookBody({ date: dayKey(-1) })))).status, 409)
  assert.equal((await book(req(bookBody({ date: '2026-02-31' })))).status, 400)
  assert.equal((await book(req(bookBody({ date: dayKey(200) })))).status, 409)
  assert.equal((await book(req(bookBody({ mobile: '123' })))).status, 400)
})

test('cross-tenant ids are rejected (service/staff from another tenant)', async () => {
  assert.equal((await book(req(bookBody({ serviceId: S2.id, time: '12:00' })))).status, 400)
  const foreignStaff = await db.staff.create({ data: { tenantId: T2.id, name: 'f', serviceIds: JSON.stringify([S2.id]) } })
  assert.equal((await book(req(bookBody({ staffId: foreignStaff.id, time: '12:30' })))).status, 400)
})

test('persian digits / +98 mobile normalised; template spaces render', () => {
  assert.equal(normalizeMobile('۰۹۱۲۳۴۵۶۷۸۹'), '09123456789')
  assert.equal(normalizeMobile('+989123456789'), '09123456789')
  assert.equal(normalizeMobile('9123456789'), '09123456789')
  assert.equal(normalizeMobile('0812345678'), null)
  assert.equal(renderTemplate('سلام {{ customer_name }} و {{x}}', { customer_name: 'رایان' } as any), 'سلام رایان و ')
})

test('idempotency key: retry returns same appointment, no second booking', async () => {
  const body = bookBody({ time: '13:00', idempotencyKey: 'key-1' })
  const [a, b] = await Promise.all([book(req(body)), book(req(body))])
  assert.equal(a.status, 200); assert.equal(b.status, 200)
  const [ja, jb] = [await a.json(), await b.json()]
  assert.equal(ja.appointment.id, jb.appointment.id)
})

test('queue is ordered by scheduled time, not by booking time', async () => {
  const day = dayKey(3)
  const late = await (await book(req(bookBody({ date: day, time: '16:00' })))).json()
  const early = await (await book(req(bookBody({ date: day, time: '09:00' })))).json()
  const q = await db.queue.findFirst({ where: { branchId: B.id, serviceId: S.id, date: day } })
  const st = await getLiveState(q!.id)
  assert.deepEqual(st!.waiting.map((w) => w.code), [early.appointment.code, late.appointment.code])
})

test('check-in / reschedule after online booking no longer crash (unique entry)', async () => {
  const j = await (await book(req(bookBody({ time: '14:00' })))).json()
  const id = j.appointment.id
  await checkInAppointment(id)
  await checkInAppointment(id)
  assert.equal(await db.queueEntry.count({ where: { appointmentId: id } }), 1)
  // reschedule through the real route, including to the SAME slot (self-overlap used to fail) and to another day
  const same = await patchAppt(patchReq({ id, action: 'reschedule', date: dayKey(1), time: '14:00' }))
  assert.equal(same.status, 200, await same.clone().text())
  const moved = await patchAppt(patchReq({ id, action: 'reschedule', date: dayKey(4), time: '15:00' }))
  assert.equal(moved.status, 200, await moved.clone().text())
  const e = await db.queueEntry.findUnique({ where: { appointmentId: id }, include: { queue: true } })
  assert.equal(e!.queue.date, dayKey(4)); assert.equal(e!.status, 'WAITING')
})

test('state machine: terminal appointments cannot be changed', async () => {
  const j = await (await book(req(bookBody({ time: '17:00' })))).json()
  const id = j.appointment.id
  assert.equal((await patchAppt(patchReq({ id, action: 'cancel' }))).status, 200)
  assert.equal((await patchAppt(patchReq({ id, action: 'confirm' }))).status, 409)
  assert.equal((await patchAppt(patchReq({ id, action: 'no_show' }))).status, 409)
  assert.equal((await patchAppt(patchReq({ id, action: 'reschedule', date: dayKey(5), time: '10:00' }))).status, 409)
  const e = await db.queueEntry.findUnique({ where: { appointmentId: id } })
  assert.equal(e!.status, 'CANCELLED')
})

test('concurrent "next" from two operators calls exactly one customer', async () => {
  const q = await freshQueue()
  const ids = await walkIns(q, 3)
  const [a, b] = await Promise.all([
    executeQueueAction({ queueId: q, action: 'next', actor: 'op1' }),
    executeQueueAction({ queueId: q, action: 'next', actor: 'op2' }),
  ])
  assert.equal([a, b].filter((r) => r.ok).length, 1, JSON.stringify([a.error, b.error]))
  assert.equal(await db.queueEntry.count({ where: { queueId: q, status: 'CALLED' } }), 1)
})

test('full lifecycle + cancel/no-show clear currentServing + requeue', async () => {
  const q = await freshQueue()
  const [e1, e2] = await walkIns(q, 2)
  assert.ok((await executeQueueAction({ queueId: q, action: 'next', actor: 'o' })).ok)
  assert.equal((await db.queue.findUnique({ where: { id: q } }))!.currentServing !== null, true)
  assert.equal((await executeQueueAction({ queueId: q, action: 'call', entryId: e2, actor: 'o' })).ok, false, 'cannot call a 2nd while one is CALLED')
  assert.ok((await executeQueueAction({ queueId: q, action: 'no_show', actor: 'o' })).ok)
  assert.equal((await db.queue.findUnique({ where: { id: q } }))!.currentServing, null)
  assert.ok((await executeQueueAction({ queueId: q, action: 'requeue', entryId: e1, actor: 'o' })).ok)
  const st = await getLiveState(q)
  assert.deepEqual(st!.waiting.map((w) => w.id), [e2, e1], 'requeued customer goes to the back')
  assert.ok((await executeQueueAction({ queueId: q, action: 'next', actor: 'o' })).ok)
  assert.ok((await executeQueueAction({ queueId: q, action: 'serve', actor: 'o' })).ok)
  assert.ok((await executeQueueAction({ queueId: q, action: 'complete', actor: 'o' })).ok)
  assert.equal((await executeQueueAction({ queueId: q, action: 'cancel', entryId: e2, actor: 'o' })).ok, false, 'cannot cancel a completed visit')
})

test('priority really moves the customer; manual move survives later actions', async () => {
  const q = await freshQueue()
  const [a, b, c] = await walkIns(q, 3)
  await executeQueueAction({ queueId: q, action: 'priority', entryId: c, priority: 'VIP', actor: 'o' })
  assert.deepEqual((await getLiveState(q))!.waiting.map((w) => w.id), [c, a, b])
  await executeQueueAction({ queueId: q, action: 'move', entryId: b, direction: 'top', actor: 'o' })
  assert.deepEqual((await getLiveState(q))!.waiting.map((w) => w.id), [b, c, a], 'manual move above a VIP is kept')
  await executeQueueAction({ queueId: q, action: 'pause', actor: 'o' })
  await executeQueueAction({ queueId: q, action: 'resume', actor: 'o' })
  assert.deepEqual((await getLiveState(q))!.waiting.map((w) => w.id), [b, c, a], 'a later action does not undo the move')
  assert.equal((await executeQueueAction({ queueId: q, action: 'priority', entryId: a, priority: 'BOGUS', actor: 'o' })).ok, false)
})

test('next does not call a customer whose slot is hours away; explicit call overrides; pause blocks', async () => {
  const day = dayKey(0)
  const soon = new Date(); soon.setHours(soon.getHours() + 5)
  // an online booking for later today
  const appt = await db.appointment.create({ data: {
    tenantId: T.id, branchId: B.id, serviceId: S.id, customerId: (await db.customer.create({ data: { tenantId: T.id, name: 'late', mobile: nextMobile() } })).id,
    code: 'A-LATE1', scheduledAt: soon, status: 'CONFIRMED', liveToken: 'a'.repeat(32) } })
  const r = await enqueueAppointment(appt.id)
  const q = r!.queueId
  assert.equal((await executeQueueAction({ queueId: q, action: 'next', actor: 'o' })).ok, false)
  const entry = await db.queueEntry.findUnique({ where: { appointmentId: appt.id } })
  assert.ok((await executeQueueAction({ queueId: q, action: 'call', entryId: entry!.id, actor: 'o' })).ok)
  await executeQueueAction({ queueId: q, action: 'skip', actor: 'o' })
  await executeQueueAction({ queueId: q, action: 'pause', actor: 'o' })
  await walkIns(q, 1)
  assert.equal((await executeQueueAction({ queueId: q, action: 'next', actor: 'o' })).ok, false, 'paused queue refuses next')
  void day
})

test('reasonRequired is enforced for skip/cancel/no_show/move', async () => {
  const q = await freshQueue()
  const [a] = await walkIns(q, 2)
  await db.tenant.update({ where: { id: T.id }, data: { reasonRequired: true } })
  assert.equal((await executeQueueAction({ queueId: q, action: 'cancel', entryId: a, actor: 'o' })).ok, false)
  assert.ok((await executeQueueAction({ queueId: q, action: 'cancel', entryId: a, actor: 'o', reason: 'phone call' })).ok)
  await db.tenant.update({ where: { id: T.id }, data: { reasonRequired: false } })
})

test('customer self-cancel honours cancelPolicy', async () => {
  const j = await (await book(req(bookBody({ time: '18:00', date: dayKey(6) })))).json()
  const token = j.appointment.liveToken
  const call = () => publicCancel(req({}), { params: Promise.resolve({ token }) })
  await db.tenant.update({ where: { id: T.id }, data: { cancelPolicy: JSON.stringify({ allowCustomerCancel: false }) } })
  assert.equal((await call()).status, 403)
  await db.tenant.update({ where: { id: T.id }, data: { cancelPolicy: JSON.stringify({ minMinutesBefore: 100000 }) } })
  assert.equal((await call()).status, 409, 'too close to the appointment')
  await db.tenant.update({ where: { id: T.id }, data: { cancelPolicy: '{}' } })
  assert.equal((await call()).status, 200)
  assert.equal((await db.appointment.findUnique({ where: { id: j.appointment.id } }))!.status, 'CANCELLED')
  assert.equal((await call()).status, 409, 'cannot cancel twice')
})

test('staff: no double-booking of one staff member; overlapping durations block', async () => {
  const st = await db.staff.create({ data: { tenantId: T.id, name: 's1', serviceIds: JSON.stringify([S.id]) } })
  const long = await db.service.create({ data: { tenantId: T.id, name: 'long', duration: 60, capacity: 2 } })
  await db.staff.update({ where: { id: st.id }, data: { serviceIds: JSON.stringify([S.id, long.id]) } })
  const day = dayKey(7)
  assert.equal((await book(req(bookBody({ date: day, time: '10:00', staffId: st.id })))).status, 200)
  // another service, same staff, overlapping time → blocked
  assert.equal((await book(req(bookBody({ date: day, time: '10:00', serviceId: long.id, staffId: st.id })))).status, 409)
  // service "long" (60 min, capacity 2) without staff: two can share, third cannot
  assert.equal((await book(req(bookBody({ date: day, time: '12:00', serviceId: long.id })))).status, 200)
  assert.equal((await book(req(bookBody({ date: day, time: '12:00', serviceId: long.id })))).status, 200)
  assert.equal((await book(req(bookBody({ date: day, time: '12:00', serviceId: long.id })))).status, 409)
  const av = await getAvailability({ branchId: B.id, serviceId: S.id, staffId: st.id, date: day })
  assert.equal(av.slots.find((s) => s.time === '10:00')!.available, false)
})

test('plan limits: bookings / branches / staff / sms quota', async () => {
  const plan = await db.plan.create({ data: { name: 'tiny', slug: 'tiny', maxBookings: 2, maxBranches: 1, maxStaff: 1, smsQuota: 1 } })
  const t = await db.tenant.create({ data: { name: 'tiny', slug: 'tiny', planId: plan.id } })
  const b = await db.branch.create({ data: { tenantId: t.id, name: 'm', hours: JSON.stringify(ALL_DAYS) } })
  const s = await db.service.create({ data: { tenantId: t.id, name: 'x', duration: 30 } })
  const mk = (time: string) => book(req({ tenantSlug: 'tiny', branchId: b.id, serviceId: s.id, date: dayKey(1), time, name: 'n', mobile: nextMobile() }))
  assert.equal((await mk('09:00')).status, 200)
  assert.equal((await mk('10:00')).status, 200)
  assert.equal((await mk('11:00')).status, 403)
  const { checkBranchLimit, checkStaffLimit } = await import('@/lib/plan-limits')
  assert.ok(await checkBranchLimit(t.id))
  await db.staff.create({ data: { tenantId: t.id, name: 'a' } })
  assert.ok(await checkStaffLimit(t.id))
  // quota 1: first booking SMS went to outbox (PENDING), second one is marked FAILED
  const n = await db.notification.findMany({ where: { tenantId: t.id }, orderBy: { createdAt: 'asc' } })
  assert.deepEqual(n.map((x) => x.status), ['PENDING', 'FAILED'])
})

test('walk-in route validates tenant scope and mobile', async () => {
  const mk = (o: object) => walkInRoute(req({ name: 'w', mobile: nextMobile(), branchId: B.id, serviceId: S.id, ...o }))
  assert.equal((await mk({})).status, 200)
  assert.equal((await mk({ serviceId: S2.id })).status, 404)
  assert.equal((await mk({ mobile: 'abc' })).status, 400)
})

test('ETA is consistent between public and board views', async () => {
  const q = await freshQueue()
  const ids = await walkIns(q, 3)
  const st = await getLiveState(q)
  const eta = await calcEta(q, { id: ids[2] })
  assert.equal(eta.peopleAhead, 2)
  assert.equal(eta.estimatedWait, st!.waiting[2].estimatedWait)
})

test('passwords: scrypt per-user salt, legacy hash accepted and flagged for rehash', () => {
  const h1 = hashPassword('s3cret!'), h2 = hashPassword('s3cret!')
  assert.notEqual(h1, h2)
  assert.deepEqual(verifyPassword('s3cret!', h1), { ok: true, needsRehash: false })
  assert.equal(verifyPassword('wrong', h1).ok, false)
  const salt = createHmac('sha256', 'nobaas:pwd-salt').update('static-v1').digest('hex').slice(0, 32)
  const legacy = createHmac('sha256', salt).update('nobaas:old-pass').digest('hex')
  assert.deepEqual(verifyPassword('old-pass', legacy), { ok: true, needsRehash: true })
  assert.equal(verifyPassword('x', '').ok, false)
})

// ───────── helpers ─────────
let qSeq = 0
async function freshQueue(): Promise<string> {
  // a dedicated service per test → dedicated queue for today
  const s = await db.service.create({ data: { tenantId: T.id, name: `svc${++qSeq}`, duration: 30 } })
  const q = await db.queue.create({ data: { tenantId: T.id, branchId: B.id, serviceId: s.id, date: dayKey(0) } })
  ;(globalThis as any).__svc = s.id
  return q.id
}
async function walkIns(queueId: string, n: number): Promise<string[]> {
  const q = await db.queue.findUnique({ where: { id: queueId } })
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const r = await createWalkIn({ tenantId: T.id, branchId: B.id, serviceId: q!.serviceId, customerName: `w${i}`, mobile: nextMobile(), actor: 'o' })
    assert.ok(r.ok, r.error)
    const e = await db.queueEntry.findFirst({ where: { appointment: { liveToken: r.token } } })
    out.push(e!.id)
    await new Promise((res) => setTimeout(res, 5)) // distinct scheduledAt
  }
  return out
}

// ───────── branch management ─────────
import { POST as branchPost, PATCH as branchPatch, GET as branchGet } from '@/app/api/business/branches/route'

test('client (owner) can add branches; plan limit counts ACTIVE only and reports a clear error', async () => {
  const plan = await db.plan.create({ data: { name: 'two', slug: 'two', maxBranches: 2, maxStaff: 5, maxBookings: 100, smsQuota: 10 } })
  const t = await db.tenant.create({ data: { name: 'two', slug: 'two', planId: plan.id } })
  const owner = await db.user.create({ data: { tenantId: t.id, name: 'o', email: 'o@two.ir', passwordHash: 'x', role: 'TENANT_OWNER' } })
  setSession({ userId: owner.id, name: 'o', role: 'TENANT_OWNER', tenantId: t.id })
  const hours = JSON.stringify(ALL_DAYS)

  const r1 = await branchPost(req({ name: 'شعبه ۱', hours }))
  assert.equal(r1.status, 200, await r1.clone().text())
  const r2 = await branchPost(req({ name: 'شعبه ۲', hours }))
  assert.equal(r2.status, 200)
  const r3 = await branchPost(req({ name: 'شعبه ۳', hours }))
  assert.equal(r3.status, 403)
  assert.match((await r3.json()).error, /سقف شعبه‌ها/)
  // an INACTIVE branch does not use capacity
  assert.equal((await branchPost(req({ name: 'بایگانی', hours, status: 'INACTIVE' }))).status, 200)
  // …but re-activating it would exceed the limit
  const inactive = await db.branch.findFirst({ where: { tenantId: t.id, name: 'بایگانی' } })
  assert.equal((await branchPatch(patchReq({ id: inactive!.id, status: 'ACTIVE' }))).status, 403)
  // duplicate name
  assert.equal((await branchPost(req({ name: 'شعبه ۱', hours, status: 'INACTIVE' }))).status, 409)
  assert.equal(((await (await branchGet()).json()).branches as unknown[]).length, 3)

  // reset session for the other tests
  const o1 = await db.user.findFirst({ where: { tenantId: T.id } })
  setSession({ userId: o1!.id, name: 'owner', role: 'TENANT_OWNER', tenantId: T.id })
})

test('branch hours are validated; non-managers cannot add branches', async () => {
  const bad = (h: unknown) => branchPost(req({ name: `b${Math.random()}`, hours: JSON.stringify(h) }))
  assert.equal((await bad({ sat: { open: '18:00', close: '09:00', closed: false } })).status, 400)
  assert.equal((await bad({ xyz: { open: '09:00', close: '10:00', closed: false } })).status, 400)
  assert.equal((await bad({ sat: { open: '9am', close: '10:00', closed: false } })).status, 400)
  assert.equal((await bad({ sat: { open: '09:00', close: '17:00', closed: false }, fri: { open: '00:00', close: '00:00', closed: true } })).status, 200)
  const u = await db.user.findFirst({ where: { tenantId: T.id } })
  setSession({ userId: u!.id, name: 'op', role: 'OPERATOR', tenantId: T.id })
  assert.equal((await branchPost(req({ name: 'nope' }))).status, 403)
  setSession({ userId: u!.id, name: 'owner', role: 'TENANT_OWNER', tenantId: T.id })
})

test('a freshly created branch is immediately bookable', async () => {
  const b = await (await branchPost(req({ name: 'تازه', hours: JSON.stringify({ sat: { open: '09:00', close: '17:00', closed: false }, sun: { open: '09:00', close: '17:00', closed: false }, mon: { open: '09:00', close: '17:00', closed: false }, tue: { open: '09:00', close: '17:00', closed: false }, wed: { open: '09:00', close: '17:00', closed: false }, thu: { open: '09:00', close: '17:00', closed: false }, fri: { open: '09:00', close: '17:00', closed: false } }) }))).json()
  const r = await book(req(bookBody({ branchId: b.branch.id, time: '09:30', date: dayKey(8) })))
  assert.equal(r.status, 200, await r.clone().text())
})
