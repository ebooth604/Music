import type {
  BrowserJob, BrowserJobResult, ContinuityNote, GenerationMode, Project, ProjectSettings,
  ProjectStatus, ProviderId, QualityReport, Shot, ShotStatus, StoryBible,
} from "@longform/shared";
import { one, query } from "./pool.js";

// ---------- row mappers ----------
const projectRow = (r: any): Project => ({
  id: r.id, userId: r.user_id, title: r.title, prompt: r.prompt, settings: r.settings,
  status: r.status, bible: r.bible, finalUrl: r.final_url, error: r.error,
  createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString(),
});
const shotRow = (r: any): Shot => ({
  id: r.id, projectId: r.project_id, index: r.index, beat: r.beat, prompt: r.prompt,
  continuityNote: r.continuity_note, status: r.status, attempt: r.attempt, clipUrl: r.clip_url,
  lastFrameUrl: r.last_frame_url, firstFrameUrl: r.first_frame_url, quality: r.quality,
  providerId: r.provider_id, mode: r.mode, costUsd: Number(r.cost_usd), error: r.error,
  updatedAt: new Date(r.updated_at).toISOString(),
});

// ---------- users ----------
export async function upsertUserByEmail(email: string): Promise<{ id: string }> {
  const r = await one<{ id: string }>(
    `INSERT INTO users (email) VALUES ($1) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`, [email]);
  return r!;
}
export async function upsertUserByApple(sub: string, email?: string): Promise<{ id: string }> {
  const r = await one<{ id: string }>(
    `INSERT INTO users (apple_sub, email) VALUES ($1, $2)
     ON CONFLICT (apple_sub) DO UPDATE SET email = COALESCE(users.email, EXCLUDED.email) RETURNING id`, [sub, email ?? null]);
  return r!;
}

// ---------- projects ----------
export async function createProject(userId: string, title: string, prompt: string, settings: ProjectSettings): Promise<Project> {
  const r = await one(`INSERT INTO projects (user_id, title, prompt, settings) VALUES ($1,$2,$3,$4) RETURNING *`,
    [userId, title, prompt, settings]);
  return projectRow(r);
}
export async function getProject(id: string): Promise<Project | null> {
  const r = await one(`SELECT * FROM projects WHERE id = $1`, [id]);
  return r ? projectRow(r) : null;
}
export async function listProjects(userId: string): Promise<Project[]> {
  return (await query(`SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC`, [userId])).map(projectRow);
}
export async function setProjectStatus(id: string, status: ProjectStatus, error: string | null = null): Promise<void> {
  await query(`UPDATE projects SET status = $2, error = $3, updated_at = now() WHERE id = $1`, [id, status, error]);
}
export async function setProjectBible(id: string, bible: StoryBible): Promise<void> {
  await query(`UPDATE projects SET bible = $2, updated_at = now() WHERE id = $1`, [id, bible]);
}
export async function setProjectSettings(id: string, settings: ProjectSettings): Promise<void> {
  await query(`UPDATE projects SET settings = $2, updated_at = now() WHERE id = $1`, [id, settings]);
}
export async function setProjectFinal(id: string, url: string): Promise<void> {
  await query(`UPDATE projects SET final_url = $2, status = 'complete', updated_at = now() WHERE id = $1`, [id, url]);
}

// ---------- shots ----------
export async function replaceShots(projectId: string, bible: StoryBible, providerId: ProviderId, mode: GenerationMode): Promise<void> {
  // Only shots that have NOT passed are replaced: a re-plan never throws away finished clips.
  await query(`DELETE FROM shots WHERE project_id = $1 AND status <> 'passed'`, [projectId]);
  for (const beat of bible.beats) {
    await query(
      `INSERT INTO shots (project_id, index, beat, provider_id, mode) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (project_id, index) DO UPDATE SET beat = EXCLUDED.beat`,
      [projectId, beat.index, beat, providerId, mode]);
  }
}
export async function listShots(projectId: string): Promise<Shot[]> {
  return (await query(`SELECT * FROM shots WHERE project_id = $1 ORDER BY index`, [projectId])).map(shotRow);
}
export async function getShot(id: string): Promise<Shot | null> {
  const r = await one(`SELECT * FROM shots WHERE id = $1`, [id]);
  return r ? shotRow(r) : null;
}
export async function getShotByIndex(projectId: string, index: number): Promise<Shot | null> {
  const r = await one(`SELECT * FROM shots WHERE project_id = $1 AND index = $2`, [projectId, index]);
  return r ? shotRow(r) : null;
}
export async function setShotPrompt(id: string, prompt: string, note: ContinuityNote | null): Promise<void> {
  await query(`UPDATE shots SET prompt = $2, continuity_note = $3, updated_at = now() WHERE id = $1`, [id, prompt, note]);
}
export async function setShotStatus(id: string, status: ShotStatus, error: string | null = null): Promise<void> {
  await query(`UPDATE shots SET status = $2, error = $3, updated_at = now() WHERE id = $1`, [id, status, error]);
}
export async function setShotMode(id: string, providerId: ProviderId, mode: GenerationMode): Promise<void> {
  await query(`UPDATE shots SET provider_id = $2, mode = $3, updated_at = now() WHERE id = $1`, [id, providerId, mode]);
}
export async function bumpAttempt(id: string): Promise<number> {
  const r = await one<{ attempt: number }>(`UPDATE shots SET attempt = attempt + 1, updated_at = now() WHERE id = $1 RETURNING attempt`, [id]);
  return r!.attempt;
}
export async function setShotClip(id: string, p: {
  clipUrl: string; firstFrameUrl: string | null; lastFrameUrl: string | null; costUsd: number;
}): Promise<void> {
  await query(
    `UPDATE shots SET clip_url = $2, first_frame_url = $3, last_frame_url = $4, cost_usd = cost_usd + $5, updated_at = now() WHERE id = $1`,
    [id, p.clipUrl, p.firstFrameUrl, p.lastFrameUrl, p.costUsd]);
}
export async function setShotQuality(id: string, q: QualityReport): Promise<void> {
  await query(`UPDATE shots SET quality = $2, updated_at = now() WHERE id = $1`, [id, q]);
}
export async function resetShotForRegeneration(id: string): Promise<void> {
  await query(
    `UPDATE shots SET status = 'queued', attempt = 0, clip_url = NULL, first_frame_url = NULL, last_frame_url = NULL,
     quality = NULL, error = NULL, updated_at = now() WHERE id = $1`, [id]);
}
export async function recordAttempt(shotId: string, p: {
  attempt: number; mode: GenerationMode; providerId: ProviderId; prompt: string; clipUrl?: string | null;
  lastFrameUrl?: string | null; quality?: QualityReport | null; meta?: unknown; error?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO clip_attempts (shot_id, attempt, mode, provider_id, prompt, clip_url, last_frame_url, quality, meta, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [shotId, p.attempt, p.mode, p.providerId, p.prompt, p.clipUrl ?? null, p.lastFrameUrl ?? null,
      p.quality ?? null, p.meta ?? null, p.error ?? null]);
}

// ---------- provider settings ----------
export interface ProviderSettingRow { providerId: ProviderId; mode: GenerationMode; apiKeyCiphertext: string | null }
export async function getProviderSetting(userId: string, providerId: ProviderId): Promise<ProviderSettingRow | null> {
  const r = await one(`SELECT * FROM provider_settings WHERE user_id = $1 AND provider_id = $2`, [userId, providerId]);
  return r ? { providerId: r.provider_id, mode: r.mode, apiKeyCiphertext: r.api_key_ciphertext } : null;
}
export async function listProviderSettings(userId: string): Promise<ProviderSettingRow[]> {
  return (await query(`SELECT * FROM provider_settings WHERE user_id = $1`, [userId]))
    .map((r) => ({ providerId: r.provider_id, mode: r.mode, apiKeyCiphertext: r.api_key_ciphertext }));
}
export async function upsertProviderSetting(userId: string, providerId: ProviderId, p: { mode?: GenerationMode; apiKeyCiphertext?: string | null }): Promise<void> {
  await query(
    `INSERT INTO provider_settings (user_id, provider_id, mode, api_key_ciphertext)
     VALUES ($1,$2,COALESCE($3,'api'),$4)
     ON CONFLICT (user_id, provider_id) DO UPDATE SET
       mode = COALESCE($3, provider_settings.mode),
       api_key_ciphertext = CASE WHEN $5 THEN $4 ELSE provider_settings.api_key_ciphertext END,
       updated_at = now()`,
    [userId, providerId, p.mode ?? null, p.apiKeyCiphertext ?? null, p.apiKeyCiphertext !== undefined]);
}

// ---------- workers / browser jobs ----------
export async function registerWorker(userId: string, name: string, providers: string[], id?: string): Promise<{ id: string }> {
  if (id) {
    const r = await one<{ id: string }>(
      `UPDATE workers SET name = $2, providers = $3, last_seen_at = now() WHERE id = $1 AND user_id = $4 RETURNING id`,
      [id, name, providers, userId]);
    if (r) return r;
  }
  return (await one<{ id: string }>(`INSERT INTO workers (user_id, name, providers) VALUES ($1,$2,$3) RETURNING id`, [userId, name, providers]))!;
}
export async function workerOnline(userId: string, providerId: ProviderId): Promise<boolean> {
  const r = await one(`SELECT 1 FROM workers WHERE user_id = $1 AND $2 = ANY(providers) AND last_seen_at > now() - interval '2 minutes'`, [userId, providerId]);
  return !!r;
}
export async function enqueueBrowserJob(userId: string, job: Omit<BrowserJob, "id">): Promise<string> {
  const r = await one<{ id: string }>(
    `INSERT INTO browser_jobs (shot_id, project_id, user_id, provider_id, payload) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [job.shotId, job.projectId, userId, job.providerId, job]);
  return r!.id;
}
/** Atomically leases the oldest queued job for this user's worker (SKIP LOCKED keeps multiple workers safe). */
export async function leaseBrowserJob(userId: string, workerId: string, providers: string[]): Promise<BrowserJob | null> {
  await query(`UPDATE workers SET last_seen_at = now() WHERE id = $1`, [workerId]);
  const r = await one(
    `UPDATE browser_jobs SET status = 'leased', worker_id = $2, leased_at = now()
     WHERE id = (SELECT id FROM browser_jobs WHERE user_id = $1 AND status = 'queued' AND provider_id = ANY($3)
                 ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING id, payload`, [userId, workerId, providers]);
  return r ? { ...(r.payload as BrowserJob), id: r.id } : null;
}
export async function getBrowserJob(id: string): Promise<{ id: string; shotId: string; projectId: string; userId: string; status: string; payload: BrowserJob } | null> {
  const r = await one(`SELECT * FROM browser_jobs WHERE id = $1`, [id]);
  return r ? { id: r.id, shotId: r.shot_id, projectId: r.project_id, userId: r.user_id, status: r.status, payload: r.payload } : null;
}
export async function completeBrowserJob(id: string, result: BrowserJobResult | null, error: string | null, status: "done" | "failed" | "paused"): Promise<void> {
  await query(`UPDATE browser_jobs SET status = $2, result = $3, error = $4 WHERE id = $1`, [id, status, result, error]);
}
/** Requeue jobs whose worker vanished mid-generation. */
export async function requeueStaleBrowserJobs(staleMinutes = 30): Promise<number> {
  const rows = await query(
    `UPDATE browser_jobs SET status = 'queued', worker_id = NULL, leased_at = NULL
     WHERE status = 'leased' AND leased_at < now() - ($1 || ' minutes')::interval RETURNING id`, [String(staleMinutes)]);
  return rows.length;
}
