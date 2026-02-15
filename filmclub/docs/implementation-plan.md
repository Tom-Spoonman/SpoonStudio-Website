# Filmclub Implementation Plan

## Agreed sequence
1. Persist Auth/Membership in PostgreSQL.
2. Implement trust-confirmation core (`proposed_change`, `change_vote`, `committed_change_log`).
3. Build first UI flow (auth, club create/join/switch, proposals view).
4. Add debt ledger foundations (balances first).
5. Hardening and documentation updates each slice.

## Step 1 scope (completed)
1. Add DB schema/migrations for:
   - `users`
   - `sessions`
   - `clubs`
   - `club_memberships`
2. Replace in-memory auth/membership state in API with PostgreSQL queries.
3. Keep current API contracts stable for register/login/club membership endpoints.
4. Keep `proposed-change` feature in-memory for now, but enforce membership checks via DB.

## Done criteria for step 1
1. API can restart without losing users/sessions/clubs/memberships.
2. Existing auth/membership endpoints continue to work.
3. Typecheck passes.

## Step 1 progress notes
1. Added PostgreSQL migration bootstrap in `apps/api/src/db.ts`.
2. Added repository layer in `apps/api/src/auth-membership-repo.ts`.
3. Refactored `apps/api/src/index.ts` auth/membership endpoints to DB-backed queries.

## Step 2 scope (in progress)
1. Add DB schema/migrations for:
   - `proposed_changes`
   - `change_votes`
   - `committed_change_logs`
2. Replace in-memory proposal/voting state with PostgreSQL queries and transactions.
3. Apply per-club approval policy on each vote.
4. Keep API endpoints stable and add details endpoint for proposal + votes.

## Step 2 progress notes
1. Added proposed-change/vote/commit-log tables in API migrations.
2. Added repository logic for proposal creation, voting, and status evaluation.
3. Updated proposal endpoints to PostgreSQL-backed behavior.
4. Added `docs/trust-confirmation.md`.

## Step 3 scope (in progress)
1. Add auth screens (register/login) and session handling in web app.
2. Add club create/join/switch flow.
3. Add proposal create/list/detail/vote flow.
4. Document UI behavior and current tradeoffs.

## Step 3 progress notes
1. Added UI workflow implementation in `apps/web/app/page.tsx`.
2. Added styling/layout support in `apps/web/app/globals.css`.
3. Added `docs/ui-flow.md`.
4. Replaced raw JSON proposal editor with typed per-entity form inputs.
5. Replaced debt-settlement user-id inputs with club-member selectors.
6. Replaced attendance free-text names with club-member multi-select.
7. Added logout endpoint and server-side session invalidation.
8. Added Fastify request schemas for active API endpoints.
9. Added API integration tests for auth/membership and approval-policy outcomes.

## Step 4 scope (in progress)
1. Add DB schema for:
   - `food_orders`
   - `food_order_participants`
   - `ledger_entries`
2. Add API endpoints for food order capture and per-club balance calculation.
3. Add minimal web UI for creating food orders and displaying balances.

## Step 4 progress notes
1. Added ledger tables in API migrations.
2. Added `POST /v1/food-orders`.
3. Added `GET /v1/clubs/:clubId/balances`.
4. Added food order and balances panel in web UI.
5. Enforced trust-confirmation: food orders are applied to ledger only after proposal approval.
6. Added custom split support for food orders.
7. Added `GET /v1/clubs/:clubId/balance-overview` with net/summary/matrix data.
8. Added debt-settlement side effects on approved proposals.

## Step 5 scope (in progress)
1. Reduce frontend complexity by extracting client workflow component.
2. Prepare future route split by isolating page wrapper and app logic.

## Step 5 progress notes
1. Extracted workflow into `apps/web/app/FilmclubClient.tsx`.
2. Simplified `apps/web/app/page.tsx` to a thin wrapper component.
3. Added owner-only club settings flow to update approval policy (`PUT /v1/clubs/:clubId/approval-policy`).
4. Added route split for `/auth`, `/clubs`, `/clubs/:clubId`, `/clubs/:clubId/proposals`.
5. Added club history endpoint and UI audit timeline (`GET /v1/clubs/:clubId/history`).
6. Added policy guardrails in settings (fixed-threshold eligibility check + pending-proposal warning).
7. Added history filters, pagination, and proposal deep-link navigation.
8. Split major UI sections into reusable components (`ClubSettingsCard`, `ProposalsPanel`, `HistoryCard`).
9. Added reusable UI hooks for history controls and policy guardrail state.
10. Hardened API with history date-range validation and policy guardrail error codes.
11. Added DB indexes for proposal/vote history query performance.
12. Added production env templates and staging smoke script (`scripts/smoke-staging.ps1`).
13. Added self-host Windows + Cloudflare tunnel docs and automation scripts.
