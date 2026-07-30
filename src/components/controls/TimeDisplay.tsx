function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

type Props = { currentTime: number; duration: number };

export function TimeDisplay({ currentTime, duration }: Props) {
  return (
    <span className="eyz-time">
      {fmt(currentTime)} / {fmt(duration)}
    </span>
  );
}
