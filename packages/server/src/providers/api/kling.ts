import { createHmac } from "node:crypto";
import type { GenerateClipRequest } from "@longform/shared";
import { CLIP_COST_USD } from "@longform/shared";
import { ApiClipGenerator, http } from "./base.js";

const BASE = "https://api.klingai.com/v1";

/** Kling authenticates with a short-lived JWT signed by the secret key. apiKey is "accessKey:secretKey". */
export class KlingGenerator extends ApiClipGenerator {
  readonly providerId = "kling" as const;
  readonly supportsStartFrame = true;
  private lastPath = "/videos/text2video";

  private token(): string {
    const [ak, sk] = this.apiKey.split(":");
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const head = b64({ alg: "HS256", typ: "JWT" });
    const payload = b64({ iss: ak, exp: now + 1800, nbf: now - 5 });
    const sig = createHmac("sha256", sk ?? "").update(`${head}.${payload}`).digest("base64url");
    return `${head}.${payload}.${sig}`;
  }
  private headers() { return { Authorization: `Bearer ${this.token()}` }; }

  protected async submit(req: GenerateClipRequest, signal?: AbortSignal): Promise<string> {
    this.lastPath = req.startFrame ? "/videos/image2video" : "/videos/text2video";
    const body: Record<string, unknown> = {
      model_name: "kling-v2-master",
      prompt: req.prompt,
      negative_prompt: req.negativePrompt,
      duration: req.duration >= 10 ? "10" : "5",
      aspect_ratio: req.aspectRatio,
      mode: "pro",
    };
    if (req.startFrame) body.image = req.startFrame;
    const r = await http<{ data: { task_id: string } }>(`${BASE}${this.lastPath}`, { headers: this.headers(), json: body, signal });
    return r.data.task_id;
  }
  protected async status(id: string, signal?: AbortSignal) {
    const r = await http<{ data: { task_status: string; task_status_msg?: string; task_result?: { videos: { url: string }[] } } }>(
      `${BASE}${this.lastPath}/${id}`, { headers: this.headers(), signal });
    const s = r.data.task_status;
    if (s === "failed") return { done: true, failed: r.data.task_status_msg ?? "failed" };
    return { done: s === "succeed", url: r.data.task_result?.videos?.[0]?.url };
  }
  protected costUsd(req: GenerateClipRequest) { return CLIP_COST_USD.kling[req.duration]; }
}
