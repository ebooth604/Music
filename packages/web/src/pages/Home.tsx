import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AspectRatio, ClipLength, Project, ProviderId, GenerationMode } from "@longform/shared";
import { shotCount } from "@longform/shared";
import { api } from "../api/client";

export default function Home({ list = false }: { list?: boolean }) {
  const nav = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [targetMinutes, setMinutes] = useState(15);
  const [clipLength, setClip] = useState<ClipLength>(15);
  const [aspectRatio, setAR] = useState<AspectRatio>("16:9");
  const [providerId, setProvider] = useState<ProviderId>("runway");
  const [mode, setMode] = useState<GenerationMode>("api");
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => { if (list) api.listProjects().then(setProjects); }, [list]);

  const create = async () => {
    setBusy(true);
    try {
      const p = await api.createProject(prompt, { targetMinutes, clipLength, aspectRatio, providerId, mode });
      nav(`/projects/${p.id}/bible`);
    } finally { setBusy(false); }
  };

  if (list) {
    return (
      <>
        <h1>Projects</h1>
        <div className="list">
          {projects.map((p) => (
            <Link key={p.id} to={p.status === "complete" ? `/projects/${p.id}/result` : ["draft", "planning", "bible_ready"].includes(p.status) ? `/projects/${p.id}/bible` : `/projects/${p.id}/progress`}>
              <b>{p.title}</b> <span className={`badge ${p.status}`}>{p.status.replace("_", " ")}</span>
              <div className="muted">{p.prompt}</div>
            </Link>
          ))}
          {!projects.length && <p className="muted">No projects yet.</p>}
        </div>
      </>
    );
  }

  return (
    <>
      <h1>One prompt. One continuous film.</h1>
      <p className="muted">LongForm plans the whole video first, then generates every clip with the same locked style, characters and lighting.</p>
      <div className="panel">
        <textarea className="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder='e.g. "a lone astronaut explores an abandoned Mars colony, moody sci-fi"' />
        <div className="row">
          <div><label>Target length (minutes)</label><input type="number" min={1} max={60} value={targetMinutes} onChange={(e) => setMinutes(Number(e.target.value))} /></div>
          <div><label>Clip length</label>
            <select value={clipLength} onChange={(e) => setClip(Number(e.target.value) as ClipLength)}><option value={15}>15 s</option><option value={30}>30 s</option></select></div>
          <div><label>Aspect ratio</label>
            <select value={aspectRatio} onChange={(e) => setAR(e.target.value as AspectRatio)}>{["16:9", "9:16", "1:1", "4:3", "21:9"].map((a) => <option key={a}>{a}</option>)}</select></div>
          <div><label>Provider</label>
            <select value={providerId} onChange={(e) => setProvider(e.target.value as ProviderId)}>{["runway", "kling", "luma", "sora", "veo"].map((a) => <option key={a}>{a}</option>)}</select></div>
          <div><label>Generation mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as GenerationMode)}><option value="api">API (key)</option><option value="browser">Browser (Mac worker)</option></select></div>
        </div>
        <p className="muted" style={{ marginTop: 14 }}>{shotCount(targetMinutes, clipLength)} shots of {clipLength}s.</p>
        <div className="actions"><button onClick={create} disabled={busy || prompt.trim().length < 3}>{busy ? "Planning…" : "Generate Story Bible"}</button></div>
      </div>
    </>
  );
}
