import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "node:fs";
import { config } from "../config.js";

const client = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  forcePathStyle: true,
  credentials: { accessKeyId: config.s3.accessKey, secretAccessKey: config.s3.secretKey },
});

export function publicUrl(key: string): string {
  return `${config.s3.publicBaseUrl.replace(/\/$/, "")}/${key}`;
}

export async function putFile(key: string, filePath: string, contentType: string): Promise<string> {
  await client.send(new PutObjectCommand({
    Bucket: config.s3.bucket, Key: key, Body: fs.createReadStream(filePath), ContentType: contentType,
  }));
  return publicUrl(key);
}

export async function putBuffer(key: string, body: Buffer, contentType: string): Promise<string> {
  await client.send(new PutObjectCommand({ Bucket: config.s3.bucket, Key: key, Body: body, ContentType: contentType }));
  return publicUrl(key);
}

/** Presigned PUT so the macOS worker can upload clips directly without routing through the API. */
export async function presignUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(client, new PutObjectCommand({ Bucket: config.s3.bucket, Key: key, ContentType: contentType }), { expiresIn: 3600 });
}

export async function presignDownload(key: string): Promise<string> {
  return getSignedUrl(client, new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }), { expiresIn: 3600 });
}

/** Download any http(s) URL to a local file (provider result URLs or our own storage). */
export async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(require_dir(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
}
function require_dir(p: string): string { return p.substring(0, p.lastIndexOf("/")) || "."; }
