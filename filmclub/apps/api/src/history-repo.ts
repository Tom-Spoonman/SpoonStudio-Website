import type { ChangeVoteDecision, PendingChangeStatus, RecordEntity } from "@filmclub/shared";
import { pool } from "./db.js";

interface DbHistoryRow {
  proposal_id: string;
  club_id: string;
  entity: RecordEntity;
  payload: unknown;
  proposer_user_id: string;
  proposer_display_name: string;
  status: PendingChangeStatus;
  created_at: string;
  resolved_at: string | null;
  committed_at: string | null;
  committed_by_user_id: string | null;
  committed_by_display_name: string | null;
}

interface DbVoteRow {
  proposal_id: string;
  vote_id: string;
  voter_user_id: string;
  voter_display_name: string;
  decision: ChangeVoteDecision;
  created_at: string;
}

export interface ClubHistoryVote {
  id: string;
  voterUserId: string;
  voterDisplayName: string;
  decision: ChangeVoteDecision;
  createdAt: string;
}

export interface ClubHistoryItem {
  proposalId: string;
  clubId: string;
  entity: RecordEntity;
  payload: unknown;
  proposerUserId: string;
  proposerDisplayName: string;
  status: PendingChangeStatus;
  createdAt: string;
  resolvedAt?: string;
  committedAt?: string;
  committedByUserId?: string;
  committedByDisplayName?: string;
  votes: ClubHistoryVote[];
}

export const listClubHistory = async (clubId: string, limit = 50): Promise<ClubHistoryItem[]> => {
  const sanitizedLimit = Math.max(1, Math.min(limit, 200));
  const historyResult = await pool.query<DbHistoryRow>(
    `
    SELECT
      p.id AS proposal_id,
      p.club_id,
      p.entity,
      p.payload,
      p.proposer_user_id,
      proposer.display_name AS proposer_display_name,
      p.status,
      p.created_at,
      p.resolved_at,
      c.committed_at,
      c.committed_by_user_id,
      committer.display_name AS committed_by_display_name
    FROM proposed_changes p
    INNER JOIN users proposer ON proposer.id = p.proposer_user_id
    LEFT JOIN committed_change_logs c ON c.proposed_change_id = p.id
    LEFT JOIN users committer ON committer.id = c.committed_by_user_id
    WHERE p.club_id = $1
    ORDER BY p.created_at DESC
    LIMIT $2
    `,
    [clubId, sanitizedLimit]
  );

  const proposalIds = historyResult.rows.map((row) => row.proposal_id);
  const votesByProposal = new Map<string, ClubHistoryVote[]>();
  if (proposalIds.length > 0) {
    const voteResult = await pool.query<DbVoteRow>(
      `
      SELECT
        v.proposed_change_id AS proposal_id,
        v.id AS vote_id,
        v.voter_user_id,
        u.display_name AS voter_display_name,
        v.decision,
        v.created_at
      FROM change_votes v
      INNER JOIN users u ON u.id = v.voter_user_id
      WHERE v.proposed_change_id = ANY($1::uuid[])
      ORDER BY v.created_at ASC
      `,
      [proposalIds]
    );
    for (const row of voteResult.rows) {
      const current = votesByProposal.get(row.proposal_id) ?? [];
      current.push({
        id: row.vote_id,
        voterUserId: row.voter_user_id,
        voterDisplayName: row.voter_display_name,
        decision: row.decision,
        createdAt: row.created_at
      });
      votesByProposal.set(row.proposal_id, current);
    }
  }

  return historyResult.rows.map((row) => ({
    proposalId: row.proposal_id,
    clubId: row.club_id,
    entity: row.entity,
    payload: row.payload,
    proposerUserId: row.proposer_user_id,
    proposerDisplayName: row.proposer_display_name,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
    committedAt: row.committed_at ?? undefined,
    committedByUserId: row.committed_by_user_id ?? undefined,
    committedByDisplayName: row.committed_by_display_name ?? undefined,
    votes: votesByProposal.get(row.proposal_id) ?? []
  }));
};
