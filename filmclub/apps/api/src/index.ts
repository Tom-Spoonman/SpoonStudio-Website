import "dotenv/config";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import type { ApprovalPolicy, ProposedChange, User } from "@filmclub/shared";
import {
  addMembership,
  createClubForUser,
  createSession,
  createUser,
  findClubByJoinCode,
  findUserByDisplayName,
  findUserBySessionToken,
  isMemberOfClub,
  listClubMembers,
  listClubsForUser,
  listMembershipsForUser
} from "./auth-membership-repo.js";
import { runMigrations } from "./db.js";

const app = Fastify({ logger: true });
const port = Number(process.env.API_PORT ?? 4000);

const proposedChanges: ProposedChange[] = [];

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

app.get("/health", async () => ({ status: "ok" }));

app.post<{ Body: { displayName: string } }>("/v1/auth/register", async (request, reply) => {
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
});

app.post<{ Body: { displayName: string } }>("/v1/auth/login", async (request, reply) => {
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
});

app.get("/v1/me", async (request, reply) => {
  const user = await getCurrentUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "Unauthorized" };
  }
  return { user };
});

app.post<{ Body: { name: string; approvalPolicy: ApprovalPolicy } }>("/v1/clubs", async (request, reply) => {
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
});

app.post<{ Body: { joinCode: string } }>("/v1/clubs/join", async (request, reply) => {
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
});

app.get("/v1/me/clubs", async (request, reply) => {
  const user = await getCurrentUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "Unauthorized" };
  }
  return listClubsForUser(user.id);
});

app.get<{ Params: { clubId: string } }>("/v1/clubs/:clubId/members", async (request, reply) => {
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
});

app.get<{ Querystring: { clubId?: string } }>("/v1/proposed-changes", async (request, reply) => {
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
    return proposedChanges.filter((item) => item.clubId === request.query.clubId);
  }
  const memberships = await listMembershipsForUser(user.id);
  const myClubIds = new Set(memberships.map((item) => item.clubId));
  return proposedChanges.filter((item) => myClubIds.has(item.clubId));
});

app.post<{ Body: Omit<ProposedChange, "id" | "status" | "createdAt"> }>(
  "/v1/proposed-changes",
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
    const id = randomUUID();
    const record: ProposedChange = {
      id,
      clubId: request.body.clubId,
      entity: request.body.entity,
      payload: request.body.payload,
      proposerUserId: user.id,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    proposedChanges.push(record);
    reply.code(201);
    return record;
  }
);

app.post<{ Params: { id: string } }>("/v1/proposed-changes/:id/approve", async (request, reply) => {
  const user = await getCurrentUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "Unauthorized" };
  }
  const change = proposedChanges.find((item) => item.id === request.params.id);
  if (!change) {
    reply.code(404);
    return { error: "Not found" };
  }
  const isMember = await isMemberOfClub(change.clubId, user.id);
  if (!isMember) {
    reply.code(403);
    return { error: "Not a member of this club" };
  }
  change.status = "approved";
  return change;
});

app.post<{ Params: { id: string } }>("/v1/proposed-changes/:id/reject", async (request, reply) => {
  const user = await getCurrentUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "Unauthorized" };
  }
  const change = proposedChanges.find((item) => item.id === request.params.id);
  if (!change) {
    reply.code(404);
    return { error: "Not found" };
  }
  const isMember = await isMemberOfClub(change.clubId, user.id);
  if (!isMember) {
    reply.code(403);
    return { error: "Not a member of this club" };
  }
  change.status = "rejected";
  return change;
});

const start = async () => {
  await runMigrations();
  await app.listen({ port, host: "0.0.0.0" });
};

start().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
