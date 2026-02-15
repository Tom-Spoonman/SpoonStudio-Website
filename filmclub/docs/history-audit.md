# History and Audit Trail

## Scope
This slice adds a per-club audit timeline for proposal lifecycle visibility.

## Endpoint
`GET /v1/clubs/:clubId/history?limit=100`

Authorization:
- `Authorization: Bearer <token>`

Access rule:
- Caller must be a member of the club.

## Response shape
Each item contains:
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
