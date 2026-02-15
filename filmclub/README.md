# Filmclub App

Starter development environment for the Filmclub companion web app.

## Stack
- Frontend: Next.js 15 + React + TypeScript (`apps/web`)
- Backend API: Fastify + TypeScript (`apps/api`)
- Shared contracts/types: TypeScript package (`packages/shared`)
- Data: PostgreSQL (Docker)
- Caching/queues (future): Redis (Docker)

## Prerequisites
- Node.js 20+
- npm 10+
- Docker Desktop

## Quick start
1. Copy env files:
   - `cp .env.example .env` (PowerShell: `Copy-Item .env.example .env`)
2. Start local infrastructure:
   - `docker compose up -d`
3. Install dependencies:
   - `npm install`
4. Run all apps:
   - `npm run dev`

## Workspace scripts
- `npm run dev` - Runs web and API in parallel
- `npm run dev:web` - Runs Next.js app on `http://localhost:3000`
- `npm run dev:api` - Runs API on `http://localhost:4000`
- `npm run build` - Builds all workspaces
- `npm run typecheck` - Type-checks all workspaces
- `npm run test --workspace @filmclub/api` - Runs API integration tests

## Documentation
- Requirements: `docs/requirements.md`
- Architecture recommendation: `docs/architecture.md`
- Auth + membership API (phase 1): `docs/auth-membership.md`
- Implementation plan: `docs/implementation-plan.md`
- Trust confirmation (phase 2): `docs/trust-confirmation.md`
- UI flow (step 3): `docs/ui-flow.md`
- Debt ledger foundations (step 4): `docs/debt-ledger.md`
- History and audit trail: `docs/history-audit.md`

## Suggested deployment split
- `spoon.studio/filmclub` or `filmclub.spoon.studio` -> deploy `apps/web`
- API (`apps/api`) -> deploy as separate service (e.g., Fly.io, Railway, Render, or VPS)
- Managed PostgreSQL for production

## Local Postgres note
- This project maps Postgres to host port `55432` to avoid conflicts with local PostgreSQL installations on `5432`.
