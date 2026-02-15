import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "./app.js";
import { pool, runMigrations } from "./db.js";

const resetDatabase = async () => {
  await pool.query(`
    TRUNCATE TABLE
      committed_change_logs,
      change_votes,
      proposed_changes,
      club_memberships,
      clubs,
      sessions,
      users
    RESTART IDENTITY CASCADE;
  `);
};

const uniqueName = (base: string) => `${base}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

const register = async (app: ReturnType<typeof createApp>, displayName: string) => {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: { displayName }
  });
  assert.equal(response.statusCode, 201);
  const body = response.json() as { token: string; user: { id: string } };
  return body;
};

const createClub = async (
  app: ReturnType<typeof createApp>,
  token: string,
  name: string,
  approvalPolicy: { mode: "unanimous" | "majority" | "fixed"; requiredApprovals?: number }
) => {
  const response = await app.inject({
    method: "POST",
    url: "/v1/clubs",
    headers: { Authorization: `Bearer ${token}` },
    payload: { name, approvalPolicy }
  });
  assert.equal(response.statusCode, 201);
  return response.json() as { club: { id: string; joinCode: string } };
};

const joinClub = async (app: ReturnType<typeof createApp>, token: string, joinCode: string) => {
  const response = await app.inject({
    method: "POST",
    url: "/v1/clubs/join",
    headers: { Authorization: `Bearer ${token}` },
    payload: { joinCode }
  });
  assert.equal(response.statusCode, 200);
};

const updateClubApprovalPolicy = async (
  app: ReturnType<typeof createApp>,
  token: string,
  clubId: string,
  approvalPolicy: { mode: "unanimous" | "majority" | "fixed"; requiredApprovals?: number }
) => {
  const response = await app.inject({
    method: "PUT",
    url: `/v1/clubs/${clubId}/approval-policy`,
    headers: { Authorization: `Bearer ${token}` },
    payload: { approvalPolicy }
  });
  assert.equal(response.statusCode, 200);
  return response.json() as { club: { approvalPolicy: { mode: string; requiredApprovals?: number } } };
};

const createProposal = async (app: ReturnType<typeof createApp>, token: string, clubId: string) => {
  const response = await app.inject({
    method: "POST",
    url: "/v1/proposed-changes",
    headers: { Authorization: `Bearer ${token}` },
    payload: {
      clubId,
      entity: "movie_watch",
      payload: { title: "Blade Runner", watchedOn: "2026-02-15" }
    }
  });
  assert.equal(response.statusCode, 201);
  return response.json() as { id: string; status: string };
};

const getProposal = async (app: ReturnType<typeof createApp>, token: string, proposalId: string) => {
  const response = await app.inject({
    method: "GET",
    url: `/v1/proposed-changes/${proposalId}`,
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(response.statusCode, 200);
  return response.json() as { proposal: { status: string }; votes: Array<{ decision: string }> };
};

const createFoodOrder = async (
  app: ReturnType<typeof createApp>,
  token: string,
  input: {
    clubId: string;
    vendor: string;
    totalCost: number;
    currency: string;
    payerUserId: string;
    participantUserIds?: string[];
    participantShares?: Array<{ userId: string; amount: number }>;
  }
) => {
  const response = await app.inject({
    method: "POST",
    url: "/v1/food-orders",
    headers: { Authorization: `Bearer ${token}` },
    payload: input
  });
  assert.equal(response.statusCode, 201);
  return response.json() as { id: string; status: string };
};

test.before(async () => {
  await runMigrations();
});

test.beforeEach(async () => {
  await resetDatabase();
});

test.after(async () => {
  await pool.end();
});

test("auth + membership flow creates and joins club", async () => {
  const app = createApp();
  await app.ready();
  try {
    const alice = await register(app, uniqueName("alice"));
    const createdClub = await createClub(app, alice.token, "Friday Club", { mode: "majority" });
    const bob = await register(app, uniqueName("bob"));
    await joinClub(app, bob.token, createdClub.club.joinCode);

    const membersResponse = await app.inject({
      method: "GET",
      url: `/v1/clubs/${createdClub.club.id}/members`,
      headers: { Authorization: `Bearer ${alice.token}` }
    });
    assert.equal(membersResponse.statusCode, 200);
    const members = membersResponse.json() as Array<{ user: { id: string } }>;
    assert.equal(members.length, 2);
  } finally {
    await app.close();
  }
});

test("club owner can update approval policy", async () => {
  const app = createApp();
  await app.ready();
  try {
    const alice = await register(app, uniqueName("alice"));
    const createdClub = await createClub(app, alice.token, "Settings Club", { mode: "majority" });
    const updated = await updateClubApprovalPolicy(app, alice.token, createdClub.club.id, {
      mode: "unanimous"
    });
    assert.equal(updated.club.approvalPolicy.mode, "unanimous");
    assert.equal(updated.club.approvalPolicy.requiredApprovals, undefined);
  } finally {
    await app.close();
  }
});

test("policy update affects thresholds for subsequent proposals", async () => {
  const app = createApp();
  await app.ready();
  try {
    const alice = await register(app, uniqueName("alice"));
    const club = await createClub(app, alice.token, "Policy Change Club", { mode: "majority" });
    const bob = await register(app, uniqueName("bob"));
    const carol = await register(app, uniqueName("carol"));
    await joinClub(app, bob.token, club.club.joinCode);
    await joinClub(app, carol.token, club.club.joinCode);

    const firstProposal = await createProposal(app, alice.token, club.club.id);
    const approveFirst = await app.inject({
      method: "POST",
      url: `/v1/proposed-changes/${firstProposal.id}/approve`,
      headers: { Authorization: `Bearer ${bob.token}` }
    });
    assert.equal(approveFirst.statusCode, 200);
    const firstDetails = await getProposal(app, alice.token, firstProposal.id);
    assert.equal(firstDetails.proposal.status, "pending");

    const updated = await updateClubApprovalPolicy(app, alice.token, club.club.id, {
      mode: "fixed",
      requiredApprovals: 1
    });
    assert.equal(updated.club.approvalPolicy.mode, "fixed");
    assert.equal(updated.club.approvalPolicy.requiredApprovals, 1);

    const secondProposal = await createProposal(app, alice.token, club.club.id);
    const approveSecond = await app.inject({
      method: "POST",
      url: `/v1/proposed-changes/${secondProposal.id}/approve`,
      headers: { Authorization: `Bearer ${bob.token}` }
    });
    assert.equal(approveSecond.statusCode, 200);
    const secondDetails = await getProposal(app, alice.token, secondProposal.id);
    assert.equal(secondDetails.proposal.status, "approved");
  } finally {
    await app.close();
  }
});

test("non-owner member cannot update approval policy", async () => {
  const app = createApp();
  await app.ready();
  try {
    const alice = await register(app, uniqueName("alice"));
    const createdClub = await createClub(app, alice.token, "Settings Club", { mode: "majority" });
    const bob = await register(app, uniqueName("bob"));
    await joinClub(app, bob.token, createdClub.club.joinCode);

    const response = await app.inject({
      method: "PUT",
      url: `/v1/clubs/${createdClub.club.id}/approval-policy`,
      headers: { Authorization: `Bearer ${bob.token}` },
      payload: {
        approvalPolicy: {
          mode: "unanimous"
        }
      }
    });
    assert.equal(response.statusCode, 403);
  } finally {
    await app.close();
  }
});

test("owner cannot set fixed approvals above eligible voter count", async () => {
  const app = createApp();
  await app.ready();
  try {
    const alice = await register(app, uniqueName("alice"));
    const createdClub = await createClub(app, alice.token, "Guardrail Club", { mode: "majority" });
    const bob = await register(app, uniqueName("bob"));
    await joinClub(app, bob.token, createdClub.club.joinCode);

    const response = await app.inject({
      method: "PUT",
      url: `/v1/clubs/${createdClub.club.id}/approval-policy`,
      headers: { Authorization: `Bearer ${alice.token}` },
      payload: {
        approvalPolicy: {
          mode: "fixed",
          requiredApprovals: 2
        }
      }
    });
    assert.equal(response.statusCode, 400);
    const body = response.json() as { code?: string; details?: { eligibleVoterCount?: number } };
    assert.equal(body.code, "policy_fixed_exceeds_eligible_voters");
    assert.equal(body.details?.eligibleVoterCount, 1);
  } finally {
    await app.close();
  }
});

test("unanimous policy rejects on first reject vote", async () => {
  const app = createApp();
  await app.ready();
  try {
    const alice = await register(app, uniqueName("alice"));
    const createdClub = await createClub(app, alice.token, "Unanimous Club", { mode: "unanimous" });
    const bob = await register(app, uniqueName("bob"));
    await joinClub(app, bob.token, createdClub.club.joinCode);

    const proposal = await createProposal(app, alice.token, createdClub.club.id);
    const rejectResponse = await app.inject({
      method: "POST",
      url: `/v1/proposed-changes/${proposal.id}/reject`,
      headers: { Authorization: `Bearer ${bob.token}` }
    });
    assert.equal(rejectResponse.statusCode, 200);

    const details = await getProposal(app, alice.token, proposal.id);
    assert.equal(details.proposal.status, "rejected");
  } finally {
    await app.close();
  }
});

test("majority policy approves when threshold is reached", async () => {
  const app = createApp();
  await app.ready();
  try {
    const alice = await register(app, uniqueName("alice"));
    const club = await createClub(app, alice.token, "Majority Club", { mode: "majority" });
    const bob = await register(app, uniqueName("bob"));
    const carol = await register(app, uniqueName("carol"));
    const dave = await register(app, uniqueName("dave"));
    await joinClub(app, bob.token, club.club.joinCode);
    await joinClub(app, carol.token, club.club.joinCode);
    await joinClub(app, dave.token, club.club.joinCode);

    const proposal = await createProposal(app, alice.token, club.club.id);
    const approveByBob = await app.inject({
      method: "POST",
      url: `/v1/proposed-changes/${proposal.id}/approve`,
      headers: { Authorization: `Bearer ${bob.token}` }
    });
    assert.equal(approveByBob.statusCode, 200);

    const rejectByCarol = await app.inject({
      method: "POST",
      url: `/v1/proposed-changes/${proposal.id}/reject`,
      headers: { Authorization: `Bearer ${carol.token}` }
    });
    assert.equal(rejectByCarol.statusCode, 200);

    const approveByDave = await app.inject({
      method: "POST",
      url: `/v1/proposed-changes/${proposal.id}/approve`,
      headers: { Authorization: `Bearer ${dave.token}` }
    });
    assert.equal(approveByDave.statusCode, 200);

    const details = await getProposal(app, alice.token, proposal.id);
    assert.equal(details.proposal.status, "approved");
  } finally {
    await app.close();
  }
});

test("fixed policy can reject immediately when requirement is impossible", async () => {
  const app = createApp();
  await app.ready();
  try {
    const alice = await register(app, uniqueName("alice"));
    const club = await createClub(app, alice.token, "Fixed Club", {
      mode: "fixed",
      requiredApprovals: 3
    });
    const bob = await register(app, uniqueName("bob"));
    const carol = await register(app, uniqueName("carol"));
    await joinClub(app, bob.token, club.club.joinCode);
    await joinClub(app, carol.token, club.club.joinCode);

    const proposal = await createProposal(app, alice.token, club.club.id);
    assert.equal(proposal.status, "rejected");
  } finally {
    await app.close();
  }
});

test("food order creates ledger and balances per member", async () => {
  const app = createApp();
  await app.ready();
  try {
    const alice = await register(app, uniqueName("alice"));
    const club = await createClub(app, alice.token, "Ledger Club", { mode: "majority" });
    const bob = await register(app, uniqueName("bob"));
    const carol = await register(app, uniqueName("carol"));
    await joinClub(app, bob.token, club.club.joinCode);
    await joinClub(app, carol.token, club.club.joinCode);

    const proposal = await createFoodOrder(app, alice.token, {
      clubId: club.club.id,
      vendor: "Pizza Place",
      totalCost: 30,
      currency: "EUR",
      payerUserId: alice.user.id,
      participantUserIds: [alice.user.id, bob.user.id, carol.user.id]
    });
    assert.equal(proposal.status, "pending");

    const approveBob = await app.inject({
      method: "POST",
      url: `/v1/proposed-changes/${proposal.id}/approve`,
      headers: { Authorization: `Bearer ${bob.token}` }
    });
    assert.equal(approveBob.statusCode, 200);

    const approveCarol = await app.inject({
      method: "POST",
      url: `/v1/proposed-changes/${proposal.id}/approve`,
      headers: { Authorization: `Bearer ${carol.token}` }
    });
    assert.equal(approveCarol.statusCode, 200);

    const balancesResponse = await app.inject({
      method: "GET",
      url: `/v1/clubs/${club.club.id}/balances?currency=EUR`,
      headers: { Authorization: `Bearer ${alice.token}` }
    });
    assert.equal(balancesResponse.statusCode, 200);
    const balances = balancesResponse.json() as Array<{ userId: string; netAmount: number }>;

    const aliceBalance = balances.find((entry) => entry.userId === alice.user.id);
    const bobBalance = balances.find((entry) => entry.userId === bob.user.id);
    const carolBalance = balances.find((entry) => entry.userId === carol.user.id);

    assert.ok(aliceBalance);
    assert.ok(bobBalance);
    assert.ok(carolBalance);
    assert.equal(aliceBalance?.netAmount, 20);
    assert.equal(bobBalance?.netAmount, -10);
    assert.equal(carolBalance?.netAmount, -10);
  } finally {
    await app.close();
  }
});

test("food order supports custom shares", async () => {
  const app = createApp();
  await app.ready();
  try {
    const alice = await register(app, uniqueName("alice"));
    const club = await createClub(app, alice.token, "Custom Split Club", { mode: "majority" });
    const bob = await register(app, uniqueName("bob"));
    const carol = await register(app, uniqueName("carol"));
    await joinClub(app, bob.token, club.club.joinCode);
    await joinClub(app, carol.token, club.club.joinCode);

    const proposal = await createFoodOrder(app, alice.token, {
      clubId: club.club.id,
      vendor: "Sushi",
      totalCost: 30,
      currency: "EUR",
      payerUserId: alice.user.id,
      participantShares: [
        { userId: alice.user.id, amount: 10 },
        { userId: bob.user.id, amount: 15 },
        { userId: carol.user.id, amount: 5 }
      ]
    });
    const approveBob = await app.inject({
      method: "POST",
      url: `/v1/proposed-changes/${proposal.id}/approve`,
      headers: { Authorization: `Bearer ${bob.token}` }
    });
    assert.equal(approveBob.statusCode, 200);
    const approveCarol = await app.inject({
      method: "POST",
      url: `/v1/proposed-changes/${proposal.id}/approve`,
      headers: { Authorization: `Bearer ${carol.token}` }
    });
    assert.equal(approveCarol.statusCode, 200);

    const balancesResponse = await app.inject({
      method: "GET",
      url: `/v1/clubs/${club.club.id}/balances?currency=EUR`,
      headers: { Authorization: `Bearer ${alice.token}` }
    });
    const balances = balancesResponse.json() as Array<{ userId: string; netAmount: number }>;
    const aliceBalance = balances.find((entry) => entry.userId === alice.user.id);
    const bobBalance = balances.find((entry) => entry.userId === bob.user.id);
    const carolBalance = balances.find((entry) => entry.userId === carol.user.id);
    assert.equal(aliceBalance?.netAmount, 20);
    assert.equal(bobBalance?.netAmount, -15);
    assert.equal(carolBalance?.netAmount, -5);
  } finally {
    await app.close();
  }
});

test("debt settlement proposal offsets balances after approval", async () => {
  const app = createApp();
  await app.ready();
  try {
    const alice = await register(app, uniqueName("alice"));
    const club = await createClub(app, alice.token, "Settlement Club", { mode: "majority" });
    const bob = await register(app, uniqueName("bob"));
    const carol = await register(app, uniqueName("carol"));
    await joinClub(app, bob.token, club.club.joinCode);
    await joinClub(app, carol.token, club.club.joinCode);

    const orderProposal = await createFoodOrder(app, alice.token, {
      clubId: club.club.id,
      vendor: "Burger",
      totalCost: 30,
      currency: "EUR",
      payerUserId: alice.user.id,
      participantUserIds: [alice.user.id, bob.user.id, carol.user.id]
    });
    await app.inject({
      method: "POST",
      url: `/v1/proposed-changes/${orderProposal.id}/approve`,
      headers: { Authorization: `Bearer ${bob.token}` }
    });
    await app.inject({
      method: "POST",
      url: `/v1/proposed-changes/${orderProposal.id}/approve`,
      headers: { Authorization: `Bearer ${carol.token}` }
    });

    const settlementCreate = await app.inject({
      method: "POST",
      url: "/v1/proposed-changes",
      headers: { Authorization: `Bearer ${alice.token}` },
      payload: {
        clubId: club.club.id,
        entity: "debt_settlement",
        payload: {
          fromUserId: bob.user.id,
          toUserId: alice.user.id,
          amount: 4,
          currency: "EUR",
          note: "Partial repayment"
        }
      }
    });
    assert.equal(settlementCreate.statusCode, 201);
    const settlementProposal = settlementCreate.json() as { id: string };

    await app.inject({
      method: "POST",
      url: `/v1/proposed-changes/${settlementProposal.id}/approve`,
      headers: { Authorization: `Bearer ${bob.token}` }
    });
    await app.inject({
      method: "POST",
      url: `/v1/proposed-changes/${settlementProposal.id}/approve`,
      headers: { Authorization: `Bearer ${carol.token}` }
    });

    const overviewResponse = await app.inject({
      method: "GET",
      url: `/v1/clubs/${club.club.id}/balance-overview?currency=EUR`,
      headers: { Authorization: `Bearer ${alice.token}` }
    });
    assert.equal(overviewResponse.statusCode, 200);
    const overview = overviewResponse.json() as {
      summary: Array<{ userId: string; owes: number; owed: number }>;
      matrix: Array<{ fromUserId: string; toUserId: string; amount: number }>;
    };

    const bobSummary = overview.summary.find((item) => item.userId === bob.user.id);
    assert.ok(bobSummary);
    assert.equal(bobSummary?.owes, 6);

    const bobToAlice = overview.matrix.find(
      (row) => row.fromUserId === bob.user.id && row.toUserId === alice.user.id
    );
    assert.ok(bobToAlice);
    assert.equal(bobToAlice?.amount, 6);
  } finally {
    await app.close();
  }
});

test("club history returns lifecycle details including votes and commit metadata", async () => {
  const app = createApp();
  await app.ready();
  try {
    const alice = await register(app, uniqueName("alice"));
    const club = await createClub(app, alice.token, "History Club", { mode: "majority" });
    const bob = await register(app, uniqueName("bob"));
    const carol = await register(app, uniqueName("carol"));
    await joinClub(app, bob.token, club.club.joinCode);
    await joinClub(app, carol.token, club.club.joinCode);

    const proposalCreate = await app.inject({
      method: "POST",
      url: "/v1/proposed-changes",
      headers: { Authorization: `Bearer ${alice.token}` },
      payload: {
        clubId: club.club.id,
        entity: "movie_watch",
        payload: {
          title: "Arrival",
          watchedOn: "2026-02-15"
        }
      }
    });
    assert.equal(proposalCreate.statusCode, 201);
    const proposal = proposalCreate.json() as { id: string };

    const approveBob = await app.inject({
      method: "POST",
      url: `/v1/proposed-changes/${proposal.id}/approve`,
      headers: { Authorization: `Bearer ${bob.token}` }
    });
    assert.equal(approveBob.statusCode, 200);

    const approveCarol = await app.inject({
      method: "POST",
      url: `/v1/proposed-changes/${proposal.id}/approve`,
      headers: { Authorization: `Bearer ${carol.token}` }
    });
    assert.equal(approveCarol.statusCode, 200);

    const historyResponse = await app.inject({
      method: "GET",
      url: `/v1/clubs/${club.club.id}/history?limit=10`,
      headers: { Authorization: `Bearer ${alice.token}` }
    });
    assert.equal(historyResponse.statusCode, 200);
    const history = historyResponse.json() as {
      items: Array<{
        proposalId: string;
        proposerDisplayName: string;
        status: string;
        committedAt?: string;
        committedByDisplayName?: string;
        votes: Array<{ voterDisplayName: string; decision: string }>;
      }>;
      total: number;
      limit: number;
      offset: number;
    };
    assert.equal(history.limit, 10);
    assert.equal(history.offset, 0);
    assert.ok(history.total >= 1);
    assert.ok(history.items.length >= 1);
    const created = history.items.find((item) => item.proposalId === proposal.id);
    assert.ok(created);
    assert.equal(created?.proposerDisplayName.startsWith("alice-"), true);
    assert.equal(created?.status, "approved");
    assert.ok(created?.committedAt);
    assert.ok(created?.committedByDisplayName);
    assert.equal(created?.votes.length, 2);
    assert.equal(created?.votes.every((vote) => vote.decision === "approve"), true);

    const filteredResponse = await app.inject({
      method: "GET",
      url: `/v1/clubs/${club.club.id}/history?status=approved&entity=movie_watch&limit=1&offset=0`,
      headers: { Authorization: `Bearer ${alice.token}` }
    });
    assert.equal(filteredResponse.statusCode, 200);
    const filtered = filteredResponse.json() as {
      items: Array<{ proposalId: string; entity: string; status: string }>;
      total: number;
      limit: number;
      offset: number;
    };
    assert.equal(filtered.limit, 1);
    assert.equal(filtered.offset, 0);
    assert.ok(filtered.total >= 1);
    assert.ok(filtered.items.every((item) => item.status === "approved" && item.entity === "movie_watch"));

    const invalidBoundsResponse = await app.inject({
      method: "GET",
      url: `/v1/clubs/${club.club.id}/history?from=2026-02-16T00:00:00.000Z&to=2026-02-15T00:00:00.000Z`,
      headers: { Authorization: `Bearer ${alice.token}` }
    });
    assert.equal(invalidBoundsResponse.statusCode, 400);
    const invalidBounds = invalidBoundsResponse.json() as { code?: string };
    assert.equal(invalidBounds.code, "invalid_date_bounds");

    const tooWideResponse = await app.inject({
      method: "GET",
      url: `/v1/clubs/${club.club.id}/history?from=2025-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.000Z`,
      headers: { Authorization: `Bearer ${alice.token}` }
    });
    assert.equal(tooWideResponse.statusCode, 400);
    const tooWide = tooWideResponse.json() as { code?: string };
    assert.equal(tooWide.code, "date_range_too_wide");
  } finally {
    await app.close();
  }
});
