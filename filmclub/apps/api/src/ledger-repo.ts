import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { DebtSettlementPayload, FoodOrderPayload } from "@filmclub/shared";
import { pool } from "./db.js";
import { listClubMembers } from "./auth-membership-repo.js";
import { isValidPayloadForEntity } from "./proposal-payload.js";

interface ClubBalanceRow {
  user_id: string;
  currency: string;
  net_amount: string;
}

const toCents = (amount: number) => Math.round(amount * 100);
const toAmount = (cents: number) => Number((cents / 100).toFixed(2));

const splitCents = (totalCents: number, count: number) => {
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
};

const isMemberTx = async (client: PoolClient, clubId: string, userId: string) => {
  const result = await client.query<{ count: string }>(
    `
    SELECT COUNT(*)::text AS count
    FROM club_memberships
    WHERE club_id = $1 AND user_id = $2
    `,
    [clubId, userId]
  );
  return Number(result.rows[0]?.count ?? "0") > 0;
};

export const applyApprovedFoodOrderProposal = async (
  client: PoolClient,
  params: {
    proposalId: string;
    clubId: string;
    proposerUserId: string;
    payload: unknown;
  }
) => {
  if (!isValidPayloadForEntity("food_order", params.payload)) {
    return { error: "invalid_payload" as const };
  }

  const input = params.payload as FoodOrderPayload;
  const participantIds = Array.from(
    new Set(
      (input.participantUserIds ?? input.participantShares?.map((share) => share.userId) ?? [])
        .map((id: string) => id.trim())
        .filter(Boolean)
    )
  );
  if (participantIds.length === 0 && !input.participantShares) {
    return { error: "participants_required" as const };
  }
  const existingResult = await client.query<{ id: string }>(
    `SELECT id FROM food_orders WHERE proposed_change_id = $1`,
    [params.proposalId]
  );
  if (existingResult.rows[0]) {
    return { data: { id: existingResult.rows[0].id } };
  }

  const isPayerMember = await isMemberTx(client, params.clubId, input.payerUserId);
  if (!isPayerMember) {
    return { error: "payer_not_member" as const };
  }
  for (const userId of participantIds) {
    const member = await isMemberTx(client, params.clubId, userId);
    if (!member) {
      return { error: "participant_not_member" as const };
    }
  }

  const totalCents = toCents(input.totalCost);
  if (totalCents < 0) {
    return { error: "invalid_total" as const };
  }
  const sharesByUserId = new Map<string, number>();
  if (Array.isArray(input.participantShares) && input.participantShares.length > 0) {
    for (const share of input.participantShares) {
      sharesByUserId.set(share.userId, toCents(share.amount));
    }
  } else {
    const shares = splitCents(totalCents, participantIds.length);
    for (let index = 0; index < participantIds.length; index += 1) {
      sharesByUserId.set(participantIds[index], shares[index]);
    }
  }
  const foodOrderId = randomUUID();
  const createdAt = new Date().toISOString();

  await client.query(
    `
    INSERT INTO food_orders (
      id, proposed_change_id, club_id, vendor, total_cost, currency, payer_user_id, created_by_user_id, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      foodOrderId,
      params.proposalId,
      params.clubId,
      input.vendor,
      input.totalCost.toFixed(2),
      input.currency.toUpperCase(),
      input.payerUserId,
      params.proposerUserId,
      createdAt
    ]
  );

  for (const userId of participantIds) {
    await client.query(
      `
      INSERT INTO food_order_participants (food_order_id, user_id)
      VALUES ($1, $2)
      `,
      [foodOrderId, userId]
    );
  }

  for (const [debtorUserId, cents] of sharesByUserId.entries()) {
    const share = toAmount(cents);
    if (debtorUserId === input.payerUserId || share === 0) {
      continue;
    }
    await client.query(
      `
      INSERT INTO ledger_entries (
        id, club_id, food_order_id, from_user_id, to_user_id, amount, currency, note, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        randomUUID(),
        params.clubId,
        foodOrderId,
        debtorUserId,
        input.payerUserId,
        share.toFixed(2),
        input.currency.toUpperCase(),
        `Food order split: ${input.vendor}`,
        createdAt
      ]
    );
  }

  return { data: { id: foodOrderId } };
};

export const applyApprovedDebtSettlementProposal = async (
  client: PoolClient,
  params: {
    proposalId: string;
    clubId: string;
    proposerUserId: string;
    payload: unknown;
  }
) => {
  if (!isValidPayloadForEntity("debt_settlement", params.payload)) {
    return { error: "invalid_payload" as const };
  }
  const input = params.payload as DebtSettlementPayload;
  const existingResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ledger_entries WHERE note = $1`,
    [`Settlement proposal: ${params.proposalId}`]
  );
  if (Number(existingResult.rows[0]?.count ?? "0") > 0) {
    return { data: { id: params.proposalId } };
  }
  const isFromMember = await isMemberTx(client, params.clubId, input.fromUserId);
  const isToMember = await isMemberTx(client, params.clubId, input.toUserId);
  if (!isFromMember || !isToMember) {
    return { error: "participant_not_member" as const };
  }

  await client.query(
    `
    INSERT INTO ledger_entries (
      id, club_id, food_order_id, from_user_id, to_user_id, amount, currency, note, created_at
    )
    VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8)
    `,
    [
      randomUUID(),
      params.clubId,
      input.toUserId,
      input.fromUserId,
      input.amount.toFixed(2),
      input.currency.toUpperCase(),
      `Settlement proposal: ${params.proposalId}${input.note ? ` (${input.note})` : ""}`,
      new Date().toISOString()
    ]
  );

  return { data: { id: params.proposalId } };
};

export const listClubBalances = async (clubId: string, currency?: string) => {
  const params: string[] = [clubId];
  let currencySql = "";
  if (currency) {
    params.push(currency.toUpperCase());
    currencySql = "AND currency = $2";
  }

  const result = await pool.query<ClubBalanceRow>(
    `
    SELECT user_id, currency, SUM(net)::text AS net_amount
    FROM (
      SELECT to_user_id AS user_id, currency, amount::numeric AS net
      FROM ledger_entries
      WHERE club_id = $1 ${currencySql}
      UNION ALL
      SELECT from_user_id AS user_id, currency, (amount::numeric * -1) AS net
      FROM ledger_entries
      WHERE club_id = $1 ${currencySql}
    ) movement
    GROUP BY user_id, currency
    ORDER BY currency, user_id
    `,
    params
  );

  const members = await listClubMembers(clubId);
  const byUserCurrency = new Map<string, number>();
  for (const row of result.rows) {
    byUserCurrency.set(`${row.user_id}:${row.currency}`, Number(row.net_amount));
  }

  const currencies = currency ? [currency.toUpperCase()] : Array.from(new Set(result.rows.map((row) => row.currency)));
  if (currencies.length === 0) {
    return members.map((member) => ({
      userId: member.user.id,
      displayName: member.user.displayName,
      currency: "EUR",
      netAmount: 0
    }));
  }

  const balances: Array<{ userId: string; displayName: string; currency: string; netAmount: number }> = [];
  for (const member of members) {
    for (const curr of currencies) {
      const net = byUserCurrency.get(`${member.user.id}:${curr}`) ?? 0;
      balances.push({
        userId: member.user.id,
        displayName: member.user.displayName,
        currency: curr,
        netAmount: Number(net.toFixed(2))
      });
    }
  }
  return balances;
};

export const listClubBalanceSummary = async (clubId: string, currency?: string) => {
  const balances = await listClubBalances(clubId, currency);
  return balances.map((balance) => ({
    userId: balance.userId,
    displayName: balance.displayName,
    currency: balance.currency,
    owes: balance.netAmount < 0 ? Number(Math.abs(balance.netAmount).toFixed(2)) : 0,
    owed: balance.netAmount > 0 ? Number(balance.netAmount.toFixed(2)) : 0
  }));
};

export const listClubDebtMatrix = async (clubId: string, currency?: string) => {
  const params: string[] = [clubId];
  let currencySql = "";
  if (currency) {
    params.push(currency.toUpperCase());
    currencySql = "AND currency = $2";
  }
  const result = await pool.query<{ from_user_id: string; to_user_id: string; currency: string; amount: string }>(
    `
    SELECT from_user_id, to_user_id, currency, SUM(amount)::text AS amount
    FROM ledger_entries
    WHERE club_id = $1 ${currencySql}
    GROUP BY from_user_id, to_user_id, currency
    HAVING SUM(amount) > 0
    ORDER BY currency, from_user_id, to_user_id
    `,
    params
  );

  const members = await listClubMembers(clubId);
  const nameById = new Map(members.map((member) => [member.user.id, member.user.displayName]));
  const rawRows = result.rows.map((row) => ({
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    currency: row.currency,
    amount: Number(Number(row.amount).toFixed(2))
  }));
  const netMap = new Map<string, number>();
  for (const row of rawRows) {
    const forwardKey = `${row.fromUserId}|${row.toUserId}|${row.currency}`;
    const reverseKey = `${row.toUserId}|${row.fromUserId}|${row.currency}`;
    const reverse = netMap.get(reverseKey) ?? 0;
    if (reverse > 0) {
      const diff = reverse - row.amount;
      if (diff > 0) {
        netMap.set(reverseKey, Number(diff.toFixed(2)));
      } else if (diff < 0) {
        netMap.delete(reverseKey);
        netMap.set(forwardKey, Number(Math.abs(diff).toFixed(2)));
      } else {
        netMap.delete(reverseKey);
      }
    } else {
      netMap.set(forwardKey, Number(((netMap.get(forwardKey) ?? 0) + row.amount).toFixed(2)));
    }
  }
  const matrix: Array<{
    fromUserId: string;
    fromDisplayName: string;
    toUserId: string;
    toDisplayName: string;
    currency: string;
    amount: number;
  }> = [];
  for (const [key, amount] of netMap.entries()) {
    if (amount <= 0) {
      continue;
    }
    const [fromUserId, toUserId, curr] = key.split("|");
    matrix.push({
      fromUserId,
      fromDisplayName: nameById.get(fromUserId) ?? fromUserId,
      toUserId,
      toDisplayName: nameById.get(toUserId) ?? toUserId,
      currency: curr,
      amount: Number(amount.toFixed(2))
    });
  }
  return matrix;
};
