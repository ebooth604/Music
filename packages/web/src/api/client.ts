import type { GenerationMode, Project, ProjectSettings, ProgressSummary, ProviderId, ProviderSetting, Shot, StoryBible } from "@longform/shared";

const BASE = import.meta.env.VITE_API_BASE ?? "";
const tokenKey = "longform.token";
export const auth = {
  get token() { return localStorage.getItem(tokenKey); },
  set token(v: string | null) { v ? localStorage.setItem(tokenKey, v) : localStorage.removeItem(tokenKey); },
};

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/v1${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(auth.token ? { authorization: `Bearer ${auth.token}` } : {}), ...(init.headers ?? {}) },
  });
  if (res.status === 401) { auth.token = null; location.assign("/login"); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `${res.status}`);
  return res.json();
}
const post = <T,>(p: string, body?: unknown) => req<T>(p, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const put = <T,>(p: string, body: unknown) => req<T>(p, { method: "PUT", body: JSON.stringify(body) });

export const api = {
  requestMagicLink: (email: string) => post<{ ok: boolean; devToken?: string }>("/auth/email/request", { email }),
  verifyMagicLink: (token: string) => post<{ token: string }>("/auth/email/verify", { token }),
  signInWithApple: (identityToken: string) => post<{ token: string }>("/auth/apple", { identityToken }),

  listProjects: () => req<Project[]>("/projects"),
  createProject: (prompt: string, settings: Partial<ProjectSettings>) => post<Project>("/projects", { prompt, settings }),
  getProject: (id: string) => req<Project>(`/projects/${id}`),
  saveBible: (id: string, bible: StoryBible) => put<Project>(`/projects/${id}/bible`, bible),
  saveSettings: (id: string, s: Partial<ProjectSettings>) => put<Project>(`/projects/${id}/settings`, s),
  replan: (id: string) => post<{ ok: true }>(`/projects/${id}/replan`),
  approve: (id: string) => post<Project>(`/projects/${id}/approve`),
  pause: (id: string) => post<Project>(`/projects/${id}/pause`),
  resume: (id: string) => post<Project>(`/projects/${id}/resume`),
  shots: (id: string) => req<Shot[]>(`/projects/${id}/shots`),
  progress: (id: string) => req<ProgressSummary>(`/projects/${id}/progress`),
  savePrompt: (id: string, index: number, prompt: string) => put<Shot>(`/projects/${id}/shots/${index}/prompt`, { prompt }),
  regenerate: (id: string, index: number, keepPrompt = true) => post<Shot>(`/projects/${id}/shots/${index}/regenerate`, { keepPrompt }),
  acceptShot: (id: string, index: number) => post<Shot>(`/projects/${id}/shots/${index}/accept`),

  providers: () => req<ProviderSetting[]>("/providers"),
  saveProvider: (id: ProviderId, body: { mode?: GenerationMode; apiKey?: string | null }) => put<{ ok: true }>(`/providers/${id}`, body),
  testProvider: (id: ProviderId, mode?: GenerationMode) => post<{ ok: boolean; message: string }>(`/providers/${id}/test`, { mode }),
};
