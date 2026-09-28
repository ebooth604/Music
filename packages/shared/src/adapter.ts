import type { AspectRatio, ClipLength, GenerationMode, ProviderId } from "./types.js";

/**
 * The single adapter contract shared by every provider in every mode.
 *
 * The planner, continuity prompter, quality gate and assembler only ever see
 * this interface, so they cannot tell (and must not care) whether a clip came
 * from a REST API or from a browser session driven on the user's Mac.
 *
 * The Swift mirror of this protocol lives in apps/swift/Sources/LongFormKit/ClipGenerator.swift.
 */
export interface GenerateClipRequest {
  prompt: string;
  /** URL of a still image used as the first frame (image-to-video). Omitted for the first shot. */
  startFrame?: string;
  duration: ClipLength;
  aspectRatio: AspectRatio;
  /** Opaque per-project seed so providers that support it keep look consistent. */
  seed?: number;
  /** Provider-specific negative prompt, when supported. */
  negativePrompt?: string;
}

export interface GenerateClipResult {
  /** Downloadable URL of the finished clip (provider URL or our storage). */
  clipUrl: string;
  /** URL of the clip's final frame, if the provider exposes it; the pipeline extracts it with ffmpeg otherwise. */
  lastFrameUrl?: string;
  meta: {
    providerJobId?: string;
    costUsd?: number;
    durationSeconds?: number;
    width?: number;
    height?: number;
    [k: string]: unknown;
  };
}

export interface ClipGenerator {
  readonly providerId: ProviderId;
  readonly mode: GenerationMode;
  /** True when the provider accepts a start-frame image (image-to-video). */
  readonly supportsStartFrame: boolean;
  generateClip(req: GenerateClipRequest, signal?: AbortSignal): Promise<GenerateClipResult>;
  /** Submits a one-line prompt and confirms the whole flow works. */
  testConnection(): Promise<{ ok: boolean; message: string }>;
}
