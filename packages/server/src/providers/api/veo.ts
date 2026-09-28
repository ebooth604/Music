import type { GenerateClipRequest } from "@longform/shared";
import { CLIP_COST_USD } from "@longform/shared";
import { ApiClipGenerator, http } from "./base.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "veo-3.0-generate-001";

export class VeoGenerator extends ApiClipGenerator {
  readonly providerId = "veo" as const;
  readonly supportsStartFrame = true;
  private headers() { return { "x-goog-api-key": this.apiKey }; }

  protected async submit(req: GenerateClipRequest, signal?: AbortSignal): Promise<string> {
    const instance: Record<string, unknown> = { prompt: req.prompt };
    if (req.startFrame) {
      const res = await fetch(req.startFrame);
      instance.image = { bytesBase64Encoded: Buffer.from(await res.arrayBuffer()).toString("base64"), mimeType: res.headers.get("content-type") ?? "image/png" };
    }
    const r = await http<{ name: string }>(`${BASE}/models/${MODEL}:predictLongRunning`, {
      headers: this.headers(), signal,
      json: { instances: [instance], parameters: { aspectRatio: req.aspectRatio === "9:16" ? "9:16" : "16:9", negativePrompt: req.negativePrompt, durationSeconds: 8 } },
    });
    return r.name;
  }
  protected async status(name: string, signal?: AbortSignal) {
    const r = await http<{ done?: boolean; error?: { message: string }; response?: { generateVideoResponse?: { generatedSamples?: { video: { uri: string } }[] } } }>(
      `${BASE}/${name}`, { headers: this.headers(), signal });
    if (r.error) return { done: true, failed: r.error.message };
    const uri = r.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    return { done: !!r.done, url: uri ? `${uri}${uri.includes("?") ? "&" : "?"}key=${this.apiKey}` : undefined };
  }
  protected costUsd(req: GenerateClipRequest) { return CLIP_COST_USD.veo[req.duration]; }
}
