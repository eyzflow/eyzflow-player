import { Icon } from "./icons";

type Props = { playing: boolean; onClick: () => void };

export function PlayPauseButton({ playing, onClick }: Props) {
  const label = playing ? "Pause (k)" : "Play (k)";
  return (
    <button className="eyz-btn" onClick={onClick} aria-label={label} data-tooltip={label}>
      <Icon name={playing ? "pause" : "play"} size={28} />
    </button>
  );
}
