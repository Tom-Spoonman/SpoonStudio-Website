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
