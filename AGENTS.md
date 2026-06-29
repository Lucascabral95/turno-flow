# AGENTS.md

High-signal context for OpenCode sessions working in this repo. TurnoFlow is a multi-tenant scheduling MVP (UI/emails in Spanish, Argentina timezone). Three apps: NestJS API, Next.js web, Go worker.

## Commands

This is a **Windows/PowerShell repo**. The `Makefile` wraps everything in `powershell -NoProfile -Command`, so use the `make` targets rather than translating to bash.

- Setup order matters: `make up` -> `make db-migrate` -> `make db-seed`.
- `make db-migrate` runs `prisma migrate deploy` (production deploy, **not** `migrate dev`). Never create migrations ad hoc locally without a matching migration file.
- `make lint` / `make typecheck` / `make test` / `make build` run across npm workspaces **and** the Go worker.
- Focused: `make api-test`, `make web-test`, `make worker-test`, `make api-dev`, `make web-dev`, `make worker-dev`.
- Integration tests: `npm --workspace apps/api run test:integration` (uses testcontainers, needs Docker, separate vitest config). Not part of `make test`.
- Go toolchain uses a pinned cache under `.cache/go-build-codex` / `.cache/go-mod-codex`; tidy with `make worker-tidy`, test with `make worker-test` (`go test ./...`).
- Stabilization sequence before considering work done: `docker compose config` -> `make up` -> `make db-migrate` -> `make db-seed` -> `make lint` -> `make typecheck` -> `make test` -> `make build`.

## Package boundaries

- npm workspaces (root `package.json`) cover **only** `apps/api` and `apps/web`. The Go worker is **not** an npm workspace; root `npm run ...` skips it. Use `make` targets to include the worker.
- Node >=20, npm >=10. Go 1.25 (module `github.com/turnoflow/turnoflow/apps/worker`).
- `apps/api`: NestJS, CommonJS, TS strict + `experimentalDecorators`/`emitDecoratorMetadata`. Domain modules: `appointments`, `businesses`, `auth`, `calendar`, `customers`, `dashboard`, `events`, `audit`, `public`, `prisma`, `health`. Entrypoint `src/main.ts` (port 3001).
- `apps/web`: Next.js 16 App Router, React 19, mostly client-rendered. Route pages in `app/` are thin shims that re-export from `app/ui/` which re-export from `presentation/components/`. Shared types in `shared/interfaces`, HTTP in `infrastructure/http`, formatters in `shared/utils`.
- `apps/worker`: Go. `cmd/worker` entrypoint; `internal/{worker,postgres,email,config,domain}`. Implements reminders, waitlist offers, customer risk scoring, daily metrics, Google Calendar sync.

## Architecture rules that are easy to break

- **Transactional outbox is mandatory.** The API writes domain changes **and** an `outbox_events` row in the same Prisma `$transaction` via `OutboxService.create(tx, ...)`. Never publish to RabbitMQ directly from a request handler. `EventPublisherService` (in `events/events.module.ts`) polls `outbox_events` every 5s and publishes to the `turnoflow.events` topic exchange.
- **The worker also writes to the outbox** inside `RunOnce` transactions (`tx.CreateOutboxEvent`), e.g. `ReminderScheduled`, `WaitlistOfferCreated`, `CustomerRiskScoreUpdated`, `DailyMetricsCalculated`. Idempotency is enforced via the `processed_events` table keyed by `event_id` + `type`.
- **PostgreSQL is the source of truth.** RabbitMQ transports versioned events only; Redis is provisioned but currently unused.
- When adding an event, keep `apps/api/src/events/event-types.ts` (`EventTypes` + `EventRoutingKeys`) and `apps/worker/internal/domain/events.go` in sync, and add the routing key to the relevant queue bindings in `event-publisher.service.ts` and the worker's `eventBindingKeys` in `cmd/worker/main.go`.
- **Correlation IDs propagate end-to-end.** `CorrelationIdMiddleware` reads the `x-correlation-id` header (or generates a UUID), stores it in `AsyncLocalStorage` (`common/correlation-id.ts`), and sets the response header. `OutboxService.create` reads the ALS value and stores it in `outbox_events.correlation_id`. `EventPublisherService` includes it in the RabbitMQ message envelope. The worker logs it as `correlation_id` via `slog.With(...)`. `AuditService.create` falls back to `getCorrelationId()` for `request_id` when not explicitly passed.
- Worker `WORKER_MODE`: `all` (default, consumer+scheduler in one process) | `consumer` | `scheduler`. Consumer reads durable queue `worker.appointments`; invalid payloads are `Nack(false, false)` -> DLQ `worker.appointments.dlq` (no requeue), processing errors are `Nack(false, true)` (requeue). Scheduler runs `SendDueReminders`, `ProcessAttendanceAlerts`, `ExpireWaitlistOffers` every `SCHEDULER_INTERVAL_SECONDS`.
- **All 4 worker queues have DLQs**: `worker.appointments.dlq`, `worker.waitlist.dlq`, `worker.notifications.dlq`, `worker.metrics.dlq`, all bound to `turnoflow.events.dlx`. If queues already exist without DLQ args, RabbitMQ will reject `assertQueue` — delete the old queues first (or recreate the volume).

## API conventions

- Global `ValidationPipe`: `forbidNonWhitelisted`, `transform`, `whitelist`. DTOs must use `class-validator` decorators or inputs are rejected.
- Auth is JWT bearer (`JWT_SECRET`). `AuthGuard` sets `request.user = { id, email }`; use the `@CurrentUser` decorator / `AuthenticatedUser`. Private endpoints additionally require business membership (owner or active `BusinessMember`) via `BusinessesService.requireCurrentBusiness`.
- **Refresh tokens use family-based rotation with reuse detection.** Each login/register creates a `family_id`. On refresh, the old token is revoked and a new one is created with the same `family_id`. If a revoked token is presented again, the entire family is revoked (reuse detected). Never create a refresh token without a `family_id`.
- Public booking endpoints (`/public/businesses/:slug/...`) are unauthenticated and keyed by business `slug` plus per-appointment cancellation tokens.
- **Rate limiting** is applied to public endpoints via `express-rate-limit` (in-memory, configured in `common/rate-limit.middleware.ts`, registered in `AppModule.configure()`): 20 writes / 15min, 60 reads / 1min per IP. `trust proxy` is enabled in `main.ts` for correct client IP detection behind reverse proxies.
- **Health checks**: `GET /health` (liveness, always 200) and `GET /health/ready` (readiness, checks DB via `$queryRaw\`SELECT 1\`` + RabbitMQ via `EventPublisherService.isConnected()`, returns 503 if any check is down). The API Docker healthcheck uses `/health/ready`.
- **List endpoints are capped**: `/appointments` returns the last 200 (ordered by `startsAt desc`), `/waitlist` returns the last 100. The frontend pages client-side over these caps.
- **Helmet** is enabled with CSP disabled in dev (for Swagger). **CORS** is locked to `APP_BASE_URL` and `localhost:WEB_PORT` only (not `origin: true`).
- **Swagger/OpenAPI** is served at `/docs` in dev/staging only (`NODE_ENV !== 'production'`). Controllers use `@ApiTags()` for grouping.
- **Sentry** is optional: if `SENTRY_DSN` is not set, Sentry initializes as noop. The API uses `SentryFilter` + `Sentry.setupExpressErrorHandler`. The worker calls `sentry.CaptureException` on event processing failures.
- API ESLint is **type-checked** and enforces `@typescript-eslint/consistent-type-imports`, `no-floating-promises`, `no-misused-promises`. Use `type` imports for types, always await/void promises.
- TS has `noUncheckedIndexedAccess`: indexed access yields `T | undefined` and lint will flag unawaited promises.

## Testing conventions

- Vitest with `globals: true` (no need to import `describe`/`it`/`expect`).
- API specs live in `src/**/*.spec.ts`. **Unit tests use hand-written Prisma mocks** (`vi.fn()`), not a test database or a real Prisma client. To test transactional services, mock `prisma.$transaction` so it invokes the callback with a `tx` object exposing only the model methods the code path touches (e.g. `eventOutbox.create`, `appointment.update`).
- **Integration tests** live in `test/**/*.integration.spec.ts` and use **testcontainers** (real Postgres + RabbitMQ). They run via `npm --workspace apps/api run test:integration` (separate vitest config, 120s timeout). They are **not** run by `make api-test`. Requires Docker available locally.
- Web tests only include `lib/**/*.spec.ts` — specs under `presentation/` or `app/` are **not** run by `make web-test`. Put pure logic/form tests in `apps/web/lib`.
- Go tests are standard `*_test.go` next to the code, using in-memory fakes (`newFakeRepository`, `fakeSender`).

## Local env / Docker

- Copy `.env.example` to `.env`. The Makefile loads `.env` into the process for local `db-*` and `*-dev` targets (PowerShell); Docker Compose injects its own env and overrides hostnames to `postgres:5432`, `rabbitmq:5672`, `api:3001`.
- Local commands target `localhost`; containers target internal service names. `DATABASE_URL` in `.env` is for local Prisma; Compose sets its own.
- RabbitMQ credentials are `turnoflow`/`turnoflow` (not `guest`). If an old volume was created with `guest`, recreate the volume before switching.
- Email: `EMAIL_TRANSPORT=json` (logs payload, no SMTP) by default. Set `smtp` + Gmail App Password to send real email.
- Google Calendar sync is optional and all-or-nothing: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, and `CALENDAR_TOKEN_ENCRYPTION_KEY` must all be set (or all empty). `CALENDAR_TOKEN_ENCRYPTION_KEY` must base64-decode to exactly 32 bytes (AES-256-GCM). Sync is unidirectional TurnoFlow -> Google.
- `apps/api/generated` and `apps/api/prisma/migrations/*/migration_lock.toml` are gitignored.

## Demo data (after `make db-seed`)

- Login: `lucas@turnoflow.local` / `turnoflow123`.
- Public booking page: `http://localhost:3000/barberia-lucas`.
- RabbitMQ management: `http://localhost:15672` (`turnoflow`/`turnoflow`).

## Workflow

- Conventional Commits with PR refs, e.g. `feat: ...`, `fix: ...`, `chore: ...`, `refactor: ...` suffixed with `(#NN)`. CI runs via GitHub Actions (`.github/workflows/ci.yml`) on PRs and pushes to `main`: lint + typecheck + test + build across npm workspaces and the Go worker. Run the stabilization sequence locally before requesting review.
