import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { toggleFullscreen } from "../../lib/fullscreen";

type Props = { containerRef: React.RefObject<HTMLDivElement | null> };

export function FullscreenButton({ containerRef }: Props) {
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const handler = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const label = isFs ? "Exit full screen (f)" : "Full screen (f)";
  return (
    <button
      className="eyz-btn"
      onClick={() => void toggleFullscreen(containerRef.current)}
      aria-label={label}
      data-tooltip={label}
      data-tooltip-align="end"
    >
      <Icon name={isFs ? "fullscreenExit" : "fullscreen"} />
    </button>
  );
}
