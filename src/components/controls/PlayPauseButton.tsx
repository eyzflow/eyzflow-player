type Props = { playing: boolean; onClick: () => void };

export function PlayPauseButton({ playing, onClick }: Props) {
  return (
    <button className="eyz-btn" onClick={onClick} aria-label={playing ? "Pause" : "Play"}>
      {playing ? (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
          <rect x="3" y="2" width="4" height="14" rx="1" />
          <rect x="11" y="2" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
          <path d="M4 2.5l12 6.5-12 6.5V2.5z" />
        </svg>
      )}
    </button>
  );
}
