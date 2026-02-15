import Fastify from "fastify";
import type { ApprovalPolicy, PendingChangeStatus, ProposedChange, User } from "@filmclub/shared";
import {
  addMembership,
  createClubForUser,
  createSession,
  createUser,
  deleteSessionByToken,
  findClubById,
  findClubByJoinCode,
  findUserByDisplayName,
  findUserBySessionToken,
  isMemberOfClub,
  listClubMembers,
  listClubsForUser,
  listMembershipsForUser
} from "./auth-membership-repo.js";
import {
  castVoteAndEvaluate,
  createProposedChange,
  evaluateProposalStatus,
  getProposedChangeById,
  getProposedChangeWithVotes,
  listProposedChangesForClub,
  listProposedChangesForClubs
} from "./proposed-change-repo.js";
import { listClubBalances } from "./ledger-repo.js";

const isNonEmpty = (value: string | undefined): value is string => typeof value === "string" && value.trim().length > 0;

const normalizeJoinCode = (value: string) => value.trim().toUpperCase();

const isValidApprovalPolicy = (policy: ApprovalPolicy) => {
  if (policy.mode === "unanimous" || policy.mode === "majority") {
    return true;
  }
  if (policy.mode === "fixed") {
    return Number.isInteger(policy.requiredApprovals) && (policy.requiredApprovals ?? 0) >= 1;
  }
  return false;
};

const getTokenFromAuthHeader = (authHeader: string | undefined) => {
  if (!authHeader) {
    return null;
  }
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token;
};

const getCurrentUser = async (authHeader: string | undefined): Promise<User | null> => {
  const token = getTokenFromAuthHeader(authHeader);
  if (!token) {
    return null;
  }
  return findUserBySessionToken(token);
};

const idParamsSchema = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 1 }
  }
} as const;

const clubIdParamsSchema = {
  type: "object",
  required: ["clubId"],
  properties: {
    clubId: { type: "string", minLength: 1 }
  }
} as const;

export const createApp = () => {
  const app = Fastify({ logger: true });
  const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";

  app.addHook("onRequest", async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", corsOrigin);
    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (request.method === "OPTIONS") {
      reply.code(204);
      return reply.send();
    }
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.post<{ Body: { displayName: string } }>(
    "/v1/auth/register",
    {
      schema: {
        body: {
          type: "object",
          required: ["displayName"],
          properties: {
            displayName: { type: "string", minLength: 1 }
          }
        }
      }
    },
    async (request, reply) => {
      if (!isNonEmpty(request.body.displayName)) {
        reply.code(400);
        return { error: "displayName is required" };
      }
      const displayName = request.body.displayName.trim();
      const existing = await findUserByDisplayName(displayName);
      if (existing) {
        reply.code(409);
        return { error: "displayName is already registered" };
      }
      const user = await createUser(displayName);
      const session = await createSession(user.id);
      reply.code(201);
      return { token: session.token, user };
    }
  );

  app.post<{ Body: { displayName: string } }>(
    "/v1/auth/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["displayName"],
          properties: {
            displayName: { type: "string", minLength: 1 }
          }
        }
      }
    },
    async (request, reply) => {
      if (!isNonEmpty(request.body.displayName)) {
        reply.code(400);
        return { error: "displayName is required" };
      }
      const displayName = request.body.displayName.trim();
      const user = await findUserByDisplayName(displayName);
      if (!user) {
        reply.code(404);
        return { error: "User not found. Register first." };
      }
      const session = await createSession(user.id);
      return { token: session.token, user };
    }
  );

  app.post("/v1/auth/logout", async (request, reply) => {
    const token = getTokenFromAuthHeader(request.headers.authorization);
    if (!token) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    await deleteSessionByToken(token);
    return { ok: true };
  });

  app.get("/v1/me", async (request, reply) => {
    const user = await getCurrentUser(request.headers.authorization);
    if (!user) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    return { user };
  });

  app.post<{ Body: { name: string; approvalPolicy: ApprovalPolicy } }>(
    "/v1/clubs",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "approvalPolicy"],
          properties: {
            name: { type: "string", minLength: 1 },
            approvalPolicy: {
              type: "object",
              required: ["mode"],
              properties: {
                mode: { type: "string", enum: ["unanimous", "majority", "fixed"] },
                requiredApprovals: { type: "integer", minimum: 1 }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const user = await getCurrentUser(request.headers.authorization);
      if (!user) {
        reply.code(401);
        return { error: "Unauthorized" };
      }
      if (!isNonEmpty(request.body.name)) {
        reply.code(400);
        return { error: "name is required" };
      }
      if (!isValidApprovalPolicy(request.body.approvalPolicy)) {
        reply.code(400);
        return { error: "Invalid approvalPolicy" };
      }
      const club = await createClubForUser(request.body.name.trim(), request.body.approvalPolicy, user.id);
      reply.code(201);
      return { club };
    }
  );

  app.post<{ Body: { joinCode: string } }>(
    "/v1/clubs/join",
    {
      schema: {
        body: {
          type: "object",
          required: ["joinCode"],
          properties: {
            joinCode: { type: "string", minLength: 1 }
          }
        }
      }
    },
    async (request, reply) => {
      const user = await getCurrentUser(request.headers.authorization);
      if (!user) {
        reply.code(401);
        return { error: "Unauthorized" };
      }
      if (!isNonEmpty(request.body.joinCode)) {
        reply.code(400);
        return { error: "joinCode is required" };
      }
      const joinCode = normalizeJoinCode(request.body.joinCode);
      const club = await findClubByJoinCode(joinCode);
      if (!club) {
        reply.code(404);
        return { error: "Club not found" };
      }
      const membership = await addMembership(club.id, user.id);
      return { club, membership };
    }
  );

  app.get("/v1/me/clubs", async (request, reply) => {
    const user = await getCurrentUser(request.headers.authorization);
    if (!user) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    return listClubsForUser(user.id);
  });

  app.get<{ Params: { clubId: string } }>(
    "/v1/clubs/:clubId/members",
    { schema: { params: clubIdParamsSchema } },
    async (request, reply) => {
      const user = await getCurrentUser(request.headers.authorization);
      if (!user) {
        reply.code(401);
        return { error: "Unauthorized" };
      }
      const isMember = await isMemberOfClub(request.params.clubId, user.id);
      if (!isMember) {
        reply.code(403);
        return { error: "Forbidden" };
      }
      return listClubMembers(request.params.clubId);
    }
  );

  app.get<{ Querystring: { clubId?: string; status?: PendingChangeStatus } }>(
    "/v1/proposed-changes",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            clubId: { type: "string", minLength: 1 },
            status: { type: "string", enum: ["pending", "approved", "rejected"] }
          }
        }
      }
    },
    async (request, reply) => {
      const user = await getCurrentUser(request.headers.authorization);
      if (!user) {
        reply.code(401);
        return { error: "Unauthorized" };
      }
      if (request.query.clubId) {
        const isMember = await isMemberOfClub(request.query.clubId, user.id);
        if (!isMember) {
          reply.code(403);
          return { error: "Not a member of this club" };
        }
        return listProposedChangesForClub(request.query.clubId, request.query.status);
      }
      const memberships = await listMembershipsForUser(user.id);
      return listProposedChangesForClubs(
        memberships.map((item) => item.clubId),
        request.query.status
      );
    }
  );

  app.post<{ Body: Omit<ProposedChange, "id" | "status" | "createdAt"> }>(
    "/v1/proposed-changes",
    {
      schema: {
        body: {
          type: "object",
          required: ["clubId", "entity", "payload"],
          properties: {
            clubId: { type: "string", minLength: 1 },
            entity: { type: "string", enum: ["movie_watch", "food_order", "attendance", "debt_settlement"] },
            payload: { type: "object" }
          }
        }
      }
    },
    async (request, reply) => {
      const user = await getCurrentUser(request.headers.authorization);
      if (!user) {
        reply.code(401);
        return { error: "Unauthorized" };
      }
      const isMember = await isMemberOfClub(request.body.clubId, user.id);
      if (!isMember) {
        reply.code(403);
        return { error: "Not a member of this club" };
      }
      const club = await findClubById(request.body.clubId);
      if (!club) {
        reply.code(404);
        return { error: "Club not found" };
      }
      const created = await createProposedChange({
        clubId: request.body.clubId,
        entity: request.body.entity,
        payload: request.body.payload,
        proposerUserId: user.id
      });
      const evaluated = await evaluateProposalStatus({
        proposalId: created.id,
        clubPolicy: club.approvalPolicy,
        actorUserId: user.id
      });
      if ("error" in evaluated) {
        if (evaluated.error === "invalid_payload") {
          reply.code(400);
          return { error: "Invalid proposal payload for selected entity" };
        }
        reply.code(500);
        return { error: "Failed to evaluate proposal status" };
      }

      reply.code(201);
      return evaluated.data.proposal;
    }
  );

  app.post<{
    Body: {
      clubId: string;
      vendor: string;
      totalCost: number;
      currency: string;
      payerUserId: string;
      participantUserIds: string[];
    };
  }>(
    "/v1/food-orders",
    {
      schema: {
        body: {
          type: "object",
          required: ["clubId", "vendor", "totalCost", "currency", "payerUserId", "participantUserIds"],
          properties: {
            clubId: { type: "string", minLength: 1 },
            vendor: { type: "string", minLength: 1 },
            totalCost: { type: "number", minimum: 0 },
            currency: { type: "string", minLength: 1, maxLength: 8 },
            payerUserId: { type: "string", minLength: 1 },
            participantUserIds: {
              type: "array",
              minItems: 1,
              items: { type: "string", minLength: 1 }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const user = await getCurrentUser(request.headers.authorization);
      if (!user) {
        reply.code(401);
        return { error: "Unauthorized" };
      }
      const isMember = await isMemberOfClub(request.body.clubId, user.id);
      if (!isMember) {
        reply.code(403);
        return { error: "Not a member of this club" };
      }
      const club = await findClubById(request.body.clubId);
      if (!club) {
        reply.code(404);
        return { error: "Club not found" };
      }
      const created = await createProposedChange({
        clubId: request.body.clubId,
        entity: "food_order",
        payload: {
          vendor: request.body.vendor.trim(),
          totalCost: request.body.totalCost,
          currency: request.body.currency.trim().toUpperCase(),
          payerUserId: request.body.payerUserId,
          participantUserIds: request.body.participantUserIds
        },
        proposerUserId: user.id
      });
      const evaluated = await evaluateProposalStatus({
        proposalId: created.id,
        clubPolicy: club.approvalPolicy,
        actorUserId: user.id
      });
      if ("error" in evaluated) {
        if (evaluated.error === "invalid_payload") {
          reply.code(400);
          return { error: "Invalid food order payload" };
        }
        reply.code(500);
        return { error: "Failed to evaluate food-order proposal" };
      }
      reply.code(201);
      return evaluated.data.proposal;
    }
  );

  app.get<{ Params: { clubId: string }; Querystring: { currency?: string } }>(
    "/v1/clubs/:clubId/balances",
    {
      schema: {
        params: clubIdParamsSchema,
        querystring: {
          type: "object",
          properties: {
            currency: { type: "string", minLength: 1, maxLength: 8 }
          }
        }
      }
    },
    async (request, reply) => {
      const user = await getCurrentUser(request.headers.authorization);
      if (!user) {
        reply.code(401);
        return { error: "Unauthorized" };
      }
      const isMember = await isMemberOfClub(request.params.clubId, user.id);
      if (!isMember) {
        reply.code(403);
        return { error: "Not a member of this club" };
      }
      return listClubBalances(request.params.clubId, request.query.currency);
    }
  );

  app.get<{ Params: { id: string } }>(
    "/v1/proposed-changes/:id",
    { schema: { params: idParamsSchema } },
    async (request, reply) => {
      const user = await getCurrentUser(request.headers.authorization);
      if (!user) {
        reply.code(401);
        return { error: "Unauthorized" };
      }
      const found = await getProposedChangeWithVotes(request.params.id);
      if (!found) {
        reply.code(404);
        return { error: "Not found" };
      }
      const isMember = await isMemberOfClub(found.proposal.clubId, user.id);
      if (!isMember) {
        reply.code(403);
        return { error: "Not a member of this club" };
      }
      return found;
    }
  );

  app.post<{ Params: { id: string } }>(
    "/v1/proposed-changes/:id/approve",
    { schema: { params: idParamsSchema } },
    async (request, reply) => {
      const user = await getCurrentUser(request.headers.authorization);
      if (!user) {
        reply.code(401);
        return { error: "Unauthorized" };
      }
      const change = await getProposedChangeById(request.params.id);
      if (!change) {
        reply.code(404);
        return { error: "Not found" };
      }
      const isMember = await isMemberOfClub(change.clubId, user.id);
      if (!isMember) {
        reply.code(403);
        return { error: "Not a member of this club" };
      }
      const club = await findClubById(change.clubId);
      if (!club) {
        reply.code(404);
        return { error: "Club not found" };
      }
      const result = await castVoteAndEvaluate({
        proposalId: change.id,
        voterUserId: user.id,
        decision: "approve",
        clubPolicy: club.approvalPolicy
      });
      if ("error" in result) {
        if (result.error === "already_voted") {
          reply.code(409);
          return { error: "You already voted on this proposal" };
        }
        if (result.error === "proposer_cannot_vote") {
          reply.code(409);
          return { error: "Proposer cannot vote on own proposal" };
        }
        if (result.error === "already_resolved") {
          reply.code(409);
          return { error: "Proposal is already resolved" };
        }
        if (result.error === "invalid_payload") {
          reply.code(400);
          return { error: "Invalid proposal payload for execution" };
        }
        reply.code(404);
        return { error: "Not found" };
      }
      return result.data;
    }
  );

  app.post<{ Params: { id: string } }>(
    "/v1/proposed-changes/:id/reject",
    { schema: { params: idParamsSchema } },
    async (request, reply) => {
      const user = await getCurrentUser(request.headers.authorization);
      if (!user) {
        reply.code(401);
        return { error: "Unauthorized" };
      }
      const change = await getProposedChangeById(request.params.id);
      if (!change) {
        reply.code(404);
        return { error: "Not found" };
      }
      const isMember = await isMemberOfClub(change.clubId, user.id);
      if (!isMember) {
        reply.code(403);
        return { error: "Not a member of this club" };
      }
      const club = await findClubById(change.clubId);
      if (!club) {
        reply.code(404);
        return { error: "Club not found" };
      }
      const result = await castVoteAndEvaluate({
        proposalId: change.id,
        voterUserId: user.id,
        decision: "reject",
        clubPolicy: club.approvalPolicy
      });
      if ("error" in result) {
        if (result.error === "already_voted") {
          reply.code(409);
          return { error: "You already voted on this proposal" };
        }
        if (result.error === "proposer_cannot_vote") {
          reply.code(409);
          return { error: "Proposer cannot vote on own proposal" };
        }
        if (result.error === "already_resolved") {
          reply.code(409);
          return { error: "Proposal is already resolved" };
        }
        if (result.error === "invalid_payload") {
          reply.code(400);
          return { error: "Invalid proposal payload for execution" };
        }
        reply.code(404);
        return { error: "Not found" };
      }
      return result.data;
    }
  );

  return app;
};
