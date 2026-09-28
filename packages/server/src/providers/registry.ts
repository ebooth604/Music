import type { ClipGenerator, GenerationMode, ProviderId } from "@longform/shared";
import { decryptSecret } from "../auth/crypto.js";
import { getProviderSetting } from "../db/repo.js";
import { KlingGenerator } from "./api/kling.js";
import { LumaGenerator } from "./api/luma.js";
import { RunwayGenerator } from "./api/runway.js";
import { SoraGenerator } from "./api/sora.js";
import { VeoGenerator } from "./api/veo.js";
import { RemoteBrowserGenerator } from "./browser/remote.js";

const API: Record<ProviderId, new (key: string) => ClipGenerator> = {
  runway: RunwayGenerator, kling: KlingGenerator, luma: LumaGenerator, sora: SoraGenerator, veo: VeoGenerator,
};

export function apiGenerator(providerId: ProviderId, apiKey: string): ClipGenerator {
  return new API[providerId](apiKey);
}

/**
 * Resolves the generator for a shot. `mode` is the shot's current mode (projects can switch
 * mid-run; each shot records which mode produced it).
 */
export async function generatorFor(opts: {
  userId: string; providerId: ProviderId; mode: GenerationMode; projectId: string; shotId: string; attempt: number;
}): Promise<ClipGenerator> {
  if (opts.mode === "browser") {
    return new RemoteBrowserGenerator(opts.providerId, opts.userId, opts);
  }
  const s = await getProviderSetting(opts.userId, opts.providerId);
  if (!s?.apiKeyCiphertext) throw new NoApiKeyError(opts.providerId);
  return apiGenerator(opts.providerId, decryptSecret(s.apiKeyCiphertext));
}

export class NoApiKeyError extends Error {
  constructor(public providerId: ProviderId) { super(`no API key stored for ${providerId}`); }
}
