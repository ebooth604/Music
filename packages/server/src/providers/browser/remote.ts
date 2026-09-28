import type { BrowserJob, ClipGenerator, GenerateClipRequest, GenerateClipResult, ProviderId } from "@longform/shared";
import { enqueueBrowserJob, getBrowserJob, workerOnline } from "../../db/repo.js";
import { one } from "../../db/pool.js";
import { sleep } from "../api/base.js";

/**
 * Browser-Mode generator as seen from the backend.
 *
 * It implements the same ClipGenerator contract as the API adapters, but instead of calling a
 * REST API it enqueues a job that the user's macOS worker pulls, runs inside the provider's web
 * app using the user's logged-in session, and completes by uploading the clip to our storage.
 * The pipeline therefore cannot tell the two modes apart.
 */
export class RemoteBrowserGenerator implements ClipGenerator {
  readonly mode = "browser" as const;
  readonly supportsStartFrame = true;
  constructor(readonly providerId: ProviderId, private userId: string, private ctx: { projectId: string; shotId: string; attempt: number }) {}

  async generateClip(req: GenerateClipRequest, signal?: AbortSignal): Promise<GenerateClipResult> {
    const job: Omit<BrowserJob, "id"> = {
      shotId: this.ctx.shotId, projectId: this.ctx.projectId, providerId: this.providerId,
      prompt: req.prompt, startFrameUrl: req.startFrame ?? null, duration: req.duration,
      aspectRatio: req.aspectRatio, attempt: this.ctx.attempt,
    };
    const id = await enqueueBrowserJob(this.userId, job);
    // Wait for the worker. Long timeout: browser generations queue behind the provider's own queue.
    const deadline = Date.now() + 60 * 60_000;
    while (Date.now() < deadline) {
      const j = await getBrowserJob(id);
      if (!j) throw new Error("browser job vanished");
      if (j.status === "done") {
        const result = (await one<{ result: any }>(`SELECT result FROM browser_jobs WHERE id = $1`, [id]))!.result;
        return { clipUrl: result.clipUrl, lastFrameUrl: result.lastFrameUrl ?? undefined, meta: { ...result.meta, costUsd: 0, browserJobId: id } };
      }
      if (j.status === "failed") {
        const r = await one<{ error: string }>(`SELECT error FROM browser_jobs WHERE id = $1`, [id]);
        throw new Error(`browser worker failed: ${r?.error ?? "unknown"}`);
      }
      if (j.status === "paused") throw new BrowserPausedError(id);
      await sleep(4000, signal);
    }
    throw new Error("browser job timed out after 60 minutes");
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const online = await workerOnline(this.userId, this.providerId);
    return online
      ? { ok: true, message: "A macOS worker is online for this provider. Use the Mac app's Test button to submit a 1-line prompt through the site." }
      : { ok: false, message: "No macOS worker online. Open LongForm for Mac, sign in, and enable this provider in Browser Mode." };
  }
}

export class BrowserPausedError extends Error {
  constructor(public jobId: string) { super("browser worker paused: user intervention required (captcha or unexpected dialog)"); }
}
