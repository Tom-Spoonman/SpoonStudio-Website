# Recommended Architecture

## Why this architecture
Your app has collaborative state, financial-like records, and approval workflows. That needs:
- Strong relational data integrity
- Clear backend business logic
- Auditable event history
- A UX that works quickly on mobile

## Recommended baseline
1. Frontend:
   - Next.js (App Router) web app
   - Server-side rendering for dashboard/history pages
   - Client components for interactive propose/approve flows
2. Backend:
   - Fastify API service
   - Domain modules: Auth, Members, Events, Orders, Ledger, Ratings, Approvals
   - Bearer token session auth for local/dev (migrate to managed auth provider in production)
3. Database:
   - PostgreSQL as source of truth
   - Event/outbox table for audit trail and future notifications
4. Cache/async:
   - Redis for short-lived caching, rate limits, and background jobs later

## Domain model recommendation
Core entities:
- `user`
- `club`
- `club_membership`
- `movie_night`
- `movie_watch_record`
- `food_order`
- `ledger_entry`
- `rating`
- `proposed_change`
- `change_vote`
- `committed_change_log`

Trust-confirmation workflow:
1. Create `proposed_change` in `pending`.
2. Collect `change_vote` rows from eligible members.
3. Evaluate policy (majority/unanimous/configured threshold).
4. If passed, apply mutation in a transaction and write `committed_change_log`.
5. If failed/expired, mark proposal as rejected/expired.

## Deployment recommendation for spoon.studio
1. Web:
   - Deploy `apps/web` under `filmclub.spoon.studio` (confirmed target).
2. API:
   - Deploy `apps/api` as separate service (e.g., `api-filmclub.spoon.studio`).
3. Database:
   - Managed PostgreSQL (Neon/Supabase/RDS/Fly Postgres).
4. Secrets/config:
   - Environment variables in hosting platform, not in repo.

## Security baseline
1. Authentication: OAuth or magic-link email for low-friction group access.
2. Authorization: row-level checks by `club_id` and member role.
3. Ledger integrity: append-only ledger entries; avoid in-place mutation.
4. Auditability: preserve proposal and vote history even after commit.

## Suggested near-term implementation order
1. Auth + club membership
2. Movie-night record CRUD through proposal/approval
3. Food order + debt ledger
4. Ratings + history dashboard
5. Notifications (optional)

## Auth + Membership implementation slice (current)
Implemented in API (PostgreSQL-backed):
1. `POST /v1/auth/register` -> create user + return bearer token
2. `POST /v1/auth/login` -> login existing user by display name + return token
3. `GET /v1/me` -> resolve current user from bearer token
4. `POST /v1/clubs` -> create club with per-club approval policy and generated join code
5. `POST /v1/clubs/join` -> self-join by join code
6. `GET /v1/me/clubs` -> list clubs current user belongs to
7. `GET /v1/clubs/:clubId/members` -> list members for a club (member-only access)

Current tradeoff:
- Auth/membership data is durable.
- Proposal, vote, and commit-log entities are now persisted.
- Single-member clubs are auto-resolved at proposal creation due zero eligible non-proposer voters.
- Debt ledger currently supports equal-split food orders and per-member net balances only.
- Food-order custom split and settlement-on-approval are supported; dedicated settlement UI is still pending.
