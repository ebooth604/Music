import type { ClipLength } from "./types.js";

/** 15 min ÷ clip length = number of shots. */
export function shotCount(targetMinutes: number, clipLength: ClipLength): number {
  return Math.max(1, Math.ceil((targetMinutes * 60) / clipLength));
}

/** Rough per-clip cost table (USD) used for the live cost estimate in the progress UI. */
export const CLIP_COST_USD: Record<string, Record<ClipLength, number>> = {
  runway: { 15: 1.5, 30: 3.0 },
  kling: { 15: 0.9, 30: 1.8 },
  luma: { 15: 1.2, 30: 2.4 },
  sora: { 15: 2.0, 30: 4.0 },
  veo: { 15: 2.5, 30: 5.0 },
};

/** Rough wall-clock seconds per clip, used for the ETA. Browser mode is slower. */
export const CLIP_SECONDS = { api: 120, browser: 240 } as const;

export function estimate(opts: {
  providerId: string;
  mode: "api" | "browser";
  clipLength: ClipLength;
  remainingShots: number;
}): { etaSeconds: number; costUsd: number } {
  const perClip = CLIP_COST_USD[opts.providerId]?.[opts.clipLength] ?? 1.5;
  // Browser mode uses the user's subscription: no marginal API cost.
  const costUsd = opts.mode === "api" ? perClip * opts.remainingShots : 0;
  return { etaSeconds: CLIP_SECONDS[opts.mode] * opts.remainingShots, costUsd };
}
