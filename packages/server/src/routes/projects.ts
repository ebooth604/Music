import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ProjectSettings, StoryBible, estimate } from "@longform/shared";
import * as repo from "../db/repo.js";
import { requireAuth } from "../auth/plugin.js";
import { enqueuePlan } from "../queue/queues.js";
import { progressOf, regenerateShot, resume, startGeneration } from "../pipeline/orchestrator.js";

export async function projectRoutes(app: FastifyInstance) {
  requireAuth(app);

  app.get("/projects", async (req) => repo.listProjects(req.userId));

  app.post("/projects", async (req, reply) => {
    const body = z.object({ prompt: z.string().min(3), title: z.string().optional(), settings: ProjectSettings.partial().optional() }).parse(req.body);
    const settings = ProjectSettings.parse(body.settings ?? {});
    const project = await repo.createProject(req.userId, body.title ?? body.prompt.slice(0, 60), body.prompt, settings);
    await enqueuePlan(project.id);
    return reply.code(201).send(project);
  });

  const owned = async (req: any, reply: any) => {
    const p = await repo.getProject(req.params.id);
    if (!p || p.userId !== req.userId) { reply.code(404).send({ error: "not found" }); return null; }
    return p;
  };

  app.get("/projects/:id", async (req: any, reply) => {
    const p = await owned(req, reply); if (!p) return;
    return p;
  });

  /** Story Bible edits: master prompt, characters, locations, beats. Re-syncs shot rows (never deletes passed shots). */
  app.put("/projects/:id/bible", async (req: any, reply) => {
    const p = await owned(req, reply); if (!p) return;
    const bible = StoryBible.parse(req.body);
    await repo.setProjectBible(p.id, bible);
    await repo.replaceShots(p.id, bible, p.settings.providerId, p.settings.mode);
    return repo.getProject(p.id);
  });

  app.put("/projects/:id/settings", async (req: any, reply) => {
    const p = await owned(req, reply); if (!p) return;
    const settings = ProjectSettings.parse({ ...p.settings, ...(req.body as object) });
    await repo.setProjectSettings(p.id, settings);
    // Mode/provider switch applies to every shot not yet passed (switch mid-run).
    const shots = await repo.listShots(p.id);
    for (const s of shots) if (s.status !== "passed") await repo.setShotMode(s.id, settings.providerId, settings.mode);
    return repo.getProject(p.id);
  });

  /** Re-run Steps A+B (user rejected the bible). */
  app.post("/projects/:id/replan", async (req: any, reply) => {
    const p = await owned(req, reply); if (!p) return;
    await enqueuePlan(p.id);
    return { ok: true };
  });

  /** Approve the bible → generate. */
  app.post("/projects/:id/approve", async (req: any, reply) => {
    const p = await owned(req, reply); if (!p) return;
    if (!p.bible) return reply.code(409).send({ error: "bible not ready" });
    await startGeneration(p.id);
    return repo.getProject(p.id);
  });

  app.post("/projects/:id/pause", async (req: any, reply) => {
    const p = await owned(req, reply); if (!p) return;
    await repo.setProjectStatus(p.id, "paused");
    return repo.getProject(p.id);
  });

  /** Resume after failure/pause: continues from the first non-passed shot; finished clips are never redone. */
  app.post("/projects/:id/resume", async (req: any, reply) => {
    const p = await owned(req, reply); if (!p) return;
    await repo.setProjectStatus(p.id, "generating");
    for (const s of await repo.listShots(p.id)) if (s.status === "paused" || s.status === "failed") await repo.setShotStatus(s.id, "queued");
    await resume(p.id);
    return repo.getProject(p.id);
  });

  app.get("/projects/:id/shots", async (req: any, reply) => {
    const p = await owned(req, reply); if (!p) return;
    return repo.listShots(p.id);
  });

  app.get("/projects/:id/progress", async (req: any, reply) => {
    const p = await owned(req, reply); if (!p) return;
    const shots = await repo.listShots(p.id);
    const prog = progressOf(shots, p);
    const remaining = prog.total - prog.passed;
    const est = estimate({ providerId: p.settings.providerId, mode: p.settings.mode, clipLength: p.settings.clipLength, remainingShots: remaining });
    return {
      total: prog.total, passed: prog.passed, generating: prog.generating, failed: prog.failed,
      etaSeconds: p.status === "generating" ? est.etaSeconds : null,
      costUsd: prog.spentUsd + est.costUsd,
    };
  });

  /** Every clip prompt is viewable and editable. Editing resets nothing; the next generation of that shot uses the new prompt. */
  app.put("/projects/:id/shots/:index/prompt", async (req: any, reply) => {
    const p = await owned(req, reply); if (!p) return;
    const { prompt } = z.object({ prompt: z.string().min(10) }).parse(req.body);
    const s = await repo.getShotByIndex(p.id, Number(req.params.index));
    if (!s) return reply.code(404).send({ error: "shot not found" });
    await repo.setShotPrompt(s.id, prompt, s.continuityNote);
    return repo.getShot(s.id);
  });

  /** "Regenerate shot N" from the result page. keepPrompt=false rebuilds the prompt from the bible + continuity. */
  app.post("/projects/:id/shots/:index/regenerate", async (req: any, reply) => {
    const p = await owned(req, reply); if (!p) return;
    const { keepPrompt } = z.object({ keepPrompt: z.boolean().default(true) }).parse(req.body ?? {});
    await regenerateShot(p.id, Number(req.params.index), { keepPrompt });
    return repo.getShotByIndex(p.id, Number(req.params.index));
  });

  /** Accept a failed shot as-is (user override of the quality gate). */
  app.post("/projects/:id/shots/:index/accept", async (req: any, reply) => {
    const p = await owned(req, reply); if (!p) return;
    const s = await repo.getShotByIndex(p.id, Number(req.params.index));
    if (!s?.clipUrl) return reply.code(409).send({ error: "no clip to accept" });
    await repo.setShotStatus(s.id, "passed");
    await resume(p.id);
    return repo.getShot(s.id);
  });
}
