import type { GenerateClipRequest } from "@longform/shared";
import { CLIP_COST_USD } from "@longform/shared";
import { ApiClipGenerator, http } from "./base.js";

const BASE = "https://api.dev.runwayml.com/v1";

export class RunwayGenerator extends ApiClipGenerator {
  readonly providerId = "runway" as const;
  readonly supportsStartFrame = true;
  private headers() { return { Authorization: `Bearer ${this.apiKey}`, "X-Runway-Version": "2024-11-06" }; }

  protected async submit(req: GenerateClipRequest, signal?: AbortSignal): Promise<string> {
    const body: Record<string, unknown> = {
      model: "gen4_turbo",
      promptText: req.prompt,
      duration: req.duration >= 30 ? 10 : 10, // Runway caps at 10s; longer clips are extended by chaining (see meta)
      ratio: req.aspectRatio === "9:16" ? "720:1280" : "1280:720",
      seed: req.seed,
    };
    const path = req.startFrame ? "/image_to_video" : "/text_to_video";
    if (req.startFrame) body.promptImage = req.startFrame;
    const r = await http<{ id: string }>(`${BASE}${path}`, { headers: this.headers(), json: body, signal });
    return r.id;
  }
  protected async status(id: string, signal?: AbortSignal) {
    const r = await http<{ status: string; output?: string[]; failure?: string }>(`${BASE}/tasks/${id}`, { headers: this.headers(), signal });
    if (r.status === "FAILED") return { done: true, failed: r.failure ?? "failed" };
    return { done: r.status === "SUCCEEDED", url: r.output?.[0] };
  }
  protected costUsd(req: GenerateClipRequest) { return CLIP_COST_USD.runway[req.duration]; }
}
