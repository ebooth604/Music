import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { config } from "../config.js";

let client: Anthropic | null = null;
export function claude(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

/**
 * One structured call. Every planning step (A, B, C-note, E) goes through here so
 * the model, effort and parsing behaviour are consistent and easy to tune.
 */
export async function structured<T extends z.ZodTypeAny>(opts: {
  system: string;
  user: Anthropic.MessageParam["content"];
  schema: T;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<T>> {
  const response = await claude().messages.parse({
    model: config.claudeModel,
    max_tokens: opts.maxTokens ?? 16000,
    thinking: { type: "adaptive" },
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.user }],
    output_config: { effort: opts.effort ?? "high", format: zodOutputFormat(opts.schema) },
  });
  if (response.stop_reason === "refusal") {
    const details = (response as { stop_details?: { explanation?: string } }).stop_details;
    throw new Error(`Claude declined the request${details?.explanation ? `: ${details.explanation}` : ""}`);
  }
  if (response.stop_reason === "max_tokens") throw new Error("Claude output truncated (max_tokens)");
  if (!response.parsed_output) throw new Error("Claude returned no parseable structured output");
  return response.parsed_output;
}

export async function imageBlock(url: string): Promise<Anthropic.ImageBlockParam> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch image ${url}: ${res.status}`);
  const ct = (res.headers.get("content-type") ?? "image/png").split(";")[0] as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  const data = Buffer.from(await res.arrayBuffer()).toString("base64");
  return { type: "image", source: { type: "base64", media_type: ct, data } };
}
