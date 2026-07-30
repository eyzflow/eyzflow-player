import { useCallback } from "react";

type Props = { videoRef: React.RefObject<HTMLVideoElement | null> };

// AirPlay uses a webkit-prefixed API available in Safari
declare global {
  interface HTMLVideoElement {
    webkitShowPlaybackTargetPicker?: () => void;
  }
  interface Window {
    WebKitPlaybackTargetAvailabilityEvent?: unknown;
  }
}

export function AirPlayButton({ videoRef }: Props) {
  const supported =
    typeof window !== "undefined" && "WebKitPlaybackTargetAvailabilityEvent" in window;

  const onClick = useCallback(() => {
    videoRef.current?.webkitShowPlaybackTargetPicker?.();
  }, [videoRef]);

  if (!supported) return null;

  return (
    <button className="eyz-btn" onClick={onClick} aria-label="AirPlay">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
        <path d="M9 11l4 5H5l4-5z" />
        <path
          d="M3 12V4a1 1 0 011-1h10a1 1 0 011 1v8"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
