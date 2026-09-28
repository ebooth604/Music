import type { FastifyInstance, FastifyRequest } from "fastify";
import { verifySession } from "./jwt.js";

declare module "fastify" {
  interface FastifyRequest { userId: string }
}

export function requireAuth(app: FastifyInstance): void {
  app.addHook("preHandler", async (req: FastifyRequest, reply) => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) return reply.code(401).send({ error: "unauthorized" });
    try {
      req.userId = await verifySession(h.slice(7));
    } catch {
      return reply.code(401).send({ error: "invalid token" });
    }
  });
}
