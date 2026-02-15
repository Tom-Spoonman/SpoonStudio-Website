import { randomUUID } from "node:crypto";
import type {
  ApprovalPolicy,
  ChangeVote,
  ChangeVoteDecision,
  PendingChangeStatus,
  ProposedChange,
  ProposedChangeWithVotes,
  RecordEntity
} from "@filmclub/shared";
import { pool } from "./db.js";
import { applyApprovedDebtSettlementProposal, applyApprovedFoodOrderProposal } from "./ledger-repo.js";
import {
  applyMeetingCompleteProposal,
  applyMeetingScheduleProposal,
  applyMeetingStartProposal,
  applyMeetingUpdateProposal
} from "./meeting-repo.js";

interface DbProposedChangeRow {
  id: string;
  club_id: string;
  entity: RecordEntity;
  payload: unknown;
  proposer_user_id: string;
  status: PendingChangeStatus;
  created_at: string;
  resolved_at: string | null;
}

interface DbVoteRow {
  id: string;
  proposed_change_id: string;
  voter_user_id: string;
  decision: ChangeVoteDecision;
  created_at: string;
}

const mapProposedChange = (row: DbProposedChangeRow): ProposedChange => ({
  id: row.id,
  clubId: row.club_id,
  entity: row.entity,
  payload: row.payload,
  proposerUserId: row.proposer_user_id,
  status: row.status,
  createdAt: row.created_at,
  resolvedAt: row.resolved_at ?? undefined
});

const mapVote = (row: DbVoteRow): ChangeVote => ({
  id: row.id,
  proposedChangeId: row.proposed_change_id,
  voterUserId: row.voter_user_id,
  decision: row.decision,
  createdAt: row.created_at
});

const getNextStatus = (
  policy: ApprovalPolicy,
  approvals: number,
  rejections: number,
  eligibleVoterCount: number
): PendingChangeStatus => {
  if (eligibleVoterCount === 0) {
    return "approved";
  }
  if (policy.mode === "unanimous") {
    if (approvals >= eligibleVoterCount) {
      return "approved";
    }
    if (rejections > 0) {
      return "rejected";
    }
    return "pending";
  }
  if (policy.mode === "majority") {
    const threshold = Math.floor(eligibleVoterCount / 2) + 1;
    if (approvals >= threshold) {
      return "approved";
    }
    if (rejections >= threshold) {
      return "rejected";
    }
    return "pending";
  }
  const required = policy.requiredApprovals ?? 1;
  if (approvals >= required) {
    return "approved";
  }
  const remaining = eligibleVoterCount - approvals - rejections;
  if (approvals + remaining < required) {
    return "rejected";
  }
  return "pending";
};

const applyProposalSideEffects = async (
  params: {
    proposal: ProposedChange;
  },
  client: import("pg").PoolClient
) => {
  if (params.proposal.entity === "food_order") {
    const applied = await applyApprovedFoodOrderProposal(client, {
      proposalId: params.proposal.id,
      clubId: params.proposal.clubId,
      proposerUserId: params.proposal.proposerUserId,
      payload: params.proposal.payload
    });
    if ("error" in applied) {
      return applied;
    }
  }
  if (params.proposal.entity === "debt_settlement") {
    const applied = await applyApprovedDebtSettlementProposal(client, {
      proposalId: params.proposal.id,
      clubId: params.proposal.clubId,
      proposerUserId: params.proposal.proposerUserId,
      payload: params.proposal.payload
    });
    if ("error" in applied) {
      return applied;
    }
  }
  if (params.proposal.entity === "meeting_schedule") {
    const applied = await applyMeetingScheduleProposal(client, {
      clubId: params.proposal.clubId,
      proposerUserId: params.proposal.proposerUserId,
      payload: params.proposal.payload
    });
    if ("error" in applied) {
      return applied;
    }
  }
  if (params.proposal.entity === "meeting_update") {
    const applied = await applyMeetingUpdateProposal(client, {
      clubId: params.proposal.clubId,
      payload: params.proposal.payload
    });
    if ("error" in applied) {
      return applied;
    }
  }
  if (params.proposal.entity === "meeting_start") {
    const applied = await applyMeetingStartProposal(client, {
      clubId: params.proposal.clubId,
      payload: params.proposal.payload
    });
    if ("error" in applied) {
      return applied;
    }
  }
  if (params.proposal.entity === "meeting_complete") {
    const applied = await applyMeetingCompleteProposal(client, {
      clubId: params.proposal.clubId,
      payload: params.proposal.payload
    });
    if ("error" in applied) {
      return applied;
    }
  }
  return { ok: true as const };
};

export const createProposedChange = async (params: {
  clubId: string;
  entity: RecordEntity;
  payload: unknown;
  proposerUserId: string;
}) => {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const result = await pool.query<DbProposedChangeRow>(
    `
    INSERT INTO proposed_changes (id, club_id, entity, payload, proposer_user_id, status, created_at)
    VALUES ($1, $2, $3, $4::jsonb, $5, 'pending', $6)
    RETURNING id, club_id, entity, payload, proposer_user_id, status, created_at, resolved_at
    `,
    [id, params.clubId, params.entity, JSON.stringify(params.payload ?? {}), params.proposerUserId, createdAt]
  );
  return mapProposedChange(result.rows[0]);
};

export const listProposedChangesForClub = async (clubId: string, status?: PendingChangeStatus) => {
  const result = status
    ? await pool.query<DbProposedChangeRow>(
        `
        SELECT id, club_id, entity, payload, proposer_user_id, status, created_at, resolved_at
        FROM proposed_changes
        WHERE club_id = $1 AND status = $2
        ORDER BY created_at DESC
        `,
        [clubId, status]
      )
    : await pool.query<DbProposedChangeRow>(
        `
        SELECT id, club_id, entity, payload, proposer_user_id, status, created_at, resolved_at
        FROM proposed_changes
        WHERE club_id = $1
        ORDER BY created_at DESC
        `,
        [clubId]
      );
  return result.rows.map(mapProposedChange);
};

export const listProposedChangesForClubs = async (clubIds: string[], status?: PendingChangeStatus) => {
  if (clubIds.length === 0) {
    return [];
  }
  const result = status
    ? await pool.query<DbProposedChangeRow>(
        `
        SELECT id, club_id, entity, payload, proposer_user_id, status, created_at, resolved_at
        FROM proposed_changes
        WHERE club_id = ANY($1::uuid[]) AND status = $2
        ORDER BY created_at DESC
        `,
        [clubIds, status]
      )
    : await pool.query<DbProposedChangeRow>(
        `
        SELECT id, club_id, entity, payload, proposer_user_id, status, created_at, resolved_at
        FROM proposed_changes
        WHERE club_id = ANY($1::uuid[])
        ORDER BY created_at DESC
        `,
        [clubIds]
      );
  return result.rows.map(mapProposedChange);
};

export const getProposedChangeById = async (id: string) => {
  const result = await pool.query<DbProposedChangeRow>(
    `
    SELECT id, club_id, entity, payload, proposer_user_id, status, created_at, resolved_at
    FROM proposed_changes
    WHERE id = $1
    `,
    [id]
  );
  return result.rows[0] ? mapProposedChange(result.rows[0]) : null;
};

export const listVotesForChange = async (proposedChangeId: string) => {
  const result = await pool.query<DbVoteRow>(
    `
    SELECT id, proposed_change_id, voter_user_id, decision, created_at
    FROM change_votes
    WHERE proposed_change_id = $1
    ORDER BY created_at ASC
    `,
    [proposedChangeId]
  );
  return result.rows.map(mapVote);
};

export const getProposedChangeWithVotes = async (id: string): Promise<ProposedChangeWithVotes | null> => {
  const proposal = await getProposedChangeById(id);
  if (!proposal) {
    return null;
  }
  const votes = await listVotesForChange(id);
  return { proposal, votes };
};

export const castVoteAndEvaluate = async (params: {
  proposalId: string;
  voterUserId: string;
  decision: ChangeVoteDecision;
  clubPolicy: ApprovalPolicy;
}) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const proposalResult = await client.query<DbProposedChangeRow>(
      `
      SELECT id, club_id, entity, payload, proposer_user_id, status, created_at, resolved_at
      FROM proposed_changes
      WHERE id = $1
      FOR UPDATE
      `,
      [params.proposalId]
    );
    if (!proposalResult.rows[0]) {
      await client.query("ROLLBACK");
      return { error: "not_found" as const };
    }
    const proposal = mapProposedChange(proposalResult.rows[0]);
    if (proposal.status !== "pending") {
      await client.query("ROLLBACK");
      return { error: "already_resolved" as const };
    }
    if (proposal.proposerUserId === params.voterUserId) {
      await client.query("ROLLBACK");
      return { error: "proposer_cannot_vote" as const };
    }
    try {
      await client.query(
        `
        INSERT INTO change_votes (id, proposed_change_id, voter_user_id, decision, created_at)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [randomUUID(), proposal.id, params.voterUserId, params.decision, new Date().toISOString()]
      );
    } catch (error) {
      const pgError = error as { code?: string };
      if (pgError.code === "23505") {
        await client.query("ROLLBACK");
        return { error: "already_voted" as const };
      }
      throw error;
    }

    const voteCountResult = await client.query<{ approvals: string; rejections: string }>(
      `
      SELECT
        COUNT(*) FILTER (WHERE decision = 'approve')::text AS approvals,
        COUNT(*) FILTER (WHERE decision = 'reject')::text AS rejections
      FROM change_votes
      WHERE proposed_change_id = $1
      `,
      [proposal.id]
    );

    const approvals = Number(voteCountResult.rows[0]?.approvals ?? "0");
    const rejections = Number(voteCountResult.rows[0]?.rejections ?? "0");
    const memberCountResult = await client.query<{ count: string }>(
      `
      SELECT COUNT(*)::text AS count
      FROM club_memberships
      WHERE club_id = $1
      `,
      [proposal.clubId]
    );
    const memberCount = Number(memberCountResult.rows[0]?.count ?? "0");
    const eligibleVoterCount = Math.max(memberCount - 1, 0);

    const status = getNextStatus(params.clubPolicy, approvals, rejections, eligibleVoterCount);
    if (status !== "pending") {
      if (status === "approved") {
        const sideEffectResult = await applyProposalSideEffects({ proposal }, client);
        if ("error" in sideEffectResult) {
          await client.query("ROLLBACK");
          return { error: "invalid_execution_payload" as const };
        }
      }
      await client.query(
        `
        UPDATE proposed_changes
        SET status = $1, resolved_at = $2
        WHERE id = $3
        `,
        [status, new Date().toISOString(), proposal.id]
      );
      if (status === "approved") {
        await client.query(
          `
          INSERT INTO committed_change_logs (id, proposed_change_id, committed_at, committed_by_user_id)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (proposed_change_id) DO NOTHING
          `,
          [randomUUID(), proposal.id, new Date().toISOString(), params.voterUserId]
        );
      }
    }

    await client.query("COMMIT");
    const withVotes = await getProposedChangeWithVotes(proposal.id);
    if (!withVotes) {
      return { error: "not_found" as const };
    }
    return { data: withVotes };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const evaluateProposalStatus = async (params: {
  proposalId: string;
  clubPolicy: ApprovalPolicy;
  actorUserId: string;
}) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const proposalResult = await client.query<DbProposedChangeRow>(
      `
      SELECT id, club_id, entity, payload, proposer_user_id, status, created_at, resolved_at
      FROM proposed_changes
      WHERE id = $1
      FOR UPDATE
      `,
      [params.proposalId]
    );
    if (!proposalResult.rows[0]) {
      await client.query("ROLLBACK");
      return { error: "not_found" as const };
    }
    const proposal = mapProposedChange(proposalResult.rows[0]);
    if (proposal.status !== "pending") {
      await client.query("ROLLBACK");
      const existing = await getProposedChangeWithVotes(proposal.id);
      if (!existing) {
        return { error: "not_found" as const };
      }
      return { data: existing };
    }

    const voteCountResult = await client.query<{ approvals: string; rejections: string }>(
      `
      SELECT
        COUNT(*) FILTER (WHERE decision = 'approve')::text AS approvals,
        COUNT(*) FILTER (WHERE decision = 'reject')::text AS rejections
      FROM change_votes
      WHERE proposed_change_id = $1
      `,
      [proposal.id]
    );
    const approvals = Number(voteCountResult.rows[0]?.approvals ?? "0");
    const rejections = Number(voteCountResult.rows[0]?.rejections ?? "0");
    const memberCountResult = await client.query<{ count: string }>(
      `
      SELECT COUNT(*)::text AS count
      FROM club_memberships
      WHERE club_id = $1
      `,
      [proposal.clubId]
    );
    const memberCount = Number(memberCountResult.rows[0]?.count ?? "0");
    const eligibleVoterCount = Math.max(memberCount - 1, 0);
    const status = getNextStatus(params.clubPolicy, approvals, rejections, eligibleVoterCount);

    if (status !== "pending") {
      if (status === "approved") {
        const sideEffectResult = await applyProposalSideEffects({ proposal }, client);
        if ("error" in sideEffectResult) {
          await client.query("ROLLBACK");
          return { error: "invalid_execution_payload" as const };
        }
      }
      await client.query(
        `
        UPDATE proposed_changes
        SET status = $1, resolved_at = $2
        WHERE id = $3
        `,
        [status, new Date().toISOString(), proposal.id]
      );
      if (status === "approved") {
        await client.query(
          `
          INSERT INTO committed_change_logs (id, proposed_change_id, committed_at, committed_by_user_id)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (proposed_change_id) DO NOTHING
          `,
          [randomUUID(), proposal.id, new Date().toISOString(), params.actorUserId]
        );
      }
    }

    await client.query("COMMIT");
    const withVotes = await getProposedChangeWithVotes(proposal.id);
    if (!withVotes) {
      return { error: "not_found" as const };
    }
    return { data: withVotes };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
