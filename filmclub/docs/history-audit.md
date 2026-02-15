# History and Audit Trail

## Scope
This slice adds a per-club audit timeline for proposal lifecycle visibility.

## Endpoint
`GET /v1/clubs/:clubId/history`

Query params:
1. `status` (`pending|approved|rejected`)
2. `entity` (`movie_watch|food_order|attendance|debt_settlement`)
3. `from` (ISO datetime)
4. `to` (ISO datetime)
5. `limit` (1-200)
6. `offset` (0+)

Authorization:
- `Authorization: Bearer <token>`

Access rule:
- Caller must be a member of the club.

## Response shape
Envelope:
1. `items`
2. `total`
3. `limit`
4. `offset`

Each `items[]` entry contains:
1. Proposal metadata (`proposalId`, `entity`, `payload`, `status`, timestamps).
2. Proposer identity (`proposerUserId`, `proposerDisplayName`).
3. Commit metadata when approved (`committedAt`, `committedByUserId`, `committedByDisplayName`).
4. Vote list with voter names and decisions.

## UI
The club workspace now includes a History card that renders:
1. Entity + proposer + created timestamp.
2. Status + commit metadata.
3. Payload preview.
4. Vote trail.
5. Filters and pagination controls.
6. Deep-link action to open the proposal view directly.
