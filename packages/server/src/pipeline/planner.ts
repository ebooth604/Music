import { z } from "zod";
import { Beat, shotCount, type ProjectSettings } from "@longform/shared";
import type { ArchitectOutput } from "./architect.js";
import { structured } from "../llm/claude.js";

const PlannerOutput = z.object({ beats: z.array(Beat) });

const SYSTEM = `You are the Story Planner for LongForm. You receive a locked Story Bible (style, cast,
locations) and must break the runtime into a beat sheet: exactly N beats, one per clip, in order.

Rules:
- Each beat is ONE continuous take of the given clip length. No internal cuts.
- index runs 0..N-1 with no gaps.
- characterIds / locationId must reference ids from the bible only.
- Consecutive beats in the same location with the same characters should flow physically: the end
  state of one beat is the start state of the next (same room, same pose family) so clips can chain.
- Use transitionIn "cut" for most beats; "crossfade" only at scene/time changes (roughly 1 in 8).
- Vary shotType and cameraMovement with cinematic intent; avoid the same shotType 3 times in a row.
- Follow a classic structure across the runtime: setup (first 15%), rising tension, midpoint turn,
  escalation, climax (around 85%), resolution.
- action: 1-3 sentences of concrete, visible action (what the camera sees), present tense. No dialogue.
- emotionalTone: 2-5 words.`;

export async function storyPlanner(userPrompt: string, bible: ArchitectOutput, settings: ProjectSettings): Promise<Beat[]> {
  const n = shotCount(settings.targetMinutes, settings.clipLength);
  const out = await structured({
    system: SYSTEM,
    user:
      `Original prompt: "${userPrompt}"\n` +
      `Number of beats N = ${n}. Clip length ${settings.clipLength}s.\n\n` +
      `Story Bible:\n${JSON.stringify({ master: bible.master, characters: bible.characters, locations: bible.locations }, null, 2)}`,
    schema: PlannerOutput,
    effort: "high",
    maxTokens: 32000,
  });
  const beats = out.beats.slice(0, n).map((b, i) => ({ ...b, index: i }));
  // If the model under-delivered, pad by extending the final beat rather than failing the run.
  while (beats.length < n) {
    const last = beats[beats.length - 1];
    beats.push({ ...last, index: beats.length, action: `${last.action} The moment holds and continues.` });
  }
  const ids = new Set(bible.characters.map((c) => c.id));
  const lids = new Set(bible.locations.map((l) => l.id));
  for (const b of beats) {
    b.characterIds = b.characterIds.filter((id) => ids.has(id));
    if (!lids.has(b.locationId)) b.locationId = bible.locations[0]?.id ?? b.locationId;
  }
  return beats;
}
