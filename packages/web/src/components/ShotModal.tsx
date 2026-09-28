import { useState } from "react";
import type { Shot } from "@longform/shared";
import { api } from "../api/client";

export function ShotModal({ projectId, shot, onClose, onChanged }: { projectId: string; shot: Shot; onClose: () => void; onChanged: () => void }) {
  const [prompt, setPrompt] = useState(shot.prompt ?? "");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); onChanged(); } finally { setBusy(false); } };
  return (
    <div className="modal" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Shot {shot.index + 1} <span className={`badge ${shot.status}`}>{shot.status}</span></h2>
        {shot.clipUrl && <video className="player" src={shot.clipUrl} controls />}
        <p className="muted">{shot.beat.scene} — {shot.beat.action}</p>
        {shot.quality && (
          <p className={shot.quality.pass ? "ok" : "bad"}>
            Quality {Math.round(shot.quality.score * 100)}% · character {Math.round(shot.quality.characterConsistency * 100)}% · style {Math.round(shot.quality.styleConsistency * 100)}% · continuity {Math.round(shot.quality.continuity * 100)}%
            {shot.quality.issues.length > 0 && <><br />{shot.quality.issues.join("; ")}</>}
          </p>
        )}
        {shot.error && <p className="bad">{shot.error}</p>}
        <label>Clip prompt (editable; used on the next generation of this shot)</label>
        <textarea style={{ minHeight: 260, fontFamily: "ui-monospace, monospace", fontSize: 12 }} value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="Prompt is built when the previous shot finishes (it needs the previous clip's last frame)." />
        <div className="actions">
          <button className="secondary" disabled={busy || !prompt} onClick={() => run(() => api.savePrompt(projectId, shot.index, prompt))}>Save prompt</button>
          <button disabled={busy} onClick={() => run(async () => { if (prompt) await api.savePrompt(projectId, shot.index, prompt); await api.regenerate(projectId, shot.index, true); })}>Regenerate shot {shot.index + 1}</button>
          <button className="secondary" disabled={busy} onClick={() => run(() => api.regenerate(projectId, shot.index, false))}>Rebuild prompt &amp; regenerate</button>
          {shot.status === "failed" && shot.clipUrl && <button className="secondary" disabled={busy} onClick={() => run(() => api.acceptShot(projectId, shot.index))}>Accept anyway</button>}
          <button className="secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
