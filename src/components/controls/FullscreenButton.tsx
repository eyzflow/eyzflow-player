import { useCallback, useEffect, useState } from "react";

type Props = { containerRef: React.RefObject<HTMLDivElement | null> };

export function FullscreenButton({ containerRef }: Props) {
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const handler = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const onClick = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // denied
    }
  }, [containerRef]);

  return (
    <button className="eyz-btn" onClick={onClick} aria-label={isFs ? "Exit fullscreen" : "Fullscreen"}>
      {isFs ? (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M6 2v4H2M12 2v4h4M6 16v-4H2M12 16v-4h4" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 6V2h4M16 6V2h-4M2 12v4h4M16 12v4h-4" />
        </svg>
      )}
    </button>
  );
}
