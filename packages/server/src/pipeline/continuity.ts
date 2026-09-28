import { ContinuityNote, buildClipPrompt, type Beat, type StoryBible } from "@longform/shared";
import { imageBlock, structured } from "../llm/claude.js";

const SYSTEM = `You describe the EXACT final frame of a video clip so the next clip can begin on it.
Be literal and spatial: where each character is in frame (left/centre/right, foreground/background),
their body pose and head direction, hands, props, the light direction and quality, camera framing and
lens feel. 1-2 sentences per field. Do not describe motion or story, only the frozen last frame.`;

/** Step C, dynamic half: look at the previous clip's last frame and write the continuity note. */
export async function describeLastFrame(lastFrameUrl: string, bible: StoryBible, beat: Beat): Promise<ContinuityNote> {
  const cast = bible.characters.filter((c) => beat.characterIds.includes(c.id));
  return structured({
    system: SYSTEM,
    user: [
      await imageBlock(lastFrameUrl),
      { type: "text", text: `Characters who may be present:\n${cast.map((c) => `${c.name}: ${c.lockedDescription}`).join("\n")}\n\nDescribe this final frame.` },
    ],
    schema: ContinuityNote,
    effort: "medium",
    maxTokens: 2000,
  });
}

/** When there is no frame yet (e.g. previous clip pending) fall back to a note derived from the beat text. */
export function noteFromBeat(prev: Beat): ContinuityNote {
  return {
    pose: "as they were at the end of the previous action",
    position: "same position in frame as the end of the previous shot",
    lighting: "unchanged from previous shot",
    cameraFraming: `${prev.shotType}, ${prev.cameraMovement}`,
    summary: `End state of: ${prev.action}`,
  };
}

export function clipPromptFor(bible: StoryBible, beat: Beat, previous: ContinuityNote | null, clipLength: number): string {
  return buildClipPrompt({
    master: bible.master, characters: bible.characters, locations: bible.locations,
    beat, previous, durationSeconds: clipLength,
  });
}
