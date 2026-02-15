import "dotenv/config";
import { createApp } from "./app.js";
import { runMigrations } from "./db.js";

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);

const start = async () => {
  await runMigrations();
  const app = createApp();
  await app.listen({ port, host: "0.0.0.0" });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
