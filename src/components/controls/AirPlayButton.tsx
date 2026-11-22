import { useCallback } from "react";
import { Icon } from "./icons";

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
    <button className="eyz-btn" onClick={onClick} aria-label="AirPlay"
      data-tooltip="AirPlay">
      <Icon name="airplay" />
    </button>
  );
}
