import { useCallback } from "react";
import { Icon } from "./icons";

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
  const label = displayVol === 0 ? "Unmute (m)" : "Mute (m)";

  return (
    <div className="eyz-volume">
      <button className="eyz-btn" onClick={toggleMute} aria-label={label} data-tooltip={label}>
        <Icon name={displayVol === 0 ? "volumeOff" : displayVol < 0.5 ? "volumeDown" : "volumeUp"} />
      </button>
      <div className="eyz-volume-panel">
        <input
          className="eyz-volume-slider"
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={displayVol}
          onChange={onChange}
          style={{ "--vol-pct": `${displayVol * 100}%` } as React.CSSProperties}
          aria-label="Volume"
        />
      </div>
    </div>
  );
}
