.DEFAULT_GOAL := help

API_DIR := apps/api
WEB_DIR := apps/web
WORKER_DIR := apps/worker

DOCKER_COMPOSE := docker compose
POWERSHELL := powershell -NoProfile -Command
HASH := \#

LOAD_ENV := $$envFile = Join-Path (Get-Location).Path ".env"; if (Test-Path $$envFile) { Get-Content $$envFile | Where-Object { $$_ -and -not $$_.TrimStart().StartsWith("$(HASH)") } | ForEach-Object { $$parts = $$_.Split("=", 2); if ($$parts.Length -eq 2) { [Environment]::SetEnvironmentVariable($$parts[0], $$parts[1], "Process") } } };
GO_CACHE := $$root = (Get-Location).Path; $$cache = Join-Path $$root ".cache/go-build-codex"; $$modcache = Join-Path $$root ".cache/go-mod-codex"; New-Item -ItemType Directory -Path $$cache -Force | Out-Null; New-Item -ItemType Directory -Path $$modcache -Force | Out-Null; $$env:GOCACHE = $$cache; $$env:GOMODCACHE = $$modcache; Set-Location $(WORKER_DIR);
WORKER_BINARY := .cache/turnoflow-worker.exe

.PHONY: help install worker-tidy
.PHONY: up up-build up-build-classic up-logs down logs api-dev web-dev worker-dev
.PHONY: db-migrate db-generate db-studio db-seed
.PHONY: lint typecheck test api-test web-test worker-test
.PHONY: build api-build web-build worker-build
.PHONY: compose-config clean

help:
	@echo TurnoFlow commands:
	@echo.
	@echo Setup:
	@echo   make install          Install API and Web dependencies
	@echo   make worker-tidy      Tidy Go worker dependencies
	@echo.
	@echo Development:
	@echo   make up               Rebuild images and start Docker Compose services in the background
	@echo   make up-build         Alias of make up
	@echo   make up-build-classic Rebuild with Docker classic builder for proxy/cache issues
	@echo   make up-logs          Start Docker Compose services in the foreground
	@echo   make down             Stop Docker Compose services
	@echo   make logs             Stream Docker Compose logs
	@echo   make api-dev          Run NestJS API locally
	@echo   make web-dev          Run Next.js locally
	@echo   make worker-dev       Run Go worker locally
	@echo.
	@echo Database:
	@echo   make db-migrate       Load .env and run Prisma deploy migrations
	@echo   make db-generate      Generate Prisma client
	@echo   make db-studio        Load .env and open Prisma Studio
	@echo   make db-seed          Load .env and seed database
	@echo.
	@echo Quality:
	@echo   make lint             Run API and Web lint checks
	@echo   make typecheck        Run TypeScript checks
	@echo   make test             Run API, Web and worker tests
	@echo   make api-test         Run API tests
	@echo   make web-test         Run Web tests
	@echo   make worker-test      Run Go worker tests
	@echo.
	@echo Build:
	@echo   make build            Build API, Web and Worker
	@echo   make api-build        Build NestJS API
	@echo   make web-build        Build Next.js Web
	@echo   make worker-build     Build Go Worker
	@echo.
	@echo Utility:
	@echo   make compose-config   Validate Docker Compose config
	@echo   make clean            Remove generated local build artifacts

install:
	npm install

worker-tidy:
	$(POWERSHELL) '$(GO_CACHE) go mod tidy'

up:
	$(DOCKER_COMPOSE) up --build -d

up-build:
	$(DOCKER_COMPOSE) up --build -d

up-build-classic:
	$(POWERSHELL) '$$env:DOCKER_BUILDKIT = "0"; $$env:COMPOSE_DOCKER_CLI_BUILD = "0"; $(DOCKER_COMPOSE) up --build -d'

up-logs:
	$(DOCKER_COMPOSE) up

down:
	$(DOCKER_COMPOSE) down

logs:
	$(DOCKER_COMPOSE) logs -f

api-dev:
	$(POWERSHELL) '$(LOAD_ENV) npm.cmd --workspace $(API_DIR) run dev'

web-dev:
	$(POWERSHELL) '$(LOAD_ENV) npm.cmd --workspace $(WEB_DIR) run dev'

worker-dev:
	$(POWERSHELL) '$(LOAD_ENV) $(GO_CACHE) go run ./cmd/worker'

db-migrate:
	$(POWERSHELL) '$(LOAD_ENV) npm.cmd --workspace $(API_DIR) run prisma:migrate:deploy'

db-generate:
	npm --workspace $(API_DIR) run prisma:generate

db-studio:
	$(POWERSHELL) '$(LOAD_ENV) Set-Location $(API_DIR); npx.cmd prisma studio'

db-seed:
	$(POWERSHELL) '$(LOAD_ENV) npm.cmd --workspace $(API_DIR) run prisma:seed'

lint:
	npm run lint

typecheck:
	npm run typecheck

test: api-test web-test worker-test

api-test:
	npm --workspace $(API_DIR) run test

web-test:
	npm --workspace $(WEB_DIR) run test

worker-test:
	$(POWERSHELL) '$(GO_CACHE) go test ./...'

build: api-build web-build worker-build

api-build:
	npm --workspace $(API_DIR) run build

web-build:
	npm --workspace $(WEB_DIR) run build

worker-build:
	$(POWERSHELL) '$(GO_CACHE) $$out = Join-Path $$root "$(WORKER_BINARY)"; go build -o $$out ./cmd/worker'

compose-config:
	$(DOCKER_COMPOSE) config

clean:
	$(POWERSHELL) '$$paths = @("$(API_DIR)/dist", "$(WEB_DIR)/.next", "$(WORKER_DIR)/bin", ".cache"); foreach ($$path in $$paths) { if (Test-Path $$path) { Remove-Item -LiteralPath $$path -Recurse -Force } }'
