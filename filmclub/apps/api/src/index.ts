import "dotenv/config";
import Fastify from "fastify";
import type { ProposedChange } from "@filmclub/shared";
import { randomUUID } from "node:crypto";

const app = Fastify({ logger: true });
const port = Number(process.env.API_PORT ?? 4000);

const proposedChanges: ProposedChange[] = [];

app.get("/health", async () => ({ status: "ok" }));

app.get("/v1/proposed-changes", async () => proposedChanges);

app.post<{ Body: Omit<ProposedChange, "id" | "status" | "createdAt"> }>(
  "/v1/proposed-changes",
  async (request, reply) => {
    const id = randomUUID();
    const record: ProposedChange = {
      id,
      entity: request.body.entity,
      payload: request.body.payload,
      proposerUserId: request.body.proposerUserId,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    proposedChanges.push(record);
    reply.code(201);
    return record;
  }
);

app.post<{ Params: { id: string } }>("/v1/proposed-changes/:id/approve", async (request, reply) => {
  const change = proposedChanges.find((item) => item.id === request.params.id);
  if (!change) {
    reply.code(404);
    return { error: "Not found" };
  }
  change.status = "approved";
  return change;
});

app.post<{ Params: { id: string } }>("/v1/proposed-changes/:id/reject", async (request, reply) => {
  const change = proposedChanges.find((item) => item.id === request.params.id);
  if (!change) {
    reply.code(404);
    return { error: "Not found" };
  }
  change.status = "rejected";
  return change;
});

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
