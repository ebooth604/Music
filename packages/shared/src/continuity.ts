import type { Beat, Character, ContinuityNote, Location, MasterPrompt } from "./types.js";

export interface BuildClipPromptInput {
  master: MasterPrompt;
  characters: Character[];
  locations: Location[];
  beat: Beat;
  /** Exact final frame of the previous clip. Null for the first shot. */
  previous: ContinuityNote | null;
  durationSeconds: number;
}

/**
 * Step C – Continuity Prompter (deterministic part).
 *
 * The clip prompt is assembled from fixed sections in a fixed order:
 *   1. STYLE   – master.styleBlock, repeated VERBATIM in every prompt (never paraphrased)
 *   2. CAST    – lockedDescription of every character present, verbatim
 *   3. SETTING – lockedDescription of the location, verbatim
 *   4. CONTINUITY – the exact final frame of the previous clip so this clip opens on it
 *   5. ACTION  – the beat: shot type, camera movement, action, emotional tone
 *   6. RULES   – duration + hard constraints
 *
 * Only section 4 and 5 vary between shots. This is what stops style drift.
 */
export function buildClipPrompt(input: BuildClipPromptInput): string {
  const { master, beat, previous } = input;
  const cast = input.characters.filter((c) => beat.characterIds.includes(c.id));
  const location = input.locations.find((l) => l.id === beat.locationId);

  const sections: string[] = [];
  sections.push(`[STYLE — identical in every shot]\n${master.styleBlock.trim()}`);

  if (cast.length) {
    sections.push(
      `[CAST — locked descriptions, do not alter]\n` +
        cast.map((c) => `${c.name}: ${c.lockedDescription.trim()}`).join("\n"),
    );
  }
  if (location) {
    sections.push(`[SETTING — locked]\n${location.name}: ${location.lockedDescription.trim()}`);
  }

  if (previous) {
    sections.push(
      `[CONTINUITY — this clip begins EXACTLY on the previous clip's final frame]\n` +
        `Opening frame: ${previous.summary.trim()}\n` +
        `Pose: ${previous.pose.trim()}\n` +
        `Position: ${previous.position.trim()}\n` +
        `Lighting: ${previous.lighting.trim()}\n` +
        `Framing: ${previous.cameraFraming.trim()}\n` +
        `Pick up seamlessly from that frame with no cut, no jump, no change of wardrobe, lighting or set dressing.`,
    );
  } else {
    sections.push(`[CONTINUITY]\nThis is the opening shot of the film. Establish the world.`);
  }

  sections.push(
    `[SHOT ${beat.index + 1}]\n` +
      `Shot type: ${beat.shotType}. Camera: ${beat.cameraMovement}.\n` +
      `Scene: ${beat.scene.trim()}\n` +
      `Action: ${beat.action.trim()}\n` +
      `Emotional tone: ${beat.emotionalTone.trim()}`,
  );

  sections.push(
    `[RULES]\n` +
      `Duration ${input.durationSeconds} seconds, one continuous take, no cuts, no text, no captions, no watermarks. ` +
      `Characters keep the same face, hair, wardrobe and marks described above. ` +
      `Keep the colour palette, lighting and camera language exactly as in STYLE.` +
      (master.negativePrompt ? `\nAvoid: ${master.negativePrompt.trim()}` : ""),
  );

  return sections.join("\n\n");
}

/** Extracts the verbatim style block back out of a stored prompt (used by tests and the drift checker). */
export function extractStyleBlock(prompt: string): string | null {
  const m = prompt.match(/\[STYLE — identical in every shot\]\n([\s\S]*?)\n\n\[/);
  return m ? m[1] : null;
}
