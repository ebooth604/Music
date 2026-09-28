import path from "node:path";
import type { ContinuityNote, Project, Shot } from "@longform/shared";
import * as repo from "../db/repo.js";
import { putFile } from "../storage/s3.js";
import { downloadToFile } from "../storage/s3.js";
import { extractFirstFrame, extractLastFrame, workPath } from "../util/ffmpeg.js";
import { generatorFor, NoApiKeyError } from "../providers/registry.js";
import { ProviderHttpError } from "../providers/api/base.js";
import { BrowserPausedError } from "../providers/browser/remote.js";
import { promptArchitect } from "./architect.js";
import { storyPlanner } from "./planner.js";
import { clipPromptFor, describeLastFrame, noteFromBeat } from "./continuity.js";
import { qualityCheck } from "./qualityGate.js";
import { assemble } from "./assembler.js";
import { enqueueAssemble, enqueueShot } from "../queue/queues.js";

/** Steps A + B: produce the Story Bible and park the project for approval. */
export async function planProject(projectId: string): Promise<void> {
  const project = await repo.getProject(projectId);
  if (!project) throw new Error("project not found");
  await repo.setProjectStatus(projectId, "planning");
  try {
    const arch = await promptArchitect(project.prompt, project.settings);
    const beats = await storyPlanner(project.prompt, arch, project.settings);
    await repo.setProjectBible(projectId, { master: arch.master, characters: arch.characters, locations: arch.locations, beats });
    await repo.replaceShots(projectId, { master: arch.master, characters: arch.characters, locations: arch.locations, beats },
      project.settings.providerId, project.settings.mode);
    await repo.setProjectStatus(projectId, "bible_ready");
  } catch (e: any) {
    await repo.setProjectStatus(projectId, "failed", e.message);
    throw e;
  }
}

/**
 * Approval → Step C for shot 0 (its prompt has no continuity dependency) → start generating.
 * Later shots get their prompt built lazily, right after the previous clip passes, because the
 * continuity note needs the previous clip's real last frame.
 */
export async function startGeneration(projectId: string): Promise<void> {
  const project = await repo.getProject(projectId);
  if (!project?.bible) throw new Error("no story bible");
  await repo.setProjectStatus(projectId, "generating");
  await resume(projectId);
}

/** Resume-safe entry point: finds the first shot that has not passed and (re)enqueues it. */
export async function resume(projectId: string): Promise<void> {
  const shots = await repo.listShots(projectId);
  const next = shots.find((s) => s.status !== "passed");
  if (!next) {
    await enqueueAssemble(projectId);
    return;
  }
  if (next.status === "generating" || next.status === "checking") return; // already in flight
  await enqueueShot(projectId, next.index);
}

/** Steps C + D + E for one shot. Runs until the shot passes, pauses, or exhausts retries. */
export async function processShot(projectId: string, shotIndex: number): Promise<void> {
  const project = await repo.getProject(projectId);
  if (!project?.bible) throw new Error("project/bible missing");
  if (project.status === "paused") return;
  const shot = await repo.getShotByIndex(projectId, shotIndex);
  if (!shot) throw new Error(`shot ${shotIndex} missing`);
  if (shot.status === "passed") { await resume(projectId); return; }   // never regenerate finished clips

  const prev = shotIndex > 0 ? await repo.getShotByIndex(projectId, shotIndex - 1) : null;
  if (prev && prev.status !== "passed") { await enqueueShot(projectId, prev.index); return; }

  // ---- Step C: continuity note + prompt (kept if the user edited the prompt by hand) ----
  let prompt = shot.prompt;
  let note: ContinuityNote | null = shot.continuityNote;
  if (!prompt) {
    if (prev?.lastFrameUrl) note = await describeLastFrame(prev.lastFrameUrl, project.bible, shot.beat);
    else if (prev) note = noteFromBeat(prev.beat);
    prompt = clipPromptFor(project.bible, shot.beat, note, project.settings.clipLength);
    await repo.setShotPrompt(shot.id, prompt, note);
  }

  const shot0 = shotIndex > 0 ? await repo.getShotByIndex(projectId, 0) : null;
  const styleRef = shot0?.firstFrameUrl ?? null;

  // ---- Steps D + E with retries ----
  const maxAttempts = 1 + project.settings.maxRetries;
  while (true) {
    const attempt = await repo.bumpAttempt(shot.id);
    const current = (await repo.getShot(shot.id))!;
    await repo.setShotStatus(shot.id, attempt > 1 ? "retrying" : "generating");
    try {
      const gen = await generatorFor({
        userId: project.userId, providerId: current.providerId, mode: current.mode,
        projectId, shotId: shot.id, attempt,
      });
      const result = await gen.generateClip({
        prompt: prompt + (attempt > 1 && current.quality ? `\n\n[FIX] Previous attempt issues: ${current.quality.issues.join("; ")}` : ""),
        startFrame: gen.supportsStartFrame && prev?.lastFrameUrl ? prev.lastFrameUrl : undefined,
        duration: project.settings.clipLength,
        aspectRatio: project.settings.aspectRatio,
        seed: seedFor(projectId),
        negativePrompt: project.bible.master.negativePrompt || undefined,
      });

      // Normalise the clip into our storage + extract frames, so downstream is mode-agnostic.
      const local = workPath(projectId, `shot_${shotIndex}_a${attempt}.mp4`);
      await downloadToFile(result.clipUrl, local);
      const clipUrl = await putFile(`projects/${projectId}/shots/${shotIndex}/a${attempt}.mp4`, local, "video/mp4");
      const firstPng = await extractFirstFrame(local, path.join(path.dirname(local), `shot_${shotIndex}_a${attempt}_first.png`));
      const lastPng = await extractLastFrame(local, path.join(path.dirname(local), `shot_${shotIndex}_a${attempt}_last.png`));
      const firstFrameUrl = await putFile(`projects/${projectId}/shots/${shotIndex}/a${attempt}_first.png`, firstPng, "image/png");
      const lastFrameUrl = await putFile(`projects/${projectId}/shots/${shotIndex}/a${attempt}_last.png`, lastPng, "image/png");
      await repo.setShotClip(shot.id, { clipUrl, firstFrameUrl, lastFrameUrl, costUsd: result.meta.costUsd ?? 0 });

      await repo.setShotStatus(shot.id, "checking");
      const quality = await qualityCheck({
        bible: project.bible, shot: { ...current, clipUrl }, firstFrameUrl, lastFrameUrl,
        previousLastFrameUrl: prev?.lastFrameUrl ?? null, styleReferenceUrl: styleRef,
      });
      await repo.setShotQuality(shot.id, quality);
      await repo.recordAttempt(shot.id, { attempt, mode: current.mode, providerId: current.providerId, prompt, clipUrl, lastFrameUrl, quality, meta: result.meta });

      if (quality.pass) {
        await repo.setShotStatus(shot.id, "passed");
        await resume(projectId);
        return;
      }
      if (attempt >= maxAttempts) {
        await repo.setShotStatus(shot.id, "failed", `quality gate failed after ${attempt} attempts: ${quality.issues.join("; ")}`);
        return; // user can regenerate or accept manually; pipeline halts here and resumes from this shot later
      }
    } catch (e: any) {
      await repo.recordAttempt(shot.id, { attempt, mode: current.mode, providerId: current.providerId, prompt, error: e.message });
      if (e instanceof BrowserPausedError) {
        await repo.setShotStatus(shot.id, "paused", e.message);
        await repo.setProjectStatus(projectId, "paused", "Browser worker needs your attention");
        return;
      }
      // API key exhausted / unauthorised → fall back to Browser Mode for this shot if a worker exists.
      if ((e instanceof ProviderHttpError && e.isQuotaOrAuth) || e instanceof NoApiKeyError) {
        if (current.mode === "api" && (await repo.workerOnline(project.userId, current.providerId))) {
          await repo.setShotMode(shot.id, current.providerId, "browser");
          continue; // retry immediately in browser mode; output is identical downstream
        }
      }
      if (attempt >= maxAttempts) {
        await repo.setShotStatus(shot.id, "failed", e.message);
        return;
      }
    }
  }
}

/** Step F. */
export async function assembleProject(projectId: string): Promise<void> {
  const project = await repo.getProject(projectId);
  if (!project) throw new Error("project missing");
  const shots = await repo.listShots(projectId);
  if (shots.some((s) => s.status !== "passed")) { await resume(projectId); return; }
  await repo.setProjectStatus(projectId, "assembling");
  try {
    const url = await assemble(project, shots);
    await repo.setProjectFinal(projectId, url);
  } catch (e: any) {
    await repo.setProjectStatus(projectId, "failed", `assembly: ${e.message}`);
    throw e;
  }
}

/** Regenerate shot N on user request: clears that shot and every shot after it whose prompt depended on it? No —
 *  only shot N is reset; later shots keep their clips (the user chose to redo one shot, not the tail). */
export async function regenerateShot(projectId: string, shotIndex: number, opts: { keepPrompt: boolean }): Promise<void> {
  const shot = await repo.getShotByIndex(projectId, shotIndex);
  if (!shot) throw new Error("shot missing");
  await repo.resetShotForRegeneration(shot.id);
  if (!opts.keepPrompt) await repo.setShotPrompt(shot.id, null as unknown as string, null);
  await repo.setProjectStatus(projectId, "generating");
  await enqueueShot(projectId, shotIndex);
}

export function progressOf(shots: Shot[], project: Project) {
  const passed = shots.filter((s) => s.status === "passed").length;
  const generating = shots.filter((s) => ["generating", "checking", "retrying"].includes(s.status)).length;
  const failed = shots.filter((s) => s.status === "failed").length;
  return { total: shots.length, passed, generating, failed, spentUsd: shots.reduce((a, s) => a + s.costUsd, 0), project };
}

function seedFor(projectId: string): number {
  let h = 0;
  for (const c of projectId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 2_000_000_000;
}
