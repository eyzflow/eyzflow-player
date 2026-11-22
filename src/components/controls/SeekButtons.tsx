import { useState } from "react";
import { Icon } from "./icons";

// Material's replay arrow; mirrored for forward. The seconds are drawn inside, so any step fits.
const ARROW = "M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z";

/** A circular arrow back or forward, with the seconds inside when given. */
export function SeekIcon({ direction, seconds, size = 24 }: { direction: "replay" | "forward"; seconds?: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={ARROW} transform={direction === "forward" ? "matrix(-1 0 0 1 24 0)" : undefined} />
      {seconds !== undefined && (
        <text
          x="12"
          y="15.6"
          textAnchor="middle"
          fontSize={seconds >= 100 ? 5 : 6.5}
          fontWeight="700"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {seconds}
        </text>
      )}
    </svg>
  );
}

type Props = {
  seconds: number;
  playing: boolean;
  onBack: () => void;
  onForward: () => void;
  onTogglePlay: () => void;
};

/** Back, play/pause and forward in the middle of the player, as on iOS. They show and hide with the control bar. */
export function SeekButtons({ seconds, playing, onBack, onForward, onTogglePlay }: Props) {
  // Bumped per press so the arrow turns again on every click.
  const [spin, setSpin] = useState<{ side: "back" | "forward"; key: number } | null>(null);
  const press = (side: "back" | "forward") => {
    setSpin((prev) => ({ side, key: (prev?.key ?? 0) + 1 }));
    if (side === "back") onBack();
    else onForward();
  };
  const spinning = (side: "back" | "forward") =>
    spin?.side === side ? `eyz-seek-buttons__icon eyz-seek-buttons__icon--spin-${side}` : "eyz-seek-buttons__icon";

  return (
    <div className="eyz-seek-buttons">
      <button type="button" className="eyz-seek-buttons__step" onClick={() => press("back")} aria-label={`Back ${seconds} seconds`}>
        <span key={spin?.side === "back" ? spin.key : 0} className={spinning("back")}>
          <SeekIcon direction="replay" seconds={seconds} size={40} />
        </span>
      </button>
      <button type="button" className="eyz-seek-buttons__play" onClick={onTogglePlay} aria-label={playing ? "Pause" : "Play"}>
        <Icon name={playing ? "pause" : "play"} size={44} />
      </button>
      <button type="button" className="eyz-seek-buttons__step" onClick={() => press("forward")} aria-label={`Forward ${seconds} seconds`}>
        <span key={spin?.side === "forward" ? spin.key : 0} className={spinning("forward")}>
          <SeekIcon direction="forward" seconds={seconds} size={40} />
        </span>
      </button>
    </div>
  );
}
