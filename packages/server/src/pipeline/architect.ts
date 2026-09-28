import { z } from "zod";
import { Character, Location, MasterPrompt, type ProjectSettings } from "@longform/shared";
import { structured } from "../llm/claude.js";

const ArchitectOutput = z.object({
  title: z.string(),
  master: MasterPrompt,
  characters: z.array(Character),
  locations: z.array(Location),
});
export type ArchitectOutput = z.infer<typeof ArchitectOutput>;

const SYSTEM = `You are the Prompt Architect for LongForm, a system that turns one sentence into a
continuous film made of many short AI-generated clips. Video models have no memory between clips,
so EVERYTHING that must stay consistent has to be written down once, precisely, and reused verbatim.

Produce:
- master.styleBlock: ONE dense paragraph (80-140 words) that will be prepended, unchanged, to every
  clip prompt. It must nail genre, visual style, colour palette (name specific hues), lighting
  (key/fill/practical sources, time of day), camera language (lens, movement vocabulary, framing
  habits), film stock / render look, pacing and tone. Write it as direct instructions to a video model.
- Every recurring character with a lockedDescription: ONE paragraph (50-90 words) stating age, face
  shape, eyes, skin, hair (colour, length, style), exact wardrobe (colours, materials, layers, footwear),
  distinguishing marks, and typical posture. Wardrobe must not change across the film unless the story
  demands it. Use ids like "c1", "c2".
- Every recurring location with a lockedDescription (40-80 words): architecture, materials, colours,
  set dressing, light sources, weather/atmosphere. Use ids like "l1", "l2".
- master.negativePrompt: things to avoid (text, watermarks, extra limbs, style names that clash).

Prefer 1-3 characters and 2-5 locations: fewer recurring elements means better consistency.`;

export async function promptArchitect(userPrompt: string, settings: ProjectSettings): Promise<ArchitectOutput> {
  return structured({
    system: SYSTEM,
    user: `User prompt: "${userPrompt}"\nTarget runtime: ${settings.targetMinutes} minutes. Clip length: ${settings.clipLength}s. Aspect ratio: ${settings.aspectRatio}.`,
    schema: ArchitectOutput,
    effort: "high",
  });
}
