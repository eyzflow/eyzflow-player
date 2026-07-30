import { useCallback } from "react";

type Props = {
  volume: number;
  muted: boolean;
  onMute: (m: boolean) => void;
  onVolume: (v: number) => void;
};

export function VolumeControl({ volume, muted, onMute, onVolume }: Props) {
  const toggleMute = useCallback(() => onMute(!muted), [muted, onMute]);
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onVolume(Number(e.target.value)),
    [onVolume],
  );

  const displayVol = muted ? 0 : volume;

  return (
    <div className="eyz-volume">
      <button className="eyz-btn" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
        {displayVol === 0 ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
            <path d="M3 6h3l4-3v12l-4-3H3V6z" />
            <line x1="12" y1="6" x2="16" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="16" y1="6" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ) : displayVol < 0.5 ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
            <path d="M3 6h3l4-3v12l-4-3H3V6z" />
            <path d="M12 7a3 3 0 010 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
            <path d="M3 6h3l4-3v12l-4-3H3V6z" />
            <path d="M12 5a5 5 0 010 8M14 3a8 8 0 010 12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        )}
      </button>
      <input
        className="eyz-volume-slider"
        type="range"
        min={0}
        max={1}
        step={0.02}
        value={displayVol}
        onChange={onChange}
        aria-label="Volume"
      />
    </div>
  );
}
