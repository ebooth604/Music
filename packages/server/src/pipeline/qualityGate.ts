import { QualityReport, type Shot, type StoryBible } from "@longform/shared";
import { imageBlock, structured } from "../llm/claude.js";

const SYSTEM = `You are the Quality Gate for a multi-clip AI film. You compare frames from a newly
generated clip against the locked Story Bible and the previous clip, and decide whether the clip
keeps style, character and continuity.

Score 0-1 for each of:
- characterConsistency: faces, hair, wardrobe, marks match the locked descriptions and the reference frame.
- styleConsistency: palette, lighting, lens/camera look match the STYLE block and the reference frame.
- continuity: the clip's FIRST frame plausibly continues from the previous clip's LAST frame (position, pose, lighting).
pass = every score >= 0.7 AND no severe issue (wrong wardrobe, different face, extra characters, text/watermark, style change).
List concrete issues. Be strict on wardrobe and face; be lenient on minor framing drift.`;

export const PASS_THRESHOLD = 0.7;

export async function qualityCheck(opts: {
  bible: StoryBible;
  shot: Shot;
  firstFrameUrl: string;
  lastFrameUrl: string;
  /** Last frame of the previous PASSED clip (the image the new clip should start on). */
  previousLastFrameUrl: string | null;
  /** First frame of shot 0 — the canonical style reference for the whole film. */
  styleReferenceUrl: string | null;
}): Promise<QualityReport> {
  const cast = opts.bible.characters.filter((c) => opts.shot.beat.characterIds.includes(c.id));
  const content: Parameters<typeof structured>[0]["user"] = [];
  if (opts.styleReferenceUrl) {
    content.push({ type: "text", text: "STYLE REFERENCE (first frame of the film):" }, await imageBlock(opts.styleReferenceUrl));
  }
  if (opts.previousLastFrameUrl) {
    content.push({ type: "text", text: "PREVIOUS CLIP LAST FRAME (new clip must start here):" }, await imageBlock(opts.previousLastFrameUrl));
  }
  content.push(
    { type: "text", text: "NEW CLIP FIRST FRAME:" }, await imageBlock(opts.firstFrameUrl),
    { type: "text", text: "NEW CLIP LAST FRAME:" }, await imageBlock(opts.lastFrameUrl),
    { type: "text", text:
      `STYLE block:\n${opts.bible.master.styleBlock}\n\nExpected characters:\n` +
      (cast.map((c) => `${c.name}: ${c.lockedDescription}`).join("\n") || "(none)") +
      `\n\nBeat: ${opts.shot.beat.action}\nShot type: ${opts.shot.beat.shotType}` },
  );
  const report = await structured({ system: SYSTEM, user: content, schema: QualityReport, effort: "medium", maxTokens: 2000 });
  const min = Math.min(report.characterConsistency, report.styleConsistency, opts.previousLastFrameUrl ? report.continuity : 1);
  return { ...report, pass: report.pass && min >= PASS_THRESHOLD };
}
