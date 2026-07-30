import { useCallback } from "react";

type Props = { videoRef: React.RefObject<HTMLVideoElement | null> };

export function PipButton({ videoRef }: Props) {
  const supported = typeof document !== "undefined" && "pictureInPictureEnabled" in document;

  const onClick = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      // browser denied PiP
    }
  }, [videoRef]);

  if (!supported) return null;

  return (
    <button className="eyz-btn" onClick={onClick} aria-label="Picture in picture">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="1" y="3" width="16" height="12" rx="2" />
        <rect x="9" y="9" width="7" height="5" rx="1" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}
