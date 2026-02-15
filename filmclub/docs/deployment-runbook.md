# Deployment Runbook (`filmclub.spoon.studio`)

## Scope
This runbook defines a first production deployment path for:
1. Web app (`apps/web`) at `filmclub.spoon.studio`
2. API service (`apps/api`) on a separate runtime
3. Managed PostgreSQL

For self-hosting on Windows instead of managed infra, use:
- `docs/self-host-windows-cloudflare.md`

## Required environment variables
### Web
1. `NEXT_PUBLIC_API_BASE_URL` (public API base URL)
2. Template: `env/web.production.example`

### API
1. `DATABASE_URL` (managed PostgreSQL connection string)
2. `CORS_ORIGIN` (`https://filmclub.spoon.studio`)
3. `SESSION_TTL_DAYS` (for example `30`)
4. `PORT` or `API_PORT` (platform-specific)
5. Template: `env/api.production.example`

## Pre-deploy checks
1. Migrations run successfully in target DB.
2. API health endpoint returns `ok`.
3. CORS allows only expected origins.
4. Approval policy updates and proposal voting flows verified.
5. History filters and pagination verified.

## Release sequence
1. Deploy API build.
2. Run API startup migrations.
3. Verify `/health` and key auth/proposal endpoints.
4. Deploy web build with production API URL.
5. Validate end-to-end flow:
   - login/register
   - club create/join
   - proposal create/vote
   - history view/filter/deep-link

## Rollback sequence
1. Roll back web deployment first (if UI regression only).
2. Roll back API deployment if API regression is confirmed.
3. Keep DB schema backward compatible for at least one release.

## Post-deploy smoke checklist
1. Register and login work.
2. Existing session still resolves `/v1/me`.
3. Club settings update policy and guardrails enforce limits.
4. Food order proposal approval updates balances.
5. History endpoint responds with filtered and paginated data.

## Automated smoke script
Run from repo root after API/web are deployed:
```powershell
powershell -ExecutionPolicy Bypass -File .\filmclub\scripts\smoke-staging.ps1 `
  -ApiBaseUrl "https://api.filmclub.spoon.studio" `
  -WebBaseUrl "https://filmclub.spoon.studio"
```
