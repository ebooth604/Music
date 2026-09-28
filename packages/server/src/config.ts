const env = (k: string, d?: string): string => {
  const v = process.env[k] ?? d;
  if (v === undefined) throw new Error(`Missing env ${k}`);
  return v;
};

export const config = {
  port: Number(env("PORT", "4000")),
  databaseUrl: env("DATABASE_URL", "postgres://longform:longform@localhost:5432/longform"),
  redisUrl: env("REDIS_URL", "redis://localhost:6379"),
  jwtSecret: env("JWT_SECRET", "dev-secret-change-me-dev-secret-change-me"),
  keyEncryptionKey: env("KEY_ENCRYPTION_KEY", "00".repeat(32)),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  claudeModel: env("CLAUDE_MODEL", "claude-opus-5"),
  s3: {
    endpoint: env("S3_ENDPOINT", "http://localhost:9000"),
    region: env("S3_REGION", "us-east-1"),
    bucket: env("S3_BUCKET", "longform"),
    accessKey: env("S3_ACCESS_KEY", "minioadmin"),
    secretKey: env("S3_SECRET_KEY", "minioadmin"),
    publicBaseUrl: env("S3_PUBLIC_BASE_URL", "http://localhost:9000/longform"),
  },
  appleClientId: env("APPLE_CLIENT_ID", "com.longform.app"),
  workDir: env("WORK_DIR", "./data/work"),
  ffmpegPath: env("FFMPEG_PATH", "ffmpeg"),
  ffprobePath: env("FFPROBE_PATH", "ffprobe"),
};
