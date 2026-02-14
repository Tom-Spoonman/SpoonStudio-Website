# Trust Confirmation (Phase 2)

This phase moves proposal and voting workflow to PostgreSQL and applies per-club approval policy.

## Data model
Tables added:
1. `proposed_changes`
2. `change_votes`
3. `committed_change_logs`

Status lifecycle:
1. `pending`
2. `approved`
3. `rejected`

## Policy behavior
The vote evaluator uses the club's `approvalPolicy`:

1. `unanimous`
- All eligible non-proposer members must approve.
- Any reject vote resolves to `rejected`.

2. `majority`
- Approvals must reach `floor(eligibleVoters / 2) + 1`.
- Rejections at the same threshold resolve to `rejected`.

3. `fixed`
- Approvals must reach `requiredApprovals`.
- Proposal resolves to `rejected` when it becomes impossible to reach the requirement with remaining votes.

## API behavior
Endpoints:
1. `POST /v1/proposed-changes`
2. `GET /v1/proposed-changes` (supports `clubId` and `status`)
3. `GET /v1/proposed-changes/:id` (includes vote list)
4. `POST /v1/proposed-changes/:id/approve`
5. `POST /v1/proposed-changes/:id/reject`

Rules:
1. Caller must be a member of the target club.
2. Proposer cannot vote on their own proposal.
3. One vote per member per proposal.
4. Approved proposals are written to `committed_change_logs`.

## Edge-case behavior
For single-member clubs, proposal status is evaluated immediately on creation and resolves without requiring a vote (no eligible non-proposer voters exist).
