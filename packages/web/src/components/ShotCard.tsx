import type { Shot } from "@longform/shared";

export function ShotCard({ shot, onClick }: { shot: Shot; onClick?: () => void }) {
  return (
    <div className="shot" onClick={onClick}>
      <div className="thumb">
        {shot.clipUrl ? <video src={shot.clipUrl} muted loop playsInline onMouseOver={(e) => e.currentTarget.play()} onMouseOut={(e) => e.currentTarget.pause()} poster={shot.firstFrameUrl ?? undefined} />
          : shot.firstFrameUrl ? <img src={shot.firstFrameUrl} alt="" /> : <span>{shot.beat.shotType}</span>}
      </div>
      <div className="meta">
        <span>#{shot.index + 1}{shot.attempt > 1 ? ` · try ${shot.attempt}` : ""}</span>
        <span className={`badge ${shot.status}`}>{shot.status}</span>
      </div>
    </div>
  );
}

export function fmtEta(s: number | null): string {
  if (s == null) return "—";
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}
