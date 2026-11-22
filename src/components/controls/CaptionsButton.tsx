import { Icon } from "./icons";

type Props = { visible: boolean; onToggle: () => void };

export function CaptionsButton({ visible, onToggle }: Props) {
  const label = visible ? "Subtitles/closed captions on (c)" : "Subtitles/closed captions off (c)";
  return (
    <button
      className={`eyz-btn eyz-btn--cc${visible ? " eyz-btn--active" : ""}`}
      onClick={onToggle}
      aria-label="Subtitles/closed captions (c)"
      aria-pressed={visible}
      data-tooltip={label}
    >
      <Icon name="captions" />
    </button>
  );
}
