import crypto from "node:crypto";
import { config } from "../config.js";

const key = Buffer.from(config.keyEncryptionKey, "hex");
if (key.length !== 32) throw new Error("KEY_ENCRYPTION_KEY must be 32 bytes hex");

/** AES-256-GCM. Output: base64(iv).base64(tag).base64(ciphertext) */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(blob: string): string {
  const [iv, tag, ct] = blob.split(".").map((s) => Buffer.from(s, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}
