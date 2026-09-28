import { useEffect, useState } from "react";
import type { GenerationMode, ProviderId, ProviderSetting } from "@longform/shared";
import { api } from "../api/client";

const NAMES: Record<ProviderId, string> = { runway: "Runway", kling: "Kling", luma: "Luma Dream Machine", sora: "Sora (OpenAI)", veo: "Veo (Google)" };

export default function SettingsPage() {
  const [rows, setRows] = useState<ProviderSetting[]>([]);
  const [keys, setKeys] = useState<Partial<Record<ProviderId, string>>>({});
  const [result, setResult] = useState<Partial<Record<ProviderId, { ok: boolean; message: string }>>>({});
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const load = () => api.providers().then(setRows);
  useEffect(() => { load(); }, []);

  const save = async (id: ProviderId, mode?: GenerationMode) => {
    await api.saveProvider(id, { mode, ...(keys[id] !== undefined ? { apiKey: keys[id] || null } : {}) });
    setKeys((k) => ({ ...k, [id]: undefined }));
    load();
  };
  const test = async (id: ProviderId) => {
    setBusy(id);
    try { setResult((r) => ({ ...r, [id]: { ok: false, message: "Testing…" } })); const r = await api.testProvider(id); setResult((x) => ({ ...x, [id]: r })); }
    finally { setBusy(null); }
  };

  return (
    <>
      <h1>Settings</h1>
      <p className="muted">Choose a Generation Mode per provider. API keys are encrypted at rest and never shown again. Browser Mode uses the LongForm Mac app and your own logged-in session for that site.</p>
      {rows.map((r) => (
        <div className="panel" key={r.providerId} style={{ marginBottom: 12 }}>
          <h2 style={{ marginTop: 0 }}>{NAMES[r.providerId]}</h2>
          <div className="row">
            <div>
              <label>Mode</label>
              <select value={r.mode} onChange={(e) => save(r.providerId, e.target.value as GenerationMode)}>
                <option value="api">API mode (key)</option>
                <option value="browser">Browser mode (Mac worker{r.browserWorkerOnline ? " · online" : " · offline"})</option>
              </select>
            </div>
            <div>
              <label>API key {r.hasApiKey && <span className="ok">· stored</span>}</label>
              <input type="password" placeholder={r.hasApiKey ? "•••••••• (replace)" : r.providerId === "kling" ? "accessKey:secretKey" : "sk-…"}
                value={keys[r.providerId] ?? ""} onChange={(e) => setKeys((k) => ({ ...k, [r.providerId]: e.target.value }))} />
            </div>
          </div>
          <div className="actions">
            <button className="secondary" onClick={() => save(r.providerId)} disabled={keys[r.providerId] === undefined}>Save key</button>
            <button onClick={() => test(r.providerId)} disabled={busy === r.providerId}>Test connection</button>
            {result[r.providerId] && <span className={result[r.providerId]!.ok ? "ok" : "bad"} style={{ alignSelf: "center" }}>{result[r.providerId]!.message}</span>}
          </div>
        </div>
      ))}
    </>
  );
}
