.PHONY: up up-logs down logs test lint typecheck build db-migrate db-seed worker-test

up:
	docker compose up --build -d

up-logs:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

test:
	npm test
	powershell -NoProfile -Command '$$root = (Get-Location).Path; $$cache = Join-Path $$root ".cache/go-build-codex"; $$modcache = Join-Path $$root ".cache/go-mod-codex"; New-Item -ItemType Directory -Path $$cache -Force | Out-Null; New-Item -ItemType Directory -Path $$modcache -Force | Out-Null; $$env:GOCACHE = $$cache; $$env:GOMODCACHE = $$modcache; Set-Location apps/worker; go test ./...'

lint:
	npm run lint

typecheck:
	npm run typecheck

build:
	npm run build
	powershell -NoProfile -Command '$$root = (Get-Location).Path; $$cache = Join-Path $$root ".cache/go-build-codex"; $$modcache = Join-Path $$root ".cache/go-mod-codex"; $$out = Join-Path $$root ".cache/turnoflow-worker.exe"; New-Item -ItemType Directory -Path $$cache -Force | Out-Null; New-Item -ItemType Directory -Path $$modcache -Force | Out-Null; $$env:GOCACHE = $$cache; $$env:GOMODCACHE = $$modcache; Set-Location apps/worker; go build -o $$out ./cmd/worker'

db-migrate:
	powershell -NoProfile -Command '$$envFile = Join-Path (Get-Location).Path ".env"; if (Test-Path $$envFile) { Get-Content $$envFile | Where-Object { $$_ -and -not $$_.TrimStart().StartsWith("#") } | ForEach-Object { $$parts = $$_.Split("=", 2); if ($$parts.Length -eq 2) { [Environment]::SetEnvironmentVariable($$parts[0], $$parts[1], "Process") } } }; npm.cmd --workspace apps/api run prisma:migrate:deploy'

db-seed:
	powershell -NoProfile -Command '$$envFile = Join-Path (Get-Location).Path ".env"; if (Test-Path $$envFile) { Get-Content $$envFile | Where-Object { $$_ -and -not $$_.TrimStart().StartsWith("#") } | ForEach-Object { $$parts = $$_.Split("=", 2); if ($$parts.Length -eq 2) { [Environment]::SetEnvironmentVariable($$parts[0], $$parts[1], "Process") } } }; npm.cmd --workspace apps/api run prisma:seed'

worker-test:
	powershell -NoProfile -Command '$$root = (Get-Location).Path; $$cache = Join-Path $$root ".cache/go-build-codex"; $$modcache = Join-Path $$root ".cache/go-mod-codex"; New-Item -ItemType Directory -Path $$cache -Force | Out-Null; New-Item -ItemType Directory -Path $$modcache -Force | Out-Null; $$env:GOCACHE = $$cache; $$env:GOMODCACHE = $$modcache; Set-Location apps/worker; go test ./...'
