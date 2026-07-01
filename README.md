# TurnoFlow

TurnoFlow is a scheduling platform for small professional businesses (barbershops, salons, clinics, and similar service businesses). It covers the full appointment lifecycle — public booking, staff and availability management, reminders, no-show tracking, waitlist reassignment, recurring series, deposits, customer self-service, post-visit reviews, and automated reactivation campaigns — built on an event-driven architecture with a transactional outbox.

## Current Status

- **Multi-tenant core**: business registration, JWT auth with refresh-token rotation and reuse detection, services, staff, availability rules, and availability exceptions.
- **Multi-staff team management**: role-based access (Owner / Receptionist / Professional), member invites, per-staff metrics, and staff-scoped Google Calendar connections.
- **Public booking**: per-business public pages with slot availability, booking, cancellation, rescheduling, and waitlist entry — no login required.
- **Recurring appointments**: customers can be enrolled in a recurring series (weekly/monthly/custom interval); the worker automatically creates each upcoming occurrence and detects scheduling conflicts.
- **Customer self-service portal**: customers log in via a passwordless magic link to view their appointment history, cancel, or rebook — without going through the public booking flow again.
- **Post-appointment reviews**: when a turno is marked completed, the customer automatically gets an email asking for a 1-5 star rating and comment; the business sees all reviews in the dashboard.
- **Reactivation campaigns**: a scheduled worker job detects customers who are inactive and at elevated no-show/cancellation risk, and emails them automatically to win them back, with a one-click unsubscribe link and cooldown to avoid repeat sends.
- **Reminders & notifications**: scheduled email reminders with retry tracking. Local development logs emails as JSON by default; Gmail SMTP can be enabled with an app password.
- **Waitlist**: offers with accept, reject, expire, and automatic reassignment when a slot opens up.
- **No-show & risk tracking**: manual completed/no-show marking, persisted customer risk scoring, and optional deposit requirements for risky customers.
- **Optional manual deposits**: no payment gateway required — businesses configure payment instructions, customers report a transfer reference, and staff confirm/reject/void the deposit from the dashboard.
- **Google Calendar sync**: unidirectional sync (TurnoFlow → Google Calendar) per staff member, keeping connected calendars in sync as appointments are booked, rescheduled, or cancelled.
- **Dashboard analytics**: daily aggregated metrics for activity, revenue, top services, recurring customers, and risky customers.
- **Audit logging, correlation IDs, and rate limiting**: every mutating action is audit-logged, requests are traced end-to-end via a correlation ID propagated through `AsyncLocalStorage`, and public write endpoints are rate-limited (Redis-backed).
- **Event-driven backbone**: a canonical set of domain events flow through a transactional outbox into RabbitMQ, consumed by the Go worker for side effects (email, calendar sync, metrics, risk scoring, recurring series, reviews, reactivation).

## Architecture

- `apps/web`: Next.js App Router frontend — public booking pages, the private dashboard, the customer self-service portal (`/portal`), and public single-purpose pages (cancel/reschedule, waitlist offer response, review submission, unsubscribe).
- `apps/api`: NestJS API — domain modules (`appointments`, `auth`, `audit`, `businesses`, `calendar`, `customer-portal`, `customers`, `dashboard`, `events`, `health`, `payments`, `public`, `reviews`), PostgreSQL ownership via Prisma, and RabbitMQ outbox publishing.
- `apps/worker`: Go worker — RabbitMQ event consumer plus a scheduler for reminders, attendance alerts, waitlist expiry, recurring-series creation, and reactivation campaigns.
- `docker-compose.yml`: local PostgreSQL, RabbitMQ, Redis, API, web, and worker.
- `Makefile`: common local commands (never call the underlying tools directly — the Makefile handles cross-platform and workspace coordination).

PostgreSQL is the source of truth. RabbitMQ transports versioned events only. The API writes a domain change and its outbox event in the same transaction, then a background publisher polls the outbox and publishes pending events to RabbitMQ every 5 seconds.

## Dashboard Analytics

The private dashboard includes:

- summary cards for monthly appointments, cancellations, no-shows, and revenue
- weekly activity chart based on persisted daily aggregates
- rankings for top booked services and recurring customers
- risky customer table backed by persisted risk scores
- a reviews view with per-review ratings/comments and a running average
- a recurring-series panel showing every upcoming occurrence per customer

Daily metrics are stored in `business_metrics_daily` and refreshed by the Go worker when appointment lifecycle events are processed.

## Customer Self-Service Portal

Customers never need a password. From `/portal/login`, a customer enters their email and the business slug; the worker emails a short-lived magic link (15 minutes). Following the link exchanges the token for a JWT session (`kind: "customer"`, separate from staff sessions) stored in the browser, giving access to `/portal`: appointment history, cancel, and rebook.

## Post-Appointment Reviews

Marking an appointment as completed triggers the same `AppointmentCompleted` event already used for risk scoring; the worker additionally creates a review record and emails the customer a one-time link (`/reviews/:token`) to leave a 1-5 star rating and optional comment. Reviews appear in the dashboard under **Reseñas**, with a running average and pending/responded counts.

## Reactivation Campaigns

A dedicated scheduler tick (independent from the main 60-second job tick, default every 24h) looks for customers with `MEDIUM`/`HIGH` risk who haven't booked in a while and haven't been re-contacted recently, and emails them automatically. Each email includes a one-click unsubscribe link; unsubscribed customers are permanently excluded. Tunable via environment variables (see below).

## Local Setup

1. Copy `.env.example` to `.env` and adjust secrets if needed.
2. Run `make up` to build and start PostgreSQL, RabbitMQ, API, web, and worker in the background.
3. Run `make db-migrate`.
4. Run `make db-seed`.
5. Open `http://localhost:3000`.

Useful local URLs:

- Web app: `http://localhost:3000`
- API: `http://localhost:3001`
- RabbitMQ management: `http://localhost:15672` with `turnoflow` / `turnoflow`
- Demo public booking page: `http://localhost:3000/barberia-lucas`
- Customer portal: `http://localhost:3000/portal/login`

Demo login after `make db-seed`:

- Email: `lucas@turnoflow.local`
- Password: `turnoflow123`

## Useful Commands

- `make up`: build and run the full local stack in the background.
- `make up-logs`: build and run the full local stack in the foreground.
- `make down`: stop the stack.
- `make logs`: stream Docker logs.
- `make db-migrate`: load `.env` and run Prisma migrations against the local database.
- `make db-seed`: load `.env` and seed demo data.
- `make test`: run API/web tests and worker tests.
- `make lint`: run JavaScript/TypeScript lint checks.
- `make typecheck`: run TypeScript checks.
- `make build`: build API, web, and Go worker.
- `docker compose config`: validate the local Compose file.

Recommended stabilization check:

```bash
docker compose config
make up
make db-migrate
make db-seed
make lint
make typecheck
make test
make build
```

## Environment

The local `.env.example` is configured for Docker Compose defaults:

- PostgreSQL runs on `localhost:5432`.
- RabbitMQ runs on `localhost:5672`.
- Redis runs on `localhost:6379` and backs rate limiting.
- API runs on `localhost:3001`.
- Web runs on `localhost:3000`.
- `DATABASE_URL` is used by local Prisma commands.
- Docker services override internal service URLs where needed, for example `postgres:5432`, `rabbitmq:5672`, and `api:3001`.
- If an old RabbitMQ volume was created with `guest` credentials, recreate the stack volume before switching to `turnoflow` credentials.

### Reminder email delivery

Reminder emails are sent by the Go worker to the customer email stored on the appointment. The default local transport is `EMAIL_TRANSPORT=json`, which logs the email payload and does not contact an email provider. This same transport is used for every other worker-sent email: customer portal magic links, review requests, and reactivation campaigns.

To send real emails with Gmail SMTP, set these values in your local `.env`:

```env
EMAIL_TRANSPORT=smtp
EMAIL_FROM=Your Name <your-email@gmail.com>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-gmail-app-password
SMTP_TIMEOUT_SECONDS=10
```

Gmail requires an App Password for SMTP. Do not use your normal Gmail password, and do not commit the real secret.

### Google Calendar sync

Google Calendar sync is unidirectional from TurnoFlow to one business calendar account. Connect Google Calendar once from `/dashboard/equipo`; the worker will create, update, or delete Google Calendar events for every future appointment in that business when appointments are booked, rescheduled, or cancelled.

Set these values in your local `.env`:

```env
GOOGLE_CALENDAR_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CALENDAR_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3001/calendar-connections/google/callback
CALENDAR_TOKEN_ENCRYPTION_KEY=base64-encoded-32-byte-key
OAUTH_STATE_SECRET=long-random-state-secret
```

Create the OAuth client in Google Cloud Console as a Web application and add the redirect URI above. `CALENDAR_TOKEN_ENCRYPTION_KEY` must decode to exactly 32 bytes because tokens are encrypted with AES-256-GCM before being stored in PostgreSQL. Do not commit real OAuth secrets or token encryption keys.

### Worker runtime

The Go worker runs in `WORKER_MODE=all` by default, which keeps local development simple by running RabbitMQ consumers and scheduled jobs in one process.

For heavier workloads, run one scheduler instance and scale consumer instances separately:

```env
WORKER_MODE=scheduler
WORKER_MODE=consumer
WORKER_CONCURRENCY=4
RABBITMQ_PREFETCH=8
REMINDER_BATCH_SIZE=25
ATTENDANCE_BATCH_SIZE=25
MAX_NOTIFICATION_ATTEMPTS=3
SCHEDULER_INTERVAL_SECONDS=60
```

RabbitMQ events still use the durable `worker.appointments` queue. Invalid event payloads are rejected without requeue and routed to `worker.appointments.dlq`.

### Reactivation campaigns

The reactivation job runs on its own ticker, separate from the main scheduler interval, since it doesn't need minute-level polling:

```env
REACTIVATION_INTERVAL_SECONDS=86400
REACTIVATION_INACTIVITY_DAYS=60
REACTIVATION_COOLDOWN_DAYS=30
REACTIVATION_BATCH_SIZE=50
```

`REACTIVATION_INACTIVITY_DAYS` is how long a customer must go without an appointment before being eligible; `REACTIVATION_COOLDOWN_DAYS` prevents re-contacting the same customer too often. Only customers with `MEDIUM`/`HIGH` risk who haven't opted out are targeted.

### Optional manual deposits

TurnoFlow supports optional manual deposits without requiring HTTPS or a payment gateway. The business configures payment instructions from the dashboard, each service can define whether it suggests a deposit, and the public booking form lets the customer report a transfer reference.

This flow is intentionally non-blocking: the appointment is created even if the customer does not submit a deposit. When a deposit is reported, the dashboard shows it on the appointment row so the business can confirm, reject, or void it after checking the transfer externally. Confirmed deposits are subtracted from the estimated remaining balance.

This is suitable for local deployments because TurnoFlow never handles card data and does not process money directly. For real online checkout, add a provider such as Mercado Pago later.

## API Contract

Core private endpoints include `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/accept-invite`, `/businesses/current`, `/business-members`, `/services`, `/availability/*`, `/appointments`, `/appointments/recurring-series`, `/waitlist`, `/waitlist-offers`, `/customers`, `/reviews`, `/metrics/staff`, `/dashboard/metrics`, and `/calendar-connections`.

Customer-facing endpoints (no staff login) include `/customer-portal/login-link`, `/customer-portal/sessions`, `/customer-portal/me`, `/customer-portal/appointments`, and per-appointment cancel/rebook.

Public endpoints (no login at all) include `/public/businesses/:slug`, `/public/businesses/:slug/services`, `/public/businesses/:slug/slots`, `/public/businesses/:slug/appointments`, `/public/businesses/:slug/waitlist`, waitlist offer accept/reject, `/public/reviews/:token`, and `/public/unsubscribe/:token`.

Canonical events include `BusinessCreated`, `AppointmentBooked`, `AppointmentConfirmed`, `AppointmentCancelled`, `AppointmentCompleted`, `AppointmentMarkedAsNoShow`, `AppointmentRescheduled`, `AppointmentDepositSubmitted/Confirmed/Rejected/Voided`, `WaitlistEntryCreated`, `WaitlistCandidateMatched`, `WaitlistOfferCreated/Accepted/Expired/Rejected`, `SlotReleased`, `SlotReassigned`, `ReminderScheduled`, `ReminderSent`, `CustomerRiskScoreUpdated`, `DailyMetricsCalculated`, `StaffMemberCreated/Updated/Deactivated`, `MemberInvited/Accepted/RoleChanged`, `RecurringSeriesCreated/Completed/Conflict`, `RecurringAppointmentScheduled`, and `CustomerPortalLoginRequested`.

## MVP Boundaries

- Email is the only notification channel — WhatsApp is intentionally excluded from the current scope.
- Payment gateway checkout, subscriptions, marketplace discovery, and complex resource booking are intentionally outside the MVP; manual deposit reporting covers the current need without handling card data.
- No-show risk and reactivation targeting are rule-based, not machine learning.
- The reactivation job atomically claims candidates (`FOR UPDATE SKIP LOCKED`) and marks them as contacted before the email is actually sent. If the send itself fails, that customer is not retried until the next cooldown window, since marketing email is treated as best-effort rather than requiring the richer retry/attempt tracking used for appointment reminders.
