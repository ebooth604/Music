import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { GenerationMode, ProviderId } from "@longform/shared";
import * as repo from "../db/repo.js";
import { requireAuth } from "../auth/plugin.js";
import { decryptSecret, encryptSecret } from "../auth/crypto.js";
import { apiGenerator } from "../providers/registry.js";
import { RemoteBrowserGenerator } from "../providers/browser/remote.js";

export async function providerRoutes(app: FastifyInstance) {
  requireAuth(app);

  app.get("/providers", async (req) => {
    const rows = await repo.listProviderSettings(req.userId);
    return Promise.all(ProviderId.options.map(async (id) => {
      const r = rows.find((x) => x.providerId === id);
      return { providerId: id, mode: r?.mode ?? "api", hasApiKey: !!r?.apiKeyCiphertext, browserWorkerOnline: await repo.workerOnline(req.userId, id) };
    }));
  });

  /** API keys are encrypted at rest (AES-256-GCM) and never returned. */
  app.put("/providers/:id", async (req: any) => {
    const providerId = ProviderId.parse(req.params.id);
    const body = z.object({ mode: GenerationMode.optional(), apiKey: z.string().nullable().optional() }).parse(req.body);
    await repo.upsertProviderSetting(req.userId, providerId, {
      mode: body.mode,
      apiKeyCiphertext: body.apiKey === undefined ? undefined : body.apiKey ? encryptSecret(body.apiKey) : null,
    });
    return { ok: true };
  });

  /** "Test connection": submits a 1-line prompt through the active mode and reports whether the flow works. */
  app.post("/providers/:id/test", async (req: any) => {
    const providerId = ProviderId.parse(req.params.id);
    const { mode } = z.object({ mode: GenerationMode.optional() }).parse(req.body ?? {});
    const s = await repo.getProviderSetting(req.userId, providerId);
    const m = mode ?? s?.mode ?? "api";
    if (m === "browser") return new RemoteBrowserGenerator(providerId, req.userId, { projectId: "", shotId: "", attempt: 0 }).testConnection();
    if (!s?.apiKeyCiphertext) return { ok: false, message: "No API key stored for this provider." };
    return apiGenerator(providerId, decryptSecret(s.apiKeyCiphertext)).testConnection();
  });
}
