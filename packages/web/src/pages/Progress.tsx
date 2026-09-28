import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { GenerationMode, Project, ProgressSummary, Shot } from "@longform/shared";
import { api } from "../api/client";
import { ShotCard, fmtEta } from "../components/ShotCard";
import { ShotModal } from "../components/ShotModal";

export default function ProgressPage() {
  const { id = "" } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [prog, setProg] = useState<ProgressSummary | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const refresh = async () => {
    const [p, s, pr] = await Promise.all([api.getProject(id), api.shots(id), api.progress(id)]);
    setProject(p); setShots(s); setProg(pr);
  };
  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, [id]); // eslint-disable-line

  if (!project || !prog) return <p className="muted">Loading…</p>;
  const pct = prog.total ? Math.round((prog.passed / prog.total) * 100) : 0;
  const switchMode = (mode: GenerationMode) => api.saveSettings(id, { mode }).then(refresh);

  return (
    <>
      <h1>{project.title} <span className={`badge ${project.status}`}>{project.status}</span></h1>
      {project.error && <p className="bad">{project.error}</p>}
      <div className="panel">
        <div className="stats">
          <div><b>{prog.passed}/{prog.total}</b><span className="muted">shots passed</span></div>
          <div><b>{prog.generating}</b><span className="muted">in flight</span></div>
          <div><b>{prog.failed}</b><span className="muted">need attention</span></div>
          <div><b>{fmtEta(prog.etaSeconds)}</b><span className="muted">ETA</span></div>
          <div><b>${prog.costUsd.toFixed(2)}</b><span className="muted">est. cost</span></div>
        </div>
        <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        <div className="actions">
          {project.status === "generating" && <button className="secondary" onClick={() => api.pause(id).then(refresh)}>Pause</button>}
          {["paused", "failed"].includes(project.status) && <button onClick={() => api.resume(id).then(refresh)}>Resume (keeps finished clips)</button>}
          <span className="muted" style={{ alignSelf: "center" }}>Mode:</span>
          <button className={`small ${project.settings.mode === "api" ? "" : "secondary"}`} onClick={() => switchMode("api")}>API</button>
          <button className={`small ${project.settings.mode === "browser" ? "" : "secondary"}`} onClick={() => switchMode("browser")}>Browser</button>
          {project.status === "complete" && <Link to={`/projects/${id}/result`}><button>View result</button></Link>}
        </div>
      </div>
      <h2>Shots</h2>
      <div className="grid">{shots.map((s) => <ShotCard key={s.id} shot={s} onClick={() => setOpen(s.index)} />)}</div>
      {open != null && shots[open] && <ShotModal projectId={id} shot={shots[open]} onClose={() => setOpen(null)} onChanged={refresh} />}
    </>
  );
}
