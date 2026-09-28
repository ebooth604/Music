CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  apple_sub TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS magic_links (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Provider configuration per user: mode + encrypted API key.
CREATE TABLE IF NOT EXISTS provider_settings (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'api',
  api_key_ciphertext TEXT,        -- AES-256-GCM: iv:tag:ciphertext (base64)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  settings JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  bible JSONB,
  final_url TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_user_idx ON projects(user_id, created_at DESC);

-- One row per shot. Every clip prompt lives here (viewable/editable by the user).
CREATE TABLE IF NOT EXISTS shots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  index INT NOT NULL,
  beat JSONB NOT NULL,
  prompt TEXT,
  continuity_note JSONB,
  status TEXT NOT NULL DEFAULT 'planned',
  attempt INT NOT NULL DEFAULT 0,
  clip_url TEXT,
  first_frame_url TEXT,
  last_frame_url TEXT,
  quality JSONB,
  provider_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, index)
);

-- Every attempt is kept so failed clips remain inspectable.
CREATE TABLE IF NOT EXISTS clip_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shot_id UUID NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  attempt INT NOT NULL,
  mode TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  clip_url TEXT,
  last_frame_url TEXT,
  quality JSONB,
  meta JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- macOS workers that pull Browser Mode jobs.
CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  providers TEXT[] NOT NULL DEFAULT '{}',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS browser_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shot_id UUID NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  provider_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',   -- queued | leased | done | failed | paused
  worker_id UUID,
  leased_at TIMESTAMPTZ,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS browser_jobs_pull_idx ON browser_jobs(user_id, status, created_at);
