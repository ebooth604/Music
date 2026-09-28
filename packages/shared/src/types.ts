import { z } from "zod";

// ---------- Enums ----------
export const ProviderId = z.enum(["runway", "kling", "luma", "sora", "veo"]);
export type ProviderId = z.infer<typeof ProviderId>;

export const GenerationMode = z.enum(["api", "browser"]);
export type GenerationMode = z.infer<typeof GenerationMode>;

export const AspectRatio = z.enum(["16:9", "9:16", "1:1", "4:3", "21:9"]);
export type AspectRatio = z.infer<typeof AspectRatio>;

export const ClipLength = z.union([z.literal(15), z.literal(30)]);
export type ClipLength = z.infer<typeof ClipLength>;

export const Transition = z.enum(["cut", "crossfade"]);
export type Transition = z.infer<typeof Transition>;

export const ShotType = z.enum([
  "extreme-wide", "wide", "medium", "medium-close", "close-up", "extreme-close-up",
  "over-the-shoulder", "pov", "aerial", "tracking", "insert",
]);
export type ShotType = z.infer<typeof ShotType>;

export const ProjectStatus = z.enum([
  "draft",          // prompt entered, bible not yet generated
  "planning",       // Steps A+B running
  "bible_ready",    // awaiting user approval / edits
  "prompting",      // Step C running
  "generating",     // Steps D+E running shot by shot
  "assembling",     // Step F
  "complete",
  "failed",
  "paused",
]);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

export const ShotStatus = z.enum([
  "planned",      // beat exists, prompt not yet built
  "queued",       // prompt built, waiting for generator
  "generating",   // generator running (API call or browser worker)
  "checking",     // quality gate running
  "retrying",     // failed gate, regenerating (attempt < max)
  "passed",       // clip accepted; never regenerated automatically
  "failed",       // exhausted retries; user can regenerate manually
  "paused",       // browser worker needs user intervention (captcha etc.)
]);
export type ShotStatus = z.infer<typeof ShotStatus>;

// ---------- Story Bible ----------
export const Character = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().describe("Narrative role, e.g. protagonist, antagonist, extra"),
  age: z.string(),
  face: z.string().describe("Face shape, eyes, skin, notable features"),
  hair: z.string(),
  wardrobe: z.string().describe("Exact clothing; must stay identical across clips unless the beat sheet changes it"),
  distinguishingMarks: z.string(),
  lockedDescription: z.string().describe("Single paragraph repeated verbatim in every clip prompt where the character appears"),
});
export type Character = z.infer<typeof Character>;

export const Location = z.object({
  id: z.string(),
  name: z.string(),
  lockedDescription: z.string().describe("Single paragraph repeated verbatim in every clip prompt set in this location"),
});
export type Location = z.infer<typeof Location>;

export const MasterPrompt = z.object({
  logline: z.string(),
  genre: z.string(),
  visualStyle: z.string(),
  colourPalette: z.string(),
  lighting: z.string(),
  cameraStyle: z.string(),
  pacing: z.string(),
  tone: z.string(),
  styleBlock: z.string().describe(
    "The exact style paragraph that is prepended verbatim to EVERY clip prompt. Combines visual style, palette, lighting, camera and tone into one dense block.",
  ),
  negativePrompt: z.string().default(""),
});
export type MasterPrompt = z.infer<typeof MasterPrompt>;

export const Beat = z.object({
  index: z.number().int().min(0),
  scene: z.string(),
  action: z.string(),
  characterIds: z.array(z.string()),
  locationId: z.string(),
  emotionalTone: z.string(),
  shotType: ShotType,
  transitionIn: Transition.default("cut"),
  cameraMovement: z.string().default("static"),
});
export type Beat = z.infer<typeof Beat>;

export const StoryBible = z.object({
  master: MasterPrompt,
  characters: z.array(Character),
  locations: z.array(Location),
  beats: z.array(Beat),
});
export type StoryBible = z.infer<typeof StoryBible>;

// ---------- Project / shot ----------
export const ProjectSettings = z.object({
  targetMinutes: z.number().min(1).max(60).default(15),
  clipLength: ClipLength.default(15),
  aspectRatio: AspectRatio.default("16:9"),
  providerId: ProviderId.default("runway"),
  mode: GenerationMode.default("api"),
  musicUrl: z.string().url().optional(),
  maxRetries: z.number().int().min(0).max(5).default(2),
});
export type ProjectSettings = z.infer<typeof ProjectSettings>;

export const ContinuityNote = z.object({
  pose: z.string(),
  position: z.string(),
  lighting: z.string(),
  cameraFraming: z.string(),
  summary: z.string().describe("One sentence description of the exact final frame"),
});
export type ContinuityNote = z.infer<typeof ContinuityNote>;

export const QualityReport = z.object({
  pass: z.boolean(),
  score: z.number().min(0).max(1),
  characterConsistency: z.number().min(0).max(1),
  styleConsistency: z.number().min(0).max(1),
  continuity: z.number().min(0).max(1),
  issues: z.array(z.string()),
});
export type QualityReport = z.infer<typeof QualityReport>;

export const Shot = z.object({
  id: z.string(),
  projectId: z.string(),
  index: z.number().int(),
  beat: Beat,
  prompt: z.string().nullable(),
  continuityNote: ContinuityNote.nullable(),
  status: ShotStatus,
  attempt: z.number().int().default(0),
  clipUrl: z.string().nullable(),
  lastFrameUrl: z.string().nullable(),
  firstFrameUrl: z.string().nullable(),
  quality: QualityReport.nullable(),
  providerId: ProviderId,
  mode: GenerationMode,
  costUsd: z.number().default(0),
  error: z.string().nullable(),
  updatedAt: z.string(),
});
export type Shot = z.infer<typeof Shot>;

export const Project = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  prompt: z.string(),
  settings: ProjectSettings,
  status: ProjectStatus,
  bible: StoryBible.nullable(),
  finalUrl: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof Project>;

export const ProgressSummary = z.object({
  total: z.number().int(),
  passed: z.number().int(),
  generating: z.number().int(),
  failed: z.number().int(),
  etaSeconds: z.number().nullable(),
  costUsd: z.number(),
});
export type ProgressSummary = z.infer<typeof ProgressSummary>;

// ---------- Provider settings ----------
export const ProviderSetting = z.object({
  providerId: ProviderId,
  mode: GenerationMode,
  hasApiKey: z.boolean(),
  browserWorkerOnline: z.boolean(),
});
export type ProviderSetting = z.infer<typeof ProviderSetting>;

// ---------- Browser worker protocol ----------
export const BrowserJob = z.object({
  id: z.string(),
  shotId: z.string(),
  projectId: z.string(),
  providerId: ProviderId,
  prompt: z.string(),
  startFrameUrl: z.string().nullable(),
  duration: ClipLength,
  aspectRatio: AspectRatio,
  attempt: z.number().int(),
});
export type BrowserJob = z.infer<typeof BrowserJob>;

export const BrowserJobResult = z.object({
  clipUrl: z.string(),
  lastFrameUrl: z.string().nullable(),
  meta: z.record(z.unknown()).default({}),
});
export type BrowserJobResult = z.infer<typeof BrowserJobResult>;
