import "dotenv/config";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import type { Club, ClubMembership, ProposedChange, User } from "@filmclub/shared";
import type { ApprovalPolicy } from "@filmclub/shared";

const app = Fastify({ logger: true });
const port = Number(process.env.API_PORT ?? 4000);

interface Session {
  token: string;
  userId: string;
  createdAt: string;
}

const users: User[] = [];
const sessions: Session[] = [];
const clubs: Club[] = [];
const memberships: ClubMembership[] = [];
const proposedChanges: ProposedChange[] = [];

const isNonEmpty = (value: string | undefined): value is string => typeof value === "string" && value.trim().length > 0;

const normalizeJoinCode = (value: string) => value.trim().toUpperCase();

const generateJoinCode = () => {
  let code = Math.random().toString(36).slice(2, 8).toUpperCase();
  while (clubs.some((item) => item.joinCode === code)) {
    code = Math.random().toString(36).slice(2, 8).toUpperCase();
  }
  return code;
};

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

const getCurrentUser = (authHeader: string | undefined) => {
  const token = getTokenFromAuthHeader(authHeader);
  if (!token) {
    return null;
  }
  const session = sessions.find((item) => item.token === token);
  if (!session) {
    return null;
  }
  return users.find((item) => item.id === session.userId) ?? null;
};

app.get("/health", async () => ({ status: "ok" }));

app.post<{ Body: { displayName: string } }>("/v1/auth/register", async (request, reply) => {
  if (!isNonEmpty(request.body.displayName)) {
    reply.code(400);
    return { error: "displayName is required" };
  }
  const displayName = request.body.displayName.trim();
  const existing = users.find((item) => item.displayName.toLowerCase() === displayName.toLowerCase());
  if (existing) {
    reply.code(409);
    return { error: "displayName is already registered" };
  }
  const user: User = {
    id: randomUUID(),
    displayName,
    createdAt: new Date().toISOString()
  };
  users.push(user);
  const session: Session = {
    token: randomUUID(),
    userId: user.id,
    createdAt: new Date().toISOString()
  };
  sessions.push(session);
  reply.code(201);
  return { token: session.token, user };
});

app.post<{ Body: { displayName: string } }>("/v1/auth/login", async (request, reply) => {
  if (!isNonEmpty(request.body.displayName)) {
    reply.code(400);
    return { error: "displayName is required" };
  }
  const displayName = request.body.displayName.trim();
  const user = users.find((item) => item.displayName.toLowerCase() === displayName.toLowerCase());
  if (!user) {
    reply.code(404);
    return { error: "User not found. Register first." };
  }
  const session: Session = {
    token: randomUUID(),
    userId: user.id,
    createdAt: new Date().toISOString()
  };
  sessions.push(session);
  return { token: session.token, user };
});

app.get("/v1/me", async (request, reply) => {
  const user = getCurrentUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "Unauthorized" };
  }
  return { user };
});

app.post<{ Body: { name: string; approvalPolicy: ApprovalPolicy } }>("/v1/clubs", async (request, reply) => {
  const user = getCurrentUser(request.headers.authorization);
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
  const club: Club = {
    id: randomUUID(),
    name: request.body.name.trim(),
    joinCode: generateJoinCode(),
    approvalPolicy: request.body.approvalPolicy,
    createdByUserId: user.id,
    createdAt: new Date().toISOString()
  };
  clubs.push(club);
  memberships.push({
    id: randomUUID(),
    clubId: club.id,
    userId: user.id,
    role: "owner",
    joinedAt: new Date().toISOString()
  });
  reply.code(201);
  return { club };
});

app.post<{ Body: { joinCode: string } }>("/v1/clubs/join", async (request, reply) => {
  const user = getCurrentUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "Unauthorized" };
  }
  if (!isNonEmpty(request.body.joinCode)) {
    reply.code(400);
    return { error: "joinCode is required" };
  }
  const joinCode = normalizeJoinCode(request.body.joinCode);
  const club = clubs.find((item) => item.joinCode === joinCode);
  if (!club) {
    reply.code(404);
    return { error: "Club not found" };
  }
  const existing = memberships.find((item) => item.clubId === club.id && item.userId === user.id);
  if (existing) {
    return { club, membership: existing };
  }
  const membership: ClubMembership = {
    id: randomUUID(),
    clubId: club.id,
    userId: user.id,
    role: "member",
    joinedAt: new Date().toISOString()
  };
  memberships.push(membership);
  return { club, membership };
});

app.get("/v1/me/clubs", async (request, reply) => {
  const user = getCurrentUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "Unauthorized" };
  }
  const myMemberships = memberships.filter((item) => item.userId === user.id);
  const result = myMemberships
    .map((membership) => {
      const club = clubs.find((item) => item.id === membership.clubId);
      if (!club) {
        return null;
      }
      return { club, membership };
    })
    .filter((item): item is { club: Club; membership: ClubMembership } => item !== null);
  return result;
});

app.get<{ Params: { clubId: string } }>("/v1/clubs/:clubId/members", async (request, reply) => {
  const user = getCurrentUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "Unauthorized" };
  }
  const requesterMembership = memberships.find(
    (item) => item.clubId === request.params.clubId && item.userId === user.id
  );
  if (!requesterMembership) {
    reply.code(403);
    return { error: "Forbidden" };
  }
  const clubMembers = memberships
    .filter((item) => item.clubId === request.params.clubId)
    .map((membership) => {
      const member = users.find((item) => item.id === membership.userId);
      return member ? { user: member, membership } : null;
    })
    .filter((item): item is { user: User; membership: ClubMembership } => item !== null);
  return clubMembers;
});

app.get<{ Querystring: { clubId?: string } }>("/v1/proposed-changes", async (request, reply) => {
  const user = getCurrentUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "Unauthorized" };
  }
  if (request.query.clubId) {
    const isMember = memberships.some(
      (item) => item.clubId === request.query.clubId && item.userId === user.id
    );
    if (!isMember) {
      reply.code(403);
      return { error: "Not a member of this club" };
    }
    return proposedChanges.filter((item) => item.clubId === request.query.clubId);
  }
  const myClubIds = new Set(memberships.filter((item) => item.userId === user.id).map((item) => item.clubId));
  return proposedChanges.filter((item) => myClubIds.has(item.clubId));
});

app.post<{ Body: Omit<ProposedChange, "id" | "status" | "createdAt"> }>(
  "/v1/proposed-changes",
  async (request, reply) => {
    const user = getCurrentUser(request.headers.authorization);
    if (!user) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const isMember = memberships.some(
      (item) => item.clubId === request.body.clubId && item.userId === user.id
    );
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
  const user = getCurrentUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "Unauthorized" };
  }
  const change = proposedChanges.find((item) => item.id === request.params.id);
  if (!change) {
    reply.code(404);
    return { error: "Not found" };
  }
  const isMember = memberships.some((item) => item.clubId === change.clubId && item.userId === user.id);
  if (!isMember) {
    reply.code(403);
    return { error: "Not a member of this club" };
  }
  change.status = "approved";
  return change;
});

app.post<{ Params: { id: string } }>("/v1/proposed-changes/:id/reject", async (request, reply) => {
  const user = getCurrentUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "Unauthorized" };
  }
  const change = proposedChanges.find((item) => item.id === request.params.id);
  if (!change) {
    reply.code(404);
    return { error: "Not found" };
  }
  const isMember = memberships.some((item) => item.clubId === change.clubId && item.userId === user.id);
  if (!isMember) {
    reply.code(403);
    return { error: "Not a member of this club" };
  }
  change.status = "rejected";
  return change;
});

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
