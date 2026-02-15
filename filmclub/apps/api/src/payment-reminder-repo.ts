import { randomUUID } from "node:crypto";
import { pool } from "./db.js";

interface DbReminderRow {
  id: string;
  club_id: string;
  from_user_id: string;
  from_display_name: string;
  to_user_id: string;
  to_display_name: string;
  currency: string;
  outstanding_amount: string;
  reminder_amount: string;
  note: string | null;
  created_at: string;
}

const toUpperCurrency = (value: string) => value.trim().toUpperCase();

const getOutstandingBetweenUsers = async (clubId: string, debtorUserId: string, creditorUserId: string, currency: string) => {
  const result = await pool.query<{ outstanding: string }>(
    `
    SELECT (
      COALESCE(
        (
          SELECT SUM(amount)::numeric
          FROM ledger_entries
          WHERE club_id = $1
            AND from_user_id = $2
            AND to_user_id = $3
            AND currency = $4
        ),
        0
      ) - COALESCE(
        (
          SELECT SUM(amount)::numeric
          FROM ledger_entries
          WHERE club_id = $1
            AND from_user_id = $3
            AND to_user_id = $2
            AND currency = $4
        ),
        0
      )
    )::text AS outstanding
    `,
    [clubId, debtorUserId, creditorUserId, currency]
  );
  return Number(result.rows[0]?.outstanding ?? "0");
};

const isClubMember = async (clubId: string, userId: string) => {
  const result = await pool.query<{ count: string }>(
    `
    SELECT COUNT(*)::text AS count
    FROM club_memberships
    WHERE club_id = $1 AND user_id = $2
    `,
    [clubId, userId]
  );
  return Number(result.rows[0]?.count ?? "0") > 0;
};

const mapReminder = (row: DbReminderRow) => ({
  id: row.id,
  clubId: row.club_id,
  fromUserId: row.from_user_id,
  fromDisplayName: row.from_display_name,
  toUserId: row.to_user_id,
  toDisplayName: row.to_display_name,
  currency: row.currency,
  outstandingAmount: Number(Number(row.outstanding_amount).toFixed(2)),
  reminderAmount: Number(Number(row.reminder_amount).toFixed(2)),
  note: row.note ?? undefined,
  createdAt: row.created_at
});

export const createPaymentReminder = async (params: {
  clubId: string;
  fromUserId: string;
  toUserId: string;
  currency: string;
  amount?: number;
  note?: string;
}) => {
  if (params.fromUserId === params.toUserId) {
    return { error: "self_reminder_not_allowed" as const };
  }
  const currency = toUpperCurrency(params.currency);
  const [fromMember, toMember] = await Promise.all([
    isClubMember(params.clubId, params.fromUserId),
    isClubMember(params.clubId, params.toUserId)
  ]);
  if (!fromMember || !toMember) {
    return { error: "participant_not_member" as const };
  }

  const outstanding = Number((await getOutstandingBetweenUsers(params.clubId, params.toUserId, params.fromUserId, currency)).toFixed(2));
  if (outstanding <= 0) {
    return { error: "no_outstanding_debt" as const };
  }
  const reminderAmount = params.amount === undefined ? outstanding : Number(params.amount.toFixed(2));
  if (!Number.isFinite(reminderAmount) || reminderAmount <= 0) {
    return { error: "invalid_amount" as const };
  }
  if (reminderAmount - outstanding > 0.0001) {
    return { error: "amount_exceeds_outstanding" as const };
  }

  const createdAt = new Date().toISOString();
  const insertResult = await pool.query<DbReminderRow>(
    `
    INSERT INTO payment_reminders (
      id, club_id, from_user_id, to_user_id, currency, outstanding_amount, reminder_amount, note, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING
      id,
      club_id,
      from_user_id,
      to_user_id,
      currency,
      outstanding_amount::text,
      reminder_amount::text,
      note,
      created_at,
      ''::text AS from_display_name,
      ''::text AS to_display_name
    `,
    [
      randomUUID(),
      params.clubId,
      params.fromUserId,
      params.toUserId,
      currency,
      outstanding.toFixed(2),
      reminderAmount.toFixed(2),
      params.note?.trim() || null,
      createdAt
    ]
  );
  const inserted = insertResult.rows[0];
  const namesResult = await pool.query<{ from_display_name: string; to_display_name: string }>(
    `
    SELECT
      from_user.display_name AS from_display_name,
      to_user.display_name AS to_display_name
    FROM users from_user, users to_user
    WHERE from_user.id = $1 AND to_user.id = $2
    `,
    [params.fromUserId, params.toUserId]
  );
  const names = namesResult.rows[0];
  return {
    data: mapReminder({
      ...inserted,
      from_display_name: names?.from_display_name ?? params.fromUserId,
      to_display_name: names?.to_display_name ?? params.toUserId
    })
  };
};

export const listPaymentRemindersForClub = async (
  clubId: string,
  options: { limit?: number; offset?: number; toUserId?: string } = {}
) => {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const offset = Math.max(0, options.offset ?? 0);
  const values: Array<string | number> = [clubId];
  const whereParts = ["r.club_id = $1"];
  let idx = 2;
  if (options.toUserId) {
    whereParts.push(`r.to_user_id = $${idx}`);
    values.push(options.toUserId);
    idx += 1;
  }
  const whereClause = whereParts.join(" AND ");
  const totalResult = await pool.query<{ count: string }>(
    `
    SELECT COUNT(*)::text AS count
    FROM payment_reminders r
    WHERE ${whereClause}
    `,
    values
  );
  const total = Number(totalResult.rows[0]?.count ?? "0");
  const rowsResult = await pool.query<DbReminderRow>(
    `
    SELECT
      r.id,
      r.club_id,
      r.from_user_id,
      from_user.display_name AS from_display_name,
      r.to_user_id,
      to_user.display_name AS to_display_name,
      r.currency,
      r.outstanding_amount::text,
      r.reminder_amount::text,
      r.note,
      r.created_at
    FROM payment_reminders r
    INNER JOIN users from_user ON from_user.id = r.from_user_id
    INNER JOIN users to_user ON to_user.id = r.to_user_id
    WHERE ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT $${idx}
    OFFSET $${idx + 1}
    `,
    [...values, limit, offset]
  );
  return {
    items: rowsResult.rows.map(mapReminder),
    total,
    limit,
    offset
  };
};
