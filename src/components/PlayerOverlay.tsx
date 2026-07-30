type Props = {
  state: "idle" | "loading" | "ready" | "error";
  errorMsg: string | null;
};

export function PlayerOverlay({ state, errorMsg }: Props) {
  if (state === "loading") {
    return (
      <div className="eyz-overlay">
        <div className="eyz-spinner" aria-label="Loading" />
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="eyz-overlay eyz-overlay--error">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <circle cx="12" cy="16" r="0.5" fill="currentColor" />
        </svg>
        <p>{errorMsg ?? "Playback failed."}</p>
      </div>
    );
  }
  return null;
}
