import fs from "node:fs";
import path from "node:path";
import type { Project, Shot } from "@longform/shared";
import { downloadToFile, putFile } from "../storage/s3.js";
import { durationSeconds, ffmpeg, workPath } from "../util/ffmpeg.js";

const XFADE_SECONDS = 0.75;

/**
 * Step F – Assembler.
 * Normalises every clip to a common codec/size/fps, then concatenates with hard cuts or xfade
 * crossfades per beat.transitionIn, optionally mixes a music bed, exports H.264 MP4.
 * Works identically whether clips came from API or Browser mode: all it sees are clip URLs.
 */
export async function assemble(project: Project, shots: Shot[]): Promise<string> {
  const ordered = [...shots].sort((a, b) => a.index - b.index);
  const missing = ordered.filter((s) => s.status !== "passed" || !s.clipUrl);
  if (missing.length) throw new Error(`cannot assemble: shots not passed: ${missing.map((s) => s.index).join(",")}`);

  const dir = workPath(project.id, "assemble", ".keep");
  const base = path.dirname(dir);
  const [w, h] = sizeFor(project.settings.aspectRatio);

  // 1. download + normalise
  const norm: string[] = [];
  for (const s of ordered) {
    const raw = path.join(base, `raw_${s.index}.mp4`);
    const out = path.join(base, `norm_${s.index}.mp4`);
    if (!fs.existsSync(out)) {
      await downloadToFile(s.clipUrl!, raw);
      await ffmpeg([
        "-i", raw,
        "-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p`,
        "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", out,
      ]);
    }
    norm.push(out);
  }

  // 2. concat with transitions
  const silent = path.join(base, "video.mp4");
  const anyXfade = ordered.some((s, i) => i > 0 && s.beat.transitionIn === "crossfade");
  if (!anyXfade) {
    const list = path.join(base, "list.txt");
    fs.writeFileSync(list, norm.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));
    await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", silent]);
  } else {
    // Build a filter graph: successive xfade for crossfades; for hard cuts use xfade with a 0.02s
    // duration (visually a cut) so the whole chain stays a single graph.
    const durs = await Promise.all(norm.map(durationSeconds));
    const inputs = norm.flatMap((f) => ["-i", f]);
    let filter = "";
    let prev = "[0:v]";
    let offset = durs[0];
    for (let i = 1; i < norm.length; i++) {
      const cross = ordered[i].beat.transitionIn === "crossfade";
      const d = cross ? XFADE_SECONDS : 0.02;
      const label = i === norm.length - 1 ? "[v]" : `[v${i}]`;
      filter += `${prev}[${i}:v]xfade=transition=${cross ? "fade" : "fade"}:duration=${d}:offset=${(offset - d).toFixed(3)}${label};`;
      offset += durs[i] - d;
      prev = label;
    }
    await ffmpeg([...inputs, "-filter_complex", filter.replace(/;$/, ""), "-map", "[v]", "-c:v", "libx264", "-crf", "18", "-preset", "medium", silent]);
  }

  // 3. optional music bed, loop/trim to length, fade out
  const final = path.join(base, "final.mp4");
  if (project.settings.musicUrl) {
    const music = path.join(base, "music");
    await downloadToFile(project.settings.musicUrl, music);
    const total = await durationSeconds(silent);
    await ffmpeg([
      "-i", silent, "-stream_loop", "-1", "-i", music,
      "-filter_complex", `[1:a]atrim=0:${total.toFixed(2)},afade=t=out:st=${Math.max(0, total - 3).toFixed(2)}:d=3,volume=0.8[a]`,
      "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", final,
    ]);
  } else {
    await ffmpeg(["-i", silent, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-shortest", "-c:v", "copy", "-c:a", "aac", final]);
  }

  return putFile(`projects/${project.id}/final.mp4`, final, "video/mp4");
}

function sizeFor(ar: string): [number, number] {
  switch (ar) {
    case "9:16": return [1080, 1920];
    case "1:1": return [1080, 1080];
    case "4:3": return [1440, 1080];
    case "21:9": return [2520, 1080];
    default: return [1920, 1080];
  }
}
