import { useCallback } from "react";

type Props = {
  currentTime: number;
  duration: number;
  buffered: number;
  onSeek: (s: number) => void;
};

export function SeekBar({ currentTime, duration, buffered, onSeek }: Props) {
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSeek(Number(e.target.value));
    },
    [onSeek],
  );

  return (
    <div className="eyz-seekbar-wrap">
      <div className="eyz-seekbar-track">
        <div className="eyz-seekbar-buffered" style={{ width: `${bufPct}%` }} />
        <div className="eyz-seekbar-filled" style={{ width: `${pct}%` }} />
      </div>
      <input
        className="eyz-seekbar-input"
        type="range"
        min={0}
        max={duration || 100}
        step={0.1}
        value={currentTime}
        onChange={onChange}
        aria-label="Seek"
      />
    </div>
  );
}
