# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TurnoFlow is an appointment scheduling SaaS. It is an npm workspaces monorepo with three apps:

- `apps/api` — NestJS REST API (TypeScript, CommonJS, port 3001)
- `apps/web` — Next.js 16 App Router frontend (React 19, port 3000)
- `apps/worker` — Go 1.25 background worker (consumer + scheduler modes)

Infrastructure: PostgreSQL 16, RabbitMQ 3.13, Redis 7 (provisioned, currently unused).

## Commands

All primary developer commands go through `make`. Never translate `make` targets to raw shell — they handle cross-platform and workspace coordination.

```bash
# Infrastructure
make up              # docker compose up --build -d
make db-migrate      # prisma migrate deploy
make db-seed         # seed demo data

# Local dev (without Docker)
make api-dev         # tsx watch
make web-dev         # next dev --port 3000
make worker-dev      # go run ./cmd/worker

# Quality
make lint            # eslint across api + web workspaces
make typecheck       # tsc --noEmit across api + web
make test            # api-test + web-test + worker-test

# Build
make build           # api-build + web-build + worker-build
make clean           # removes dist, .next, bin, .cache
```

### Running a single test file (API)
```bash
npx --prefix apps/api vitest run src/path/to/file.spec.ts
```

### Running a single test file (Web)
```bash
npx --prefix apps/web vitest run lib/path/to/file.spec.ts
```

### Integration tests (require Docker, not part of `make test`)
```bash
npm --workspace apps/api run test:integration
```

### Go worker tests
```bash
cd apps/worker && go test ./...
```

## Architecture

### API (`apps/api`)

NestJS modules under `src/`: `appointments`, `auth`, `audit`, `businesses`, `calendar`, `common`, `customers`, `dashboard`, `events`, `health`, `payments`, `prisma`, `public`.

**Transactional outbox**: Domain writes and an `outbox_events` row go in the same `prisma.$transaction`. `EventPublisherService` polls every 5s and publishes to RabbitMQ topic exchange `turnoflow.events`. Never publish events outside this pattern.

**Auth**: JWT bearer with family-based refresh token rotation and reuse detection. Rate limiting on public endpoints (20 writes/15min, 60 reads/1min).

**Correlation IDs**: propagated end-to-end via `AsyncLocalStorage`. All new middleware/services must preserve them.

**Global `ValidationPipe`** runs with `forbidNonWhitelisted`, `transform`, `whitelist`.

### Web (`apps/web`)

Layered: `app/` pages are thin shims → `app/ui/` re-exports → `presentation/components/` (real components with SCSS Modules). HTTP calls go through `infrastructure/http/` and `infrastructure/api/`. Shared types live in `shared/interfaces/`. Only `lib/**/*.spec.ts` files are picked up by the test runner — specs outside `lib/` are excluded in CI.

### Worker (`apps/worker`)

Go binary controlled by `WORKER_MODE` env var: `all` (default), `consumer`, or `scheduler`.

- **Consumer**: durable queue `worker.appointments`; invalid messages → DLQ `worker.appointments.dlq`.
- **Scheduler**: runs `SendDueReminders`, `ProcessAttendanceAlerts`, `ExpireWaitlistOffers`, and more on `SCHEDULER_INTERVAL_SECONDS`.

Unit tests use in-memory fakes (`newFakeRepository`, `fakeSender`) — no real DB or broker.

## Key Conventions

### Adding a new event type
Keep these two files in sync — both must be updated together:
1. `apps/api/src/events/event-types.ts` — add to `EventTypes` and `EventRoutingKeys`
2. `apps/worker/internal/domain/events.go` — add the matching Go constant

Also add the routing key to queue bindings in `event-publisher.service.ts` and to `eventBindingKeys` in `apps/worker/cmd/worker/main.go`.

### Database migrations
Always use `prisma migrate deploy`, never `prisma migrate dev`. Never create migration files ad hoc without a corresponding schema change.

### RabbitMQ
If queues exist without DLQ arguments already set, they must be deleted (or the volume recreated) before re-asserting them with new args.

### TypeScript
- `noUncheckedIndexedAccess` is active in both workspaces — indexed access returns `T | undefined`.
- `@typescript-eslint/no-floating-promises` is an error — always `await` or `void` async calls.
- `@typescript-eslint/consistent-type-imports` is an error in the API — use `import type { Foo }` for type-only imports.

### API unit tests
Prisma is hand-mocked with `vi.fn()` — no test database. For transactional services, mock `prisma.$transaction` to invoke its callback with a `tx` object.

### Commits
Conventional Commits with PR reference: `feat: add X (#42)`, `fix: correct Y (#43)`.
