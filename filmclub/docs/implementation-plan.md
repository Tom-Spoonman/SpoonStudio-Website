# Filmclub Implementation Plan

## Agreed sequence
1. Persist Auth/Membership in PostgreSQL.
2. Implement trust-confirmation core (`proposed_change`, `change_vote`, `committed_change_log`).
3. Build first UI flow (auth, club create/join/switch, proposals view).
4. Add debt ledger foundations (balances first).
5. Hardening and documentation updates each slice.

## Step 1 scope (in progress)
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
