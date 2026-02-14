# Auth and Club Membership API (Phase 1)

This documents the first working slice for authentication and multi-club membership.

## Notes
1. Auth and membership entities are persisted in PostgreSQL (`users`, `sessions`, `clubs`, `club_memberships`).
2. API startup runs idempotent table migrations in `apps/api/src/db.ts`.
3. Auth is bearer token session auth intended for development speed.
4. Proposed changes are still in-memory in phase 1 and will move to DB in the trust-confirmation phase.

## Endpoints

### Register
`POST /v1/auth/register`

Body:
```json
{
  "displayName": "Tom"
}
```

Response:
```json
{
  "token": "<bearer-token>",
  "user": {
    "id": "uuid",
    "displayName": "Tom",
    "createdAt": "2026-02-14T23:00:00.000Z"
  }
}
```

### Login
`POST /v1/auth/login`

Body:
```json
{
  "displayName": "Tom"
}
```

### Who am I
`GET /v1/me`

Header:
`Authorization: Bearer <token>`

### Create club
`POST /v1/clubs`

Header:
`Authorization: Bearer <token>`

Body examples:

Unanimous:
```json
{
  "name": "Friday Filmclub",
  "approvalPolicy": {
    "mode": "unanimous"
  }
}
```

Majority:
```json
{
  "name": "Friday Filmclub",
  "approvalPolicy": {
    "mode": "majority"
  }
}
```

Fixed threshold:
```json
{
  "name": "Friday Filmclub",
  "approvalPolicy": {
    "mode": "fixed",
    "requiredApprovals": 3
  }
}
```

### Join club (self-join code)
`POST /v1/clubs/join`

Header:
`Authorization: Bearer <token>`

Body:
```json
{
  "joinCode": "AB12CD"
}
```

### List my clubs
`GET /v1/me/clubs`

Header:
`Authorization: Bearer <token>`

### List members of a club
`GET /v1/clubs/:clubId/members`

Header:
`Authorization: Bearer <token>`

Access rule:
- Caller must be a member of the target club.

## Next step toward production
1. Move users/sessions/clubs/memberships to PostgreSQL.
2. Replace display-name login with magic-link or OAuth.
3. Hash/rotate join codes and add optional expiry/revocation.
