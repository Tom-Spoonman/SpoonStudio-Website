# UI Flow (Step 3)

## Scope
This UI slice provides a working web interface for:
1. Register/login
2. Club creation and join-by-code
3. Club selection
4. Proposal creation
5. Proposal list/filter/detail
6. Approve/reject voting

## Current implementation
Location:
- `apps/web/app/page.tsx`

Behavior:
1. Auth token is stored in browser `localStorage` (`filmclub_token`).
2. API calls include `Authorization: Bearer <token>`.
3. Club context is selected from "My Clubs".
4. Proposal creation now uses typed form inputs per entity type.
5. Logout triggers server-side session invalidation (`POST /v1/auth/logout`) before local token cleanup.

## Tradeoffs
1. Single-page implementation to move quickly through workflow validation.
2. No dedicated routing yet (`/login`, `/clubs/:id`, etc.).
3. Debt-settlement now uses member selectors loaded from club memberships.
4. Attendance now uses member multi-select sourced from club memberships.

## Next UI improvements
1. Split into routes/components (`/auth`, `/clubs`, `/clubs/:id/proposals`).
2. Add richer attendance UX (searchable picker/chips) instead of native multi-select.
3. Replace local token storage with more secure session handling.
