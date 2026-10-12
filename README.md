# نوب‌یار (Nobyar) — Multi-tenant Appointment Booking & Live Queue SaaS

Persian (RTL) multi-tenant SaaS platform for appointment booking, live queue management and SMS notifications. Built with Next.js 16, Prisma (SQLite), Tailwind 4 + shadcn/ui, and a socket.io mini-service for real-time queue updates.

---

## 🔐 Admin Credentials (Platform Super Admin)

> **Note:** These credentials are stored in `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) and are **not** displayed anywhere on the production website. The login dialog on the landing page no longer contains any demo quick-fill buttons.

| Panel | URL | Email | Password |
|---|---|---|---|
| Super Admin | `/#/admin` | `admin@nobaas.ir` | `bGlTpdcV36FMshh5Aa1!` |

- Business/tenant accounts are created through the Super Admin panel → **Tenants → ایجاد Tenant**. A strong one-time initial password is generated automatically and shown **once** to the platform admin.
- To rotate the admin password, change `ADMIN_PASSWORD` in `.env` and re-run the seed (`pnpm seed`), or update the hash directly in the database.

---

## 🚀 Getting Started

```bash
pnpm install
pnpm db:generate
pnpm db:push
pnpm seed                  # production seed: plans + super admin only
pnpm dev                   # http://localhost:3000
```

> Runs on **Node.js ≥ 22** (verified on Node 24). Bun is not required.

### Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Dev server on port 3000 |
| `pnpm build` / `pnpm start` | Production build (standalone) & start |
| `pnpm lint` | ESLint |
| `pnpm db:push` / `db:generate` / `db:migrate` / `db:reset` | Prisma database tasks |
| `pnpm seed` | **Production** seed (plans + super admin; no demo data) |

### Mini service (live queue WebSocket)

The queue engine broadcasts real-time updates through a small socket.io service:

```bash
cd mini-services/queue-service
npm install && node index.ts   # WS :3003, broadcast API :3004
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
| `SMSIR_API_KEY` | for SMS | sms.ir API key (`X-API-KEY`). Leave empty to keep messages in the outbox. |
| `SMSIR_LINE_NUMBER` | for SMS | sms.ir sender line number (numeric) |
| `HTTPSMS_API_KEY` | for SMS | httpsms.com API key (`x-api-Key` header) |
| `HTTPSMS_FROM_NUMBER` | for SMS | httpsms.com sender number (e.g. `+989999783444`) |
| `SMSIR_API_URL` / `HTTPSMS_API_URL` | optional | Override provider base URLs (point at a mock/staging provider) |
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

### 2. SMS via httpsms.com

Alternative provider (per-tenant or platform-wide). Set `HTTPSMS_API_KEY` + `HTTPSMS_FROM_NUMBER` for a platform-wide default, or let each tenant store its own credentials in the admin panel (*پیامک‌های پلتفرم → تنظیمات پیامک*). Each notification is sent as:

```http
POST https://api.httpsms.com/v1/messages/send
Content-Type: application/json
x-api-Key: <api key>

{
  "from": "+989999783444",
  "to": "09123456789",
  "content": "نوبت شما ثبت شد…"
}
```

Precedence: **tenant `smsConfig` → platform env vars → disabled**. When nothing is configured the message stays `PENDING` in the outbox (never lost, never silently dropped).

### 3. Per-tenant templates (Jinja2-style)

Each tenant can override the text of any notification type from the admin panel. Templates use `{{ variable }}` placeholders rendered server-side in `renderMessageBody()`:

```text
سلام {{ customer_name }}! نوبت شما در {{ business_name }} ثبت شد.
صف زنده: {{ live_queue_url }}
```

Available variables: `customer_name`, `business_name`, `branch_name`, `service_name`, `appointment_number`, `appointment_date`, `appointment_time`, `queue_position`, `people_ahead`, `estimated_wait`, `live_queue_url`. Unknown variables render as empty strings; empty/missing templates fall back to the built-in defaults.

> Provider credentials in `smsConfig` are stored as plain JSON in SQLite — encrypt them at rest if the database is not otherwise protected.

### 4. Webhook (optional)

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
