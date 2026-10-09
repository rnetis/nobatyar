# نوب‌یار (Nobyar) — Multi-tenant Appointment Booking & Live Queue SaaS

Persian (RTL) multi-tenant SaaS platform for appointment booking, live queue management and SMS notifications. Built with Next.js 16, Prisma (SQLite), Tailwind 4 + shadcn/ui, and a socket.io mini-service for real-time queue updates.

---

## 🔐 Admin Credentials (Platform Super Admin)

> **Note:** These credentials are stored in `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) and are **not** displayed anywhere on the production website. The login dialog on the landing page no longer contains any demo quick-fill buttons.

| Panel | URL | Email | Password |
|---|---|---|---|
| Super Admin | `/#/admin` | `admin@nobaas.ir` | `bGlTpdcV36FMshh5Aa1!` |

- Business/tenant accounts are created through the Super Admin panel → **Tenants → ایجاد Tenant**. A strong one-time initial password is generated automatically and shown **once** to the platform admin.
- To rotate the admin password, change `ADMIN_PASSWORD` in `.env` and re-run the seed (`bun scripts/seed.ts`), or update the hash directly in the database.

---

## 🚀 Getting Started

```bash
pnpm install
pnpm db:generate
pnpm db:push
bun scripts/seed.ts        # production seed: plans + super admin only
pnpm dev                   # http://localhost:3000
```

### Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Dev server on port 3000 |
| `pnpm build` / `pnpm start` | Production build (standalone) & start |
| `pnpm lint` | ESLint |
| `pnpm db:push` / `db:generate` / `db:migrate` / `db:reset` | Prisma database tasks |
| `bun scripts/seed.ts` | **Production** seed (plans + super admin; no demo data) |

### Mini service (live queue WebSocket)

The queue engine broadcasts real-time updates through a small socket.io service:

```bash
cd mini-services/queue-service
bun install && bun run index.ts   # WS :3003, broadcast API :3004
```

---

## ⚙️ Environment Variables (`.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | SQLite file path (e.g. `file:./db/custom.db`) |
| `SESSION_SECRET` | ✅ | HMAC secret for session cookies. Generate: `openssl rand -hex 32`. The app refuses to sign sessions without it. |
| `ADMIN_EMAIL` | ✅ (seed) | Platform super admin email |
| `ADMIN_PASSWORD` | ✅ (seed) | Platform super admin password (min 10 chars) |
| `NEXT_PUBLIC_BASE_URL` | recommended | Public origin used in SMS live-queue links |
| `QUEUE_SERVICE_URL` | optional | Broadcast API of the queue mini-service (default `http://localhost:3004`) |
| `SMSIR_API_KEY` | for SMS | sms.ir API key (X-API-KEY) |
| `SMSIR_LINE_NUMBER` | for SMS | sms.ir sender line number (numeric) |
| `NOTIFICATION_WEBHOOK_URL` | optional | Webhook endpoint that receives every notification as JSON |
| `NOTIFICATION_WEBHOOK_SECRET` | optional | If set, webhook requests carry `X-Nobaar-Signature` (HMAC-SHA256 hex of the raw body) |

---

## 📲 Notifications: sms.ir + Webhook

The notification engine (`src/lib/sms.ts`) uses a transactional outbox: every message is persisted (`Notification` model) and then delivered. Delivery is fire-and-forget — SMS never blocks or fails a booking.

### 1. SMS via sms.ir

Uses the sms.ir v1 bulk-send endpoint. Set `SMSIR_API_KEY` and `SMSIR_LINE_NUMBER` in `.env`; each notification is sent as:

```http
POST https://api.sms.ir/v1/send/bulk
X-API-KEY: <SMSIR_API_KEY>
Content-Type: application/json

{
  "lineNumber": 300000000000,
  "messageText": "نوبت شما ثبت شد…",
  "mobiles": ["09123456789"],
  "sendDateTime": null
}
```

Per sms.ir docs, a successful response has `status: 1` and returns a message id which is stored as `providerMessageId` on the notification. If credentials are missing or the API call fails, the message is marked `FAILED` and stays visible in the business panel SMS log — nothing is silently lost.

Notification events (gated per tenant by `notifPolicy`): `BOOKING_CREATED`, `QUEUE_CHANGED`, `RESCHEDULED`, `CANCELLED`, `YOUR_TURN`, `CALLED`, `NO_SHOW`.

### 2. Webhook (optional)

Set `NOTIFICATION_WEBHOOK_URL` to receive every notification as a JSON `POST`:

```json
{
  "event": "notification.created",
  "type": "CALLED",
  "channel": "SMS",
  "tenantId": "…",
  "notificationId": "…",
  "appointmentId": "…",
  "recipient": "09123456789",
  "body": "نوبت شما فراخوانده شد…",
  "createdAt": "2026-10-09T10:00:00.000Z"
}
```

Verify authenticity with the `X-Nobaar-Signature` header (HMAC-SHA256 of the raw body using `NOTIFICATION_WEBHOOK_SECRET`).

---

## 🧹 Production-readiness notes

- **No demo data**: the seed no longer creates demo tenants, customers, appointments, queues, notifications, tickets or audit logs. Only the 4 subscription plans and the super admin account.
- **No demo credentials in the UI**: the landing page login dialogs no longer include demo quick-fill buttons.
- **Session secret required**: the app fails closed (no session cookies) if `SESSION_SECRET` is unset.
- **Tenant onboarding**: initial passwords are randomly generated (never hardcoded) and shown once to the platform admin.
