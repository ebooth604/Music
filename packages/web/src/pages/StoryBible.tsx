import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Beat, Project, StoryBible } from "@longform/shared";
import { api } from "../api/client";

export default function StoryBiblePage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [bible, setBible] = useState<StoryBible | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const p = await api.getProject(id);
      if (!alive) return;
      setProject(p);
      if (p.bible && !bible) setBible(p.bible);
      if (!p.bible && p.status !== "failed") setTimeout(tick, 2500);
    };
    tick();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!project) return <p className="muted">Loading…</p>;
  if (project.status === "failed") return <div className="panel"><h1>Planning failed</h1><p className="bad">{project.error}</p><button onClick={() => api.replan(id).then(() => location.reload())}>Retry</button></div>;
  if (!bible) return <div className="panel"><h1>Writing the Story Bible…</h1><p className="muted">Prompt Architect → Story Planner. This takes a minute or two.</p></div>;

  const set = (patch: Partial<StoryBible>) => setBible({ ...bible, ...patch });
  const setBeat = (i: number, patch: Partial<Beat>) => set({ beats: bible.beats.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  const save = async () => { setSaving(true); try { await api.saveBible(id, bible); } finally { setSaving(false); } };
  const approve = async () => { await save(); await api.approve(id); nav(`/projects/${id}/progress`); };

  return (
    <>
      <h1>Story Bible</h1>
      <p className="muted">{project.prompt}</p>

      <h2>Master prompt</h2>
      <div className="panel">
        <label>Style block (repeated verbatim in every clip prompt)</label>
        <textarea value={bible.master.styleBlock} onChange={(e) => set({ master: { ...bible.master, styleBlock: e.target.value } })} />
        <div className="row">
          {(["genre", "visualStyle", "colourPalette", "lighting", "cameraStyle", "pacing", "tone"] as const).map((k) => (
            <div key={k}><label>{k}</label><input value={bible.master[k]} onChange={(e) => set({ master: { ...bible.master, [k]: e.target.value } })} /></div>
          ))}
        </div>
        <label>Avoid</label>
        <input value={bible.master.negativePrompt} onChange={(e) => set({ master: { ...bible.master, negativePrompt: e.target.value } })} />
      </div>

      <h2>Characters</h2>
      {bible.characters.map((c, i) => (
        <div className="panel" key={c.id} style={{ marginBottom: 10 }}>
          <div className="row">
            <div><label>Name</label><input value={c.name} onChange={(e) => set({ characters: bible.characters.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} /></div>
            <div><label>Wardrobe</label><input value={c.wardrobe} onChange={(e) => set({ characters: bible.characters.map((x, j) => j === i ? { ...x, wardrobe: e.target.value } : x) })} /></div>
            <div><label>Marks</label><input value={c.distinguishingMarks} onChange={(e) => set({ characters: bible.characters.map((x, j) => j === i ? { ...x, distinguishingMarks: e.target.value } : x) })} /></div>
          </div>
          <label>Locked description (verbatim in every prompt)</label>
          <textarea value={c.lockedDescription} onChange={(e) => set({ characters: bible.characters.map((x, j) => j === i ? { ...x, lockedDescription: e.target.value } : x) })} />
        </div>
      ))}

      <h2>Locations</h2>
      {bible.locations.map((l, i) => (
        <div className="panel" key={l.id} style={{ marginBottom: 10 }}>
          <label>{l.name}</label>
          <textarea value={l.lockedDescription} onChange={(e) => set({ locations: bible.locations.map((x, j) => j === i ? { ...x, lockedDescription: e.target.value } : x) })} />
        </div>
      ))}

      <h2>Beat sheet ({bible.beats.length} shots × {project.settings.clipLength}s)</h2>
      <div className="panel" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>#</th><th>Scene</th><th>Action</th><th>Cast</th><th>Tone</th><th>Shot</th><th>Camera</th><th>In</th></tr></thead>
          <tbody>
            {bible.beats.map((b, i) => (
              <tr className="beat-row" key={b.index}>
                <td>{b.index + 1}</td>
                <td><input value={b.scene} onChange={(e) => setBeat(i, { scene: e.target.value })} /></td>
                <td style={{ minWidth: 280 }}><textarea value={b.action} onChange={(e) => setBeat(i, { action: e.target.value })} /></td>
                <td>{b.characterIds.map((cid) => bible.characters.find((c) => c.id === cid)?.name ?? cid).join(", ")}</td>
                <td><input value={b.emotionalTone} onChange={(e) => setBeat(i, { emotionalTone: e.target.value })} /></td>
                <td><select value={b.shotType} onChange={(e) => setBeat(i, { shotType: e.target.value as Beat["shotType"] })}>
                  {["extreme-wide","wide","medium","medium-close","close-up","extreme-close-up","over-the-shoulder","pov","aerial","tracking","insert"].map((s) => <option key={s}>{s}</option>)}</select></td>
                <td><input value={b.cameraMovement} onChange={(e) => setBeat(i, { cameraMovement: e.target.value })} /></td>
                <td><select value={b.transitionIn} onChange={(e) => setBeat(i, { transitionIn: e.target.value as Beat["transitionIn"] })}><option value="cut">cut</option><option value="crossfade">xfade</option></select></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="actions">
        <button className="secondary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        <button className="secondary" onClick={() => api.replan(id).then(() => { setBible(null); location.reload(); })}>Regenerate bible</button>
        <button onClick={approve}>Approve &amp; generate</button>
      </div>
    </>
  );
}
