import type { ClipGenerator, GenerateClipRequest, GenerateClipResult, ProviderId } from "@longform/shared";

export interface HttpOpts { headers?: Record<string, string>; json?: unknown; method?: string; signal?: AbortSignal }

export async function http<T = any>(url: string, opts: HttpOpts = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.json ? "POST" : "GET"),
    headers: { ...(opts.json ? { "content-type": "application/json" } : {}), ...(opts.headers ?? {}) },
    body: opts.json ? JSON.stringify(opts.json) : undefined,
    signal: opts.signal,
  });
  const text = await res.text();
  if (!res.ok) throw new ProviderHttpError(res.status, `${url} -> ${res.status}: ${text.slice(0, 500)}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export class ProviderHttpError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
  /** 401/402/403/429 mean the key is out of credit or rate-limited: candidates for switching to Browser Mode. */
  get isQuotaOrAuth(): boolean { return [401, 402, 403, 429].includes(this.status); }
}

export const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); rej(new Error("aborted")); }, { once: true });
});

/** Polls `check` until it returns a result or the deadline passes. */
export async function poll<T>(check: () => Promise<T | null>, opts: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
  const start = Date.now();
  const timeout = opts.timeoutMs ?? 15 * 60_000;
  while (Date.now() - start < timeout) {
    const r = await check();
    if (r) return r;
    await sleep(opts.intervalMs ?? 5000, opts.signal);
  }
  throw new Error("provider job timed out");
}

/** Shared skeleton for API-mode adapters. Subclasses implement submit/status only. */
export abstract class ApiClipGenerator implements ClipGenerator {
  abstract readonly providerId: ProviderId;
  readonly mode = "api" as const;
  abstract readonly supportsStartFrame: boolean;
  constructor(protected apiKey: string) {}

  protected abstract submit(req: GenerateClipRequest, signal?: AbortSignal): Promise<string>;
  protected abstract status(jobId: string, signal?: AbortSignal): Promise<{ done: boolean; url?: string; failed?: string }>;
  protected costUsd(_req: GenerateClipRequest): number { return 0; }

  async generateClip(req: GenerateClipRequest, signal?: AbortSignal): Promise<GenerateClipResult> {
    const jobId = await this.submit(req, signal);
    const url = await poll(async () => {
      const s = await this.status(jobId, signal);
      if (s.failed) throw new Error(`${this.providerId} job ${jobId} failed: ${s.failed}`);
      return s.done && s.url ? s.url : null;
    }, { signal });
    return { clipUrl: url, meta: { providerJobId: jobId, costUsd: this.costUsd(req), durationSeconds: req.duration } };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const jobId = await this.submit({ prompt: "A single red balloon drifting across a clear blue sky.", duration: 15, aspectRatio: "16:9" });
      return { ok: true, message: `Submitted test job ${jobId}; the API key and request format are valid.` };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  }
}
