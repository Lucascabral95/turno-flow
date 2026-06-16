# TurnoFlow

TurnoFlow is an MVP scheduling platform for small professional businesses. It supports public booking pages, service and staff management, email reminders, no-show tracking, waitlist offers, and event-driven worker processing.

## Architecture

- `apps/web`: Next.js App Router frontend for public booking and the private dashboard.
- `apps/api`: NestJS API, PostgreSQL ownership, domain transactions, auth, and RabbitMQ outbox publishing.
- `apps/worker`: Go worker for reminders, waitlist offers, idempotent event processing, and async email delivery.
- `docker-compose.yml`: local PostgreSQL, RabbitMQ, API, web, and worker.
- `Makefile`: common local commands.

PostgreSQL is the source of truth. RabbitMQ transports versioned events only. The API writes events to an outbox table inside the same transaction as domain changes, then publishes pending events to RabbitMQ.

## Local Setup

1. Copy `.env.example` to `.env` and adjust secrets if needed.
2. Run `make up`.
3. Open `http://localhost:3000`.
4. RabbitMQ management is available at `http://localhost:15672` with `guest` / `guest`.

## Useful Commands

- `make up`: build and run the full local stack.
- `make down`: stop the stack.
- `make logs`: stream Docker logs.
- `make db-migrate`: run Prisma migrations.
- `make db-seed`: seed demo data.
- `make test`: run API/web tests and worker tests.
- `make lint`: run JavaScript/TypeScript lint checks.
- `make typecheck`: run TypeScript checks.
- `make build`: build API, web, and Go worker.

## MVP Boundaries

- Email is the first notification channel.
- WhatsApp, payments, subscriptions, marketplace discovery, and complex resource booking are intentionally outside the MVP.
- No-show risk is rule based, not machine learning.
