import { useCallback, useEffect, useState } from "react";
import type { PlayerCastConfig } from "../../lib/config-types";

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  castConfig?: PlayerCastConfig;
};

declare global {
  interface Window {
    chrome?: {
      cast?: unknown;
    };
    __onGCastApiAvailable?: (loaded: boolean) => void;
  }
}

export function CastButton({ videoRef, castConfig }: Props) {
  const [available, setAvailable] = useState(false);
  const [casting, setCasting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const init = () => {
      if (!window.chrome?.cast) return;
      setAvailable(true);
    };

    window.__onGCastApiAvailable = (loaded) => {
      if (loaded) init();
    };

    // Inject Cast SDK if not already present
    if (!document.getElementById("eyz-cast-sdk")) {
      const script = document.createElement("script");
      script.id = "eyz-cast-sdk";
      script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
      document.head.appendChild(script);
    } else {
      init();
    }
  }, []);

  const onClick = useCallback(() => {
    const video = videoRef.current;
    if (!video || !available) return;
    // Cast integration is handled via the Cast SDK session request
    const appId = castConfig?.receiverAppId || "CC1AD845"; // default media receiver
    const context = (window as { cast?: { framework?: { CastContext?: { getInstance?: () => { requestSession?: () => void; setOptions?: (o: unknown) => void } } } } }).cast?.framework?.CastContext?.getInstance?.();
    if (!context) return;
    context.setOptions?.({
      receiverApplicationId: appId,
      autoJoinPolicy: castConfig?.autoJoinPolicy ?? "tab_and_origin_scoped",
    });
    context.requestSession?.();
    setCasting((c) => !c);
  }, [available, castConfig, videoRef]);

  if (!available) return null;

  return (
    <button
      className={`eyz-btn${casting ? " eyz-btn--active" : ""}`}
      onClick={onClick}
      aria-label="Cast"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M1 13v2h2a2 2 0 00-2-2z" fill="currentColor" stroke="none" />
        <path d="M1 10v1.5A4.5 4.5 0 015.5 16H7" />
        <path d="M1 7v1.5A7.5 7.5 0 018.5 16H10" />
        <rect x="5" y="3" width="12" height="9" rx="2" />
      </svg>
    </button>
  );
}
