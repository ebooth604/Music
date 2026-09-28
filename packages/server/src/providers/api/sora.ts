import type { GenerateClipRequest } from "@longform/shared";
import { CLIP_COST_USD } from "@longform/shared";
import { ApiClipGenerator, http } from "./base.js";

const BASE = "https://api.openai.com/v1";

export class SoraGenerator extends ApiClipGenerator {
  readonly providerId = "sora" as const;
  readonly supportsStartFrame = true;
  private headers() { return { Authorization: `Bearer ${this.apiKey}` }; }

  protected async submit(req: GenerateClipRequest, signal?: AbortSignal): Promise<string> {
    const size = req.aspectRatio === "9:16" ? "720x1280" : "1280x720";
    if (req.startFrame) {
      // Sora takes the reference image as multipart; fetch and forward it.
      const img = await fetch(req.startFrame).then((r) => r.blob());
      const fd = new FormData();
      fd.set("model", "sora-2"); fd.set("prompt", req.prompt); fd.set("size", size);
      fd.set("seconds", String(Math.min(req.duration, 20)));
      fd.set("input_reference", img, "start.png");
      const res = await fetch(`${BASE}/videos`, { method: "POST", headers: this.headers(), body: fd, signal });
      if (!res.ok) throw new Error(`sora submit ${res.status}: ${await res.text()}`);
      return (await res.json() as { id: string }).id;
    }
    const r = await http<{ id: string }>(`${BASE}/videos`, {
      headers: this.headers(), signal,
      json: { model: "sora-2", prompt: req.prompt, size, seconds: String(Math.min(req.duration, 20)) },
    });
    return r.id;
  }
  protected async status(id: string, signal?: AbortSignal) {
    const r = await http<{ status: string; error?: { message: string } }>(`${BASE}/videos/${id}`, { headers: this.headers(), signal });
    if (r.status === "failed") return { done: true, failed: r.error?.message ?? "failed" };
    // Sora content is fetched from a separate endpoint; the pipeline downloads with the same bearer via this URL wrapper.
    return { done: r.status === "completed", url: r.status === "completed" ? `${BASE}/videos/${id}/content` : undefined };
  }
  protected costUsd(req: GenerateClipRequest) { return CLIP_COST_USD.sora[req.duration]; }
}
