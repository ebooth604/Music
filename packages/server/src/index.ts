import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { migrate } from "./db/migrate.js";
import { authRoutes } from "./routes/auth.js";
import { projectRoutes } from "./routes/projects.js";
import { providerRoutes } from "./routes/providers.js";
import { workerRoutes } from "./routes/workers.js";
import { startWorkers } from "./queue/workers.js";

const app = Fastify({ logger: true, bodyLimit: 20 * 1024 * 1024 });
await app.register(cors, { origin: true });

app.get("/health", async () => ({ ok: true }));
await app.register(authRoutes, { prefix: "/v1" });
await app.register(projectRoutes, { prefix: "/v1" });
await app.register(providerRoutes, { prefix: "/v1" });
await app.register(workerRoutes, { prefix: "/v1" });

app.setErrorHandler((err: any, _req, reply) => {
  if (err?.name === "ZodError") return reply.code(400).send({ error: "validation", issues: err.issues });
  app.log.error(err);
  reply.code(err.statusCode ?? 500).send({ error: err.message });
});

await migrate();
if (process.env.EMBED_WORKERS !== "false") startWorkers();
await app.listen({ port: config.port, host: "0.0.0.0" });
