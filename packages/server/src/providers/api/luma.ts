import type { GenerateClipRequest } from "@longform/shared";
import { CLIP_COST_USD } from "@longform/shared";
import { ApiClipGenerator, http } from "./base.js";

const BASE = "https://api.lumalabs.ai/dream-machine/v1";

export class LumaGenerator extends ApiClipGenerator {
  readonly providerId = "luma" as const;
  readonly supportsStartFrame = true;
  private headers() { return { Authorization: `Bearer ${this.apiKey}` }; }

  protected async submit(req: GenerateClipRequest, signal?: AbortSignal): Promise<string> {
    const body: Record<string, unknown> = {
      model: "ray-2", prompt: req.prompt, aspect_ratio: req.aspectRatio,
      duration: req.duration >= 9 ? "9s" : "5s", resolution: "1080p",
    };
    if (req.startFrame) body.keyframes = { frame0: { type: "image", url: req.startFrame } };
    const r = await http<{ id: string }>(`${BASE}/generations`, { headers: this.headers(), json: body, signal });
    return r.id;
  }
  protected async status(id: string, signal?: AbortSignal) {
    const r = await http<{ state: string; failure_reason?: string; assets?: { video?: string } }>(`${BASE}/generations/${id}`, { headers: this.headers(), signal });
    if (r.state === "failed") return { done: true, failed: r.failure_reason ?? "failed" };
    return { done: r.state === "completed", url: r.assets?.video };
  }
  protected costUsd(req: GenerateClipRequest) { return CLIP_COST_USD.luma[req.duration]; }
}
