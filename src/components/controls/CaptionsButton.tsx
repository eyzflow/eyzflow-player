type Props = { visible: boolean; onClick: () => void };

export function CaptionsButton({ visible, onClick }: Props) {
  return (
    <button
      className={`eyz-btn${visible ? " eyz-btn--active" : ""}`}
      onClick={onClick}
      aria-label="Toggle captions"
      aria-pressed={visible}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
        <rect x="1" y="4" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <rect x="3.5" y="7.5" width="3" height="1.5" rx="0.5" />
        <rect x="7.5" y="7.5" width="3" height="1.5" rx="0.5" />
        <rect x="11.5" y="7.5" width="3" height="1.5" rx="0.5" />
        <rect x="3.5" y="10" width="5" height="1.5" rx="0.5" />
        <rect x="9.5" y="10" width="5" height="1.5" rx="0.5" />
      </svg>
    </button>
  );
}
