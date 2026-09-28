import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Project, Shot } from "@longform/shared";
import { api } from "../api/client";
import { ShotCard } from "../components/ShotCard";
import { ShotModal } from "../components/ShotModal";

export default function ResultPage() {
  const { id = "" } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const refresh = async () => { const [p, s] = await Promise.all([api.getProject(id), api.shots(id)]); setProject(p); setShots(s); };
  useEffect(() => { refresh(); }, [id]); // eslint-disable-line

  if (!project) return <p className="muted">Loading…</p>;
  return (
    <>
      <h1>{project.title}</h1>
      {project.finalUrl ? (
        <>
          <video className="player" src={project.finalUrl} controls />
          <div className="actions">
            <a href={project.finalUrl} download><button>Download MP4</button></a>
            <Link to={`/projects/${id}/progress`}><button className="secondary">Shot progress</button></Link>
          </div>
        </>
      ) : <p className="muted">Not assembled yet. <Link to={`/projects/${id}/progress`}>See progress</Link>.</p>}
      <h2>Shots — click one to view its prompt or regenerate it</h2>
      <p className="muted">Regenerating a shot re-runs only that clip through the quality gate, then re-assembles the film.</p>
      <div className="grid">{shots.map((s) => <ShotCard key={s.id} shot={s} onClick={() => setOpen(s.index)} />)}</div>
      {open != null && shots[open] && <ShotModal projectId={id} shot={shots[open]} onClose={() => setOpen(null)} onChanged={refresh} />}
    </>
  );
}
