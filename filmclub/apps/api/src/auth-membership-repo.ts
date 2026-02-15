import { randomUUID } from "node:crypto";
import type { ApprovalPolicy, Club, ClubMembership, User } from "@filmclub/shared";
import { pool } from "./db.js";

interface DbClubRow {
  id: string;
  name: string;
  join_code: string;
  approval_mode: ApprovalPolicy["mode"];
  required_approvals: number | null;
  created_by_user_id: string;
  created_at: string;
}

interface DbMembershipRow {
  id: string;
  club_id: string;
  user_id: string;
  role: ClubMembership["role"];
  joined_at: string;
}

interface DbUserRow {
  id: string;
  display_name: string;
  created_at: string;
}

interface DbClubMembershipRow extends DbClubRow {
  membership_id: string;
  club_id: string;
  user_id: string;
  role: ClubMembership["role"];
  joined_at: string;
}

const mapUser = (row: DbUserRow): User => ({
  id: row.id,
  displayName: row.display_name,
  createdAt: row.created_at
});

const mapClub = (row: DbClubRow): Club => ({
  id: row.id,
  name: row.name,
  joinCode: row.join_code,
  approvalPolicy: {
    mode: row.approval_mode,
    requiredApprovals: row.required_approvals ?? undefined
  },
  createdByUserId: row.created_by_user_id,
  createdAt: row.created_at
});

const mapMembership = (row: DbMembershipRow): ClubMembership => ({
  id: row.id,
  clubId: row.club_id,
  userId: row.user_id,
  role: row.role,
  joinedAt: row.joined_at
});

const makeJoinCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const sessionTtlDays = Number(process.env.SESSION_TTL_DAYS ?? "30");

export const createUser = async (displayName: string) => {
  const createdAt = new Date().toISOString();
  const id = randomUUID();
  const query = `
    INSERT INTO users (id, display_name, created_at)
    VALUES ($1, $2, $3)
    RETURNING id, display_name, created_at
  `;
  const result = await pool.query<DbUserRow>(query, [id, displayName, createdAt]);
  return mapUser(result.rows[0]);
};

export const findUserByDisplayName = async (displayName: string) => {
  const result = await pool.query<DbUserRow>(
    `SELECT id, display_name, created_at FROM users WHERE lower(display_name) = lower($1)`,
    [displayName]
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
};

export const createSession = async (userId: string) => {
  const token = randomUUID();
  const createdAt = new Date().toISOString();
  const ttlMs = Math.max(1, sessionTtlDays) * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await pool.query(`INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)`, [
    token,
    userId,
    createdAt,
    expiresAt
  ]);
  return { token, createdAt, expiresAt };
};

export const findUserBySessionToken = async (token: string) => {
  const query = `
    SELECT u.id, u.display_name, u.created_at
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token = $1
      AND s.expires_at > NOW()
  `;
  const result = await pool.query<DbUserRow>(query, [token]);
  return result.rows[0] ? mapUser(result.rows[0]) : null;
};

export const deleteSessionByToken = async (token: string) => {
  await pool.query(`DELETE FROM sessions WHERE token = $1`, [token]);
};

export const createClubForUser = async (name: string, policy: ApprovalPolicy, ownerUserId: string) => {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  let createdClub: Club | null = null;
  for (let attempt = 0; attempt < 8 && !createdClub; attempt += 1) {
    const joinCode = makeJoinCode();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const clubResult = await client.query<DbClubRow>(
        `
        INSERT INTO clubs (
          id, name, join_code, approval_mode, required_approvals, created_by_user_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, name, join_code, approval_mode, required_approvals, created_by_user_id, created_at
        `,
        [id, name, joinCode, policy.mode, policy.requiredApprovals ?? null, ownerUserId, createdAt]
      );
      const membershipId = randomUUID();
      await client.query(
        `
        INSERT INTO club_memberships (id, club_id, user_id, role, joined_at)
        VALUES ($1, $2, $3, 'owner', $4)
        `,
        [membershipId, id, ownerUserId, createdAt]
      );
      await client.query("COMMIT");
      createdClub = mapClub(clubResult.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      const pgError = error as { code?: string };
      if (pgError.code !== "23505") {
        throw error;
      }
    } finally {
      client.release();
    }
  }
  if (!createdClub) {
    throw new Error("Could not generate a unique join code");
  }
  return createdClub;
};

export const findClubByJoinCode = async (joinCode: string) => {
  const result = await pool.query<DbClubRow>(
    `
    SELECT id, name, join_code, approval_mode, required_approvals, created_by_user_id, created_at
    FROM clubs
    WHERE join_code = $1
    `,
    [joinCode]
  );
  return result.rows[0] ? mapClub(result.rows[0]) : null;
};

export const findClubById = async (clubId: string) => {
  const result = await pool.query<DbClubRow>(
    `
    SELECT id, name, join_code, approval_mode, required_approvals, created_by_user_id, created_at
    FROM clubs
    WHERE id = $1
    `,
    [clubId]
  );
  return result.rows[0] ? mapClub(result.rows[0]) : null;
};

export const findMembership = async (clubId: string, userId: string) => {
  const result = await pool.query<DbMembershipRow>(
    `
    SELECT id, club_id, user_id, role, joined_at
    FROM club_memberships
    WHERE club_id = $1 AND user_id = $2
    `,
    [clubId, userId]
  );
  return result.rows[0] ? mapMembership(result.rows[0]) : null;
};

export const addMembership = async (clubId: string, userId: string) => {
  const membership = await findMembership(clubId, userId);
  if (membership) {
    return membership;
  }
  const id = randomUUID();
  const joinedAt = new Date().toISOString();
  const result = await pool.query<DbMembershipRow>(
    `
    INSERT INTO club_memberships (id, club_id, user_id, role, joined_at)
    VALUES ($1, $2, $3, 'member', $4)
    RETURNING id, club_id, user_id, role, joined_at
    `,
    [id, clubId, userId, joinedAt]
  );
  return mapMembership(result.rows[0]);
};

export const listMembershipsForUser = async (userId: string) => {
  const result = await pool.query<DbMembershipRow>(
    `
    SELECT id, club_id, user_id, role, joined_at
    FROM club_memberships
    WHERE user_id = $1
    `,
    [userId]
  );
  return result.rows.map(mapMembership);
};

export const listClubsForUser = async (userId: string) => {
  const result = await pool.query<DbClubMembershipRow>(
    `
    SELECT
      c.id,
      c.name,
      c.join_code,
      c.approval_mode,
      c.required_approvals,
      c.created_by_user_id,
      c.created_at,
      m.id AS membership_id,
      m.club_id,
      m.user_id,
      m.role,
      m.joined_at
    FROM club_memberships m
    INNER JOIN clubs c ON c.id = m.club_id
    WHERE m.user_id = $1
    `,
    [userId]
  );
  return result.rows.map((row) => ({
    club: mapClub(row),
    membership: mapMembership({
      id: row.membership_id,
      club_id: row.club_id,
      user_id: row.user_id,
      role: row.role,
      joined_at: row.joined_at
    })
  }));
};

export const listClubMembers = async (clubId: string) => {
  const result = await pool.query<
    DbMembershipRow & {
      display_name: string;
      user_created_at: string;
    }
  >(
    `
    SELECT
      m.id,
      m.club_id,
      m.user_id,
      m.role,
      m.joined_at,
      u.display_name,
      u.created_at AS user_created_at
    FROM club_memberships m
    INNER JOIN users u ON u.id = m.user_id
    WHERE m.club_id = $1
    `,
    [clubId]
  );
  return result.rows.map((row) => ({
    user: {
      id: row.user_id,
      displayName: row.display_name,
      createdAt: row.user_created_at
    },
    membership: mapMembership(row)
  }));
};

export const isMemberOfClub = async (clubId: string, userId: string) => {
  const membership = await findMembership(clubId, userId);
  return membership !== null;
};

export const countClubMembers = async (clubId: string) => {
  const result = await pool.query<{ count: string }>(
    `
    SELECT COUNT(*)::text AS count
    FROM club_memberships
    WHERE club_id = $1
    `,
    [clubId]
  );
  return Number(result.rows[0]?.count ?? "0");
};
