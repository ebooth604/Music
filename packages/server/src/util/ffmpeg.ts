import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${bin} exited ${code}: ${err.slice(-2000)}`))));
  });
}

export const ffmpeg = (args: string[]) => run(config.ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...args]);

export async function durationSeconds(file: string): Promise<number> {
  const out = await run(config.ffprobePath, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return parseFloat(out.trim());
}

/** Extracts the very last frame as PNG (used as next clip's start frame + continuity reference). */
export async function extractLastFrame(video: string, outPng: string): Promise<string> {
  fs.mkdirSync(path.dirname(outPng), { recursive: true });
  const d = await durationSeconds(video);
  await ffmpeg(["-sseof", "-0.1", "-i", video, "-frames:v", "1", "-update", "1", outPng]).catch(async () => {
    // fallback for containers where -sseof is unreliable
    await ffmpeg(["-ss", String(Math.max(0, d - 0.1)), "-i", video, "-frames:v", "1", "-update", "1", outPng]);
  });
  return outPng;
}

export async function extractFirstFrame(video: string, outPng: string): Promise<string> {
  fs.mkdirSync(path.dirname(outPng), { recursive: true });
  await ffmpeg(["-i", video, "-frames:v", "1", "-update", "1", outPng]);
  return outPng;
}

export function workPath(...parts: string[]): string {
  const p = path.join(config.workDir, ...parts);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}
