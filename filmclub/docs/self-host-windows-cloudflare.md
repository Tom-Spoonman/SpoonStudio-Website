# Self-Host on Windows + Cloudflare Tunnel

## Goal
Run the Filmclub stack on your own Windows machine with:
1. Local PostgreSQL (Docker)
2. Local API and web processes (PM2)
3. Public HTTPS access through Cloudflare Tunnel

## Prerequisites
1. Node.js 20+
2. npm
3. Docker Desktop
4. Cloudflare account with DNS for `spoon.studio`
5. `cloudflared` installed and available in `PATH`
6. PM2 installed globally:
```powershell
npm install -g pm2
```

## 1) Configure production env files
1. API template: `env/api.production.example`
2. Web template: `env/web.production.example`
3. Cloudflare config template: `env/cloudflared.config.example.yml`

Create local production env files:
1. `apps/api/.env.production`
2. `apps/web/.env.production`

Minimum API values:
1. `DATABASE_URL`
2. `CORS_ORIGIN=https://filmclub.spoon.studio`
3. `API_PORT=4000`
4. `SESSION_TTL_DAYS=30`

Minimum web values:
1. `NEXT_PUBLIC_API_BASE_URL=https://api.spoon.studio`

## 2) Start local app stack
From repo root:
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\selfhost\windows\start-app-stack.ps1
```

What this does:
1. Runs preflight checks (`preflight.ps1`)
2. Starts local Postgres container
3. Installs deps and builds (unless `-SkipBuild`)
4. Starts API + web in PM2 via `ecosystem.config.cjs`

Optional startup flags:
1. `-SkipBuild`
2. `-SkipPreflight`

Check process status:
```powershell
pm2 status
pm2 logs filmclub-api
pm2 logs filmclub-web
```

Run preflight manually:
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\selfhost\windows\preflight.ps1
```

## 3) Configure Cloudflare Tunnel
Option A (assisted script):
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\selfhost\windows\setup-cloudflare-tunnel.ps1 `
  -TunnelName "filmclub" `
  -WebHostname "filmclub.spoon.studio" `
  -ApiHostname "api.spoon.studio"
```

Then:
1. Copy `env/cloudflared.config.example.yml` to `%USERPROFILE%\.cloudflared\config.yml`
2. Replace `<TUNNEL_UUID>` and `<USER>`
3. Start tunnel:
```powershell
cloudflared tunnel run filmclub
```

Optional: install as Windows service:
```powershell
cloudflared service install
```

Service mode management (recommended for always-on host):
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\selfhost\windows\manage-cloudflared-service.ps1 -Action install
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\selfhost\windows\manage-cloudflared-service.ps1 -Action start
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\selfhost\windows\manage-cloudflared-service.ps1 -Action status
```

Troubleshooting:
1. If logs show `dial tcp [::1]:3000 ... actively refused`, set ingress services to `127.0.0.1` instead of `localhost`.
2. Confirm local origins respond before testing public hostnames:
```powershell
Invoke-WebRequest http://127.0.0.1:3000
Invoke-WebRequest http://127.0.0.1:4000/health
```
3. If PM2 logs show `NPM.CMD` parsed as JavaScript (`Unexpected token ':'`), ensure `ecosystem.config.cjs` uses `script: "npm.cmd"` with `interpreter: "none"`.
4. If PM2 start shows `Process failed to launch spawn EINVAL`, use `cmd.exe /c npm ...` launch form in `ecosystem.config.cjs` (already set in this repo).
5. If PM2 logs repeatedly show `NPM.CMD` parsing errors, bypass npm in PM2 and run direct Node entrypoints (`apps/api/dist/index.js` and `apps/web/node_modules/next/dist/bin/next start`).

## 4) Validate deployment
Run:
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\smoke-staging.ps1 `
  -ApiBaseUrl "https://api.spoon.studio" `
  -WebBaseUrl "https://filmclub.spoon.studio"
```

## 5) Stop local stack
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\selfhost\windows\stop-app-stack.ps1
```

## 6) Restart local stack
One-command restart (stop -> start):
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\selfhost\windows\restart-app-stack.ps1
```

Optional flags:
1. `-SkipBuild`
2. `-SkipPreflight`

## Notes
1. This is cost-free but uptime depends on your machine and home network.
2. Keep Windows updates/reboots in mind when planning availability.
3. Add regular Postgres backups before using this for important records.

## Daily operations
Run these from repo root `SpoonStudio-Website`.

### Morning startup
1. Start app stack:
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\selfhost\windows\start-app-stack.ps1
```
2. Confirm local services:
```powershell
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:3000
```
3. Start tunnel in a dedicated terminal:
```powershell
cloudflared tunnel run filmclub
```
4. Confirm public health:
```powershell
curl https://api.spoon.studio/health
```

### Health checks during operation
1. One-command stack check:
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\selfhost\windows\check-stack.ps1
```
2. Process status:
```powershell
pm2 status
```
3. API logs:
```powershell
pm2 logs filmclub-api --lines 100
```
4. Web logs:
```powershell
pm2 logs filmclub-web --lines 100
```
5. End-to-end smoke:
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\smoke-staging.ps1 `
  -ApiBaseUrl "https://api.spoon.studio" `
  -WebBaseUrl "https://filmclub.spoon.studio"
```

### Graceful shutdown
1. Stop tunnel terminal or service.
2. Stop app stack:
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\selfhost\windows\stop-app-stack.ps1
```

### Restart
Use the wrapper:
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\selfhost\windows\restart-app-stack.ps1 -SkipBuild
```

## Incident checklist
### API down
1. Check PM2:
```powershell
pm2 status
pm2 logs filmclub-api --lines 200
```
2. Check local health:
```powershell
curl http://127.0.0.1:4000/health
```
3. Restart API:
```powershell
pm2 restart filmclub-api --update-env
```
4. If still failing, run full restart:
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\selfhost\windows\stop-app-stack.ps1
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\selfhost\windows\start-app-stack.ps1
```

### Web down
1. Check PM2 and logs:
```powershell
pm2 status
pm2 logs filmclub-web --lines 200
```
2. Check local web:
```powershell
curl http://127.0.0.1:3000
```
3. Restart web:
```powershell
pm2 restart filmclub-web --update-env
```

### Tunnel down or public 502/SSL issues
1. Check local services first (`127.0.0.1:3000`, `127.0.0.1:4000/health`).
2. Validate DNS:
```powershell
nslookup filmclub.spoon.studio
nslookup api.spoon.studio
```
3. Restart tunnel process:
```powershell
cloudflared tunnel run filmclub
```
4. Confirm ingress in `%USERPROFILE%\.cloudflared\config.yml` points to `127.0.0.1` (not `localhost`).
5. If using service mode, check service status:
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\selfhost\windows\manage-cloudflared-service.ps1 -Action status
```

## Backups and restore
### Create a backup
Use the backup script:
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\selfhost\windows\backup-postgres.ps1
```

Optional parameters:
1. `-BackupRoot "C:\path\to\backups"`
2. `-RetentionDays 30`
3. `-ContainerName filmclub-postgres`
4. `-PgUser filmclub`
5. `-PgDatabase filmclub`

Backups are stored as PostgreSQL custom-format `.dump` files.

### Verify backup health
Check if latest backup is recent and large enough:
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\selfhost\windows\verify-backup.ps1
```

Optional verification parameters:
1. `-BackupRoot "C:\path\to\backups"`
2. `-MaxAgeHours 30`
3. `-MinSizeBytes 10240`

### Suggested schedule
1. Open Windows Task Scheduler.
2. Create a daily task running:
```powershell
powershell -ExecutionPolicy Bypass -File <REPO_ROOT>\filmclub\scripts\selfhost\windows\backup-postgres.ps1
```
3. Run as the same user that has Docker access.

### Restore from backup
Use the restore script:
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\selfhost\windows\restore-postgres.ps1 `
  -BackupFile ".\filmclub\backups\postgres\<backup-file>.dump" `
  -Force
```

Optional restore parameters:
1. `-SkipApiStop`
2. `-ContainerName filmclub-postgres`
3. `-PgUser filmclub`
4. `-PgDatabase filmclub`

### Restore verification flow
1. Check API health:
```powershell
curl http://127.0.0.1:4000/health
```
2. Run smoke test:
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\smoke-staging.ps1 `
  -ApiBaseUrl "https://api.spoon.studio" `
  -WebBaseUrl "https://filmclub.spoon.studio"
```

## Release checklist command
Run all release checks in sequence:
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\selfhost\windows\release-check.ps1
```

Options:
1. `-SkipSmoke`
2. `-ApiBaseUrl "https://api.spoon.studio"`
3. `-WebBaseUrl "https://filmclub.spoon.studio"`

