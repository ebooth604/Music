import type { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { one, query } from "../db/pool.js";
import * as repo from "../db/repo.js";
import { signSession } from "../auth/jwt.js";
import { verifyAppleIdentityToken } from "../auth/apple.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/apple", async (req, reply) => {
    const { identityToken } = z.object({ identityToken: z.string() }).parse(req.body);
    const { sub, email } = await verifyAppleIdentityToken(identityToken);
    const user = await repo.upsertUserByApple(sub, email);
    return reply.send({ token: await signSession(user.id), userId: user.id });
  });

  // Email magic link: request → (mail or console) → verify.
  app.post("/auth/email/request", async (req, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const token = crypto.randomBytes(24).toString("base64url");
    await query(`INSERT INTO magic_links (token, email, expires_at) VALUES ($1,$2, now() + interval '15 minutes')`, [token, email.toLowerCase()]);
    if (process.env.SMTP_URL) {
      // Production: hand off to your mailer. Kept as a hook to avoid pulling in a mail dependency here.
      app.log.info({ email }, "magic link issued (SMTP delivery hook)");
    } else {
      app.log.warn(`DEV magic link for ${email}: token=${token}`);
    }
    return reply.send({ ok: true, ...(process.env.NODE_ENV !== "production" ? { devToken: token } : {}) });
  });

  app.post("/auth/email/verify", async (req, reply) => {
    const { token } = z.object({ token: z.string() }).parse(req.body);
    const row = await one<{ email: string }>(`DELETE FROM magic_links WHERE token = $1 AND expires_at > now() RETURNING email`, [token]);
    if (!row) return reply.code(400).send({ error: "invalid or expired link" });
    const user = await repo.upsertUserByEmail(row.email);
    return reply.send({ token: await signSession(user.id), userId: user.id });
  });
}
