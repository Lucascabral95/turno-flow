# TurnoFlow

TurnoFlow is an MVP scheduling platform for small professional businesses. It supports public booking pages, service and staff management, email reminders, no-show tracking, waitlist offers, customer risk scoring, and event-driven worker processing.

## Current MVP Status

Phases 1-12 are implemented for local development:

- Multi-tenant base with business registration, auth, services, staff, availability rules, and availability exceptions.
- Public business pages with booking, cancellation, and waitlist entry.
- PostgreSQL-backed appointment creation with transactional validation and outbox events.
- RabbitMQ exchange, durable queues, and a Go worker connected to the event stream.
- Reminder scheduling and delivery with retry tracking. Local development uses JSON logging by default, and Gmail SMTP can be enabled with an app password.
- Waitlist offers with accept, reject, expire, and automatic reassignment.
- Manual completed/no-show marking plus persisted customer risk scoring.
- Daily business metrics aggregation with dashboard analytics for activity, revenue, top services, recurring customers, and risky customers.
- Formal API aliases for auth, business, availability, appointments, waitlist, and metrics endpoints.
- Canonical domain events and RabbitMQ routing keys with legacy bindings kept during the transition.

## Architecture

- `apps/web`: Next.js App Router frontend for public booking and the private dashboard.
- `apps/api`: NestJS API, PostgreSQL ownership, domain transactions, auth, and RabbitMQ outbox publishing.
- `apps/worker`: Go worker for reminders, waitlist offers, customer risk recalculation, and daily metrics aggregation.
- `docker-compose.yml`: local PostgreSQL, RabbitMQ, Redis, API, web, and worker.
- `Makefile`: common local commands.

PostgreSQL is the source of truth. RabbitMQ transports versioned events only. The API writes events to an outbox table inside the same transaction as domain changes, then publishes pending events to RabbitMQ.

## Dashboard Analytics

The private dashboard now includes:

- summary cards for monthly appointments, cancellations, no-shows, and revenue
- weekly activity chart based on persisted daily aggregates
- rankings for top booked services and recurring customers
- risky customer table backed by persisted risk scores

Daily metrics are stored in `business_metrics_daily` and refreshed by the Go worker when appointment lifecycle events are processed.

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
- Redis runs on `localhost:6379` and is available for future cache/rate limit work.
- API runs on `localhost:3001`.
- Web runs on `localhost:3000`.
- `DATABASE_URL` is used by local Prisma commands.
- Docker services override internal service URLs where needed, for example `postgres:5432`, `rabbitmq:5672`, and `api:3001`.
- If an old RabbitMQ volume was created with `guest` credentials, recreate the stack volume before switching to `turnoflow` credentials.

### Reminder email delivery

Reminder emails are sent by the Go worker to the customer email stored on the appointment. The default local transport is `EMAIL_TRANSPORT=json`, which logs the email payload and does not contact an email provider.

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

## API Contract

Core private endpoints include `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/businesses/me`, `/services`, `/availability/rules`, `/availability/exceptions`, `/availability/slots`, `/appointments`, `/waitlist`, `/waitlist-offers`, and `/metrics/dashboard`.

Public booking endpoints include `/public/businesses/:slug`, `/public/businesses/:slug/services`, `/public/businesses/:slug/slots`, `/public/businesses/:slug/appointments`, `/public/businesses/:slug/waitlist`, and public waitlist offer token actions.

Canonical events include `BusinessCreated`, `AppointmentBooked`, `AppointmentConfirmed`, `AppointmentCancelled`, `AppointmentCompleted`, `AppointmentMarkedAsNoShow`, `WaitlistEntryCreated`, `WaitlistCandidateMatched`, `WaitlistOfferCreated`, `WaitlistOfferAccepted`, `SlotReleased`, `SlotReassigned`, `ReminderScheduled`, `ReminderSent`, `CustomerRiskScoreUpdated`, and `DailyMetricsCalculated`.

## MVP Boundaries

- Email is the first notification channel.
- WhatsApp, payments, subscriptions, marketplace discovery, and complex resource booking are intentionally outside the MVP.
- No-show risk is rule based, not machine learning.
- Production hardening items such as audit logs, rate limit strategy, correlation ids, and deeper e2e coverage are still pending.
