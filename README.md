# TurnoFlow

TurnoFlow is an MVP scheduling platform for small professional businesses. It supports public booking pages, service and staff management, email reminders, no-show tracking, waitlist offers, and event-driven worker processing.

## Current MVP Status

Phases 1-4 are implemented and stabilized for local development:

- Multi-tenant base with business registration, auth, services, staff, availability rules, and availability exceptions.
- Public business pages with booking, cancellation, and waitlist entry.
- PostgreSQL-backed appointment creation with transactional validation and outbox events.
- RabbitMQ exchange, durable queues, and a Go worker connected to the event stream.

## Architecture

- `apps/web`: Next.js App Router frontend for public booking and the private dashboard.
- `apps/api`: NestJS API, PostgreSQL ownership, domain transactions, auth, and RabbitMQ outbox publishing.
- `apps/worker`: Go worker for reminders, waitlist offers, idempotent event processing, and async email delivery.
- `docker-compose.yml`: local PostgreSQL, RabbitMQ, API, web, and worker.
- `Makefile`: common local commands.

PostgreSQL is the source of truth. RabbitMQ transports versioned events only. The API writes events to an outbox table inside the same transaction as domain changes, then publishes pending events to RabbitMQ.

## Local Setup

1. Copy `.env.example` to `.env` and adjust secrets if needed.
2. Run `make up` to build and start PostgreSQL, RabbitMQ, API, web, and worker in the background.
3. Run `make db-migrate`.
4. Run `make db-seed`.
5. Open `http://localhost:3000`.

Useful local URLs:

- Web app: `http://localhost:3000`
- API: `http://localhost:3001`
- RabbitMQ management: `http://localhost:15672` with `guest` / `guest`
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
- API runs on `localhost:3001`.
- Web runs on `localhost:3000`.
- `DATABASE_URL` is used by local Prisma commands.
- Docker services override internal service URLs where needed, for example `postgres:5432`, `rabbitmq:5672`, and `api:3001`.

## MVP Boundaries

- Email is the first notification channel.
- WhatsApp, payments, subscriptions, marketplace discovery, and complex resource booking are intentionally outside the MVP.
- No-show risk is rule based, not machine learning.
