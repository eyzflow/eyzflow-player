import { useCallback } from "react";
import { Icon } from "./icons";

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
    <button className="eyz-btn eyz-btn--pip" onClick={onClick} aria-label="Miniplayer" data-tooltip="Miniplayer (i)">
      <Icon name="pip" />
    </button>
  );
}
