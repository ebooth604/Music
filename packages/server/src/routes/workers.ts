import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { BrowserJobResult } from "@longform/shared";
import * as repo from "../db/repo.js";
import { requireAuth } from "../auth/plugin.js";
import { presignUpload, publicUrl } from "../storage/s3.js";

/**
 * Sync protocol for the macOS worker (Browser Mode):
 *   POST /workers/register            -> { workerId }
 *   POST /workers/:id/pull            -> BrowserJob | null   (long-poll friendly; call every few seconds)
 *   POST /workers/:id/jobs/:job/upload-url -> presigned PUT for the clip / last frame
 *   POST /workers/:id/jobs/:job/complete   -> { clipUrl, lastFrameUrl?, meta }
 *   POST /workers/:id/jobs/:job/fail       -> { error, paused? }   (paused=true when a captcha/dialog needs the user)
 */
export async function workerRoutes(app: FastifyInstance) {
  requireAuth(app);

  app.post("/workers/register", async (req) => {
    const body = z.object({ workerId: z.string().uuid().optional(), name: z.string(), providers: z.array(z.string()) }).parse(req.body);
    const w = await repo.registerWorker(req.userId, body.name, body.providers, body.workerId);
    return { workerId: w.id };
  });

  app.post("/workers/:id/pull", async (req: any) => {
    const { providers } = z.object({ providers: z.array(z.string()) }).parse(req.body);
    return (await repo.leaseBrowserJob(req.userId, req.params.id, providers)) ?? null;
  });

  app.post("/workers/:id/jobs/:job/upload-url", async (req: any, reply) => {
    const job = await repo.getBrowserJob(req.params.job);
    if (!job || job.userId !== req.userId) return reply.code(404).send({ error: "job not found" });
    const { kind } = z.object({ kind: z.enum(["clip", "lastFrame"]) }).parse(req.body);
    const shot = await repo.getShot(job.shotId);
    const key = `projects/${job.projectId}/shots/${shot?.index ?? 0}/browser_a${job.payload.attempt}${kind === "clip" ? ".mp4" : "_last.png"}`;
    return { uploadUrl: await presignUpload(key, kind === "clip" ? "video/mp4" : "image/png"), publicUrl: publicUrl(key) };
  });

  app.post("/workers/:id/jobs/:job/complete", async (req: any, reply) => {
    const job = await repo.getBrowserJob(req.params.job);
    if (!job || job.userId !== req.userId) return reply.code(404).send({ error: "job not found" });
    const result = BrowserJobResult.parse(req.body);
    await repo.completeBrowserJob(job.id, result, null, "done");
    return { ok: true };
  });

  app.post("/workers/:id/jobs/:job/fail", async (req: any, reply) => {
    const job = await repo.getBrowserJob(req.params.job);
    if (!job || job.userId !== req.userId) return reply.code(404).send({ error: "job not found" });
    const { error, paused } = z.object({ error: z.string(), paused: z.boolean().default(false) }).parse(req.body);
    await repo.completeBrowserJob(job.id, null, error, paused ? "paused" : "failed");
    return { ok: true };
  });

  /** Worker resumed a paused job (user solved the captcha): put it back in the queue. */
  app.post("/workers/:id/jobs/:job/requeue", async (req: any, reply) => {
    const job = await repo.getBrowserJob(req.params.job);
    if (!job || job.userId !== req.userId) return reply.code(404).send({ error: "job not found" });
    await repo.completeBrowserJob(job.id, null, null, "failed"); // close this row...
    const { enqueueShot } = await import("../queue/queues.js");
    const shot = await repo.getShot(job.shotId);
    if (shot) { await repo.setShotStatus(shot.id, "queued"); await repo.setProjectStatus(job.projectId, "generating"); await enqueueShot(job.projectId, shot.index); }
    return { ok: true };
  });
}
