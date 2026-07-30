import { useCallback, useEffect, useRef, useState } from "react";
import "./EyzflowPlayer.css";
import { useShaka } from "../lib/use-shaka";
import { fetchPlayerConfig } from "../lib/remote-config";
import { DEFAULT_CONFIG, type PlayerConfig } from "../lib/config-types";
import { ControlBar } from "./controls/ControlBar";
import { PlayerOverlay } from "./PlayerOverlay";

export type EyzflowPlayerProps = {
  streamId: string;
  /** Fetch remote config by ID from the eyzflow API */
  configId?: string;
  /** Inline config — merged over remote config (this wins) */
  config?: Partial<PlayerConfig>;
  /** DRM authorization key for the logged-in user. Required when stream is DRM-protected. */
  drmAuthorizationKey?: string;
  /** Override isProtected (default comes from config) */
  isProtected?: boolean;
  autoPlay?: boolean;
  controls?: boolean;
  /** Fill parent container instead of 16:9 aspect ratio */
  fill?: boolean;
  onError?: (msg: string) => void;
  onReady?: () => void;
};

export function EyzflowPlayer({
  streamId,
  configId,
  config: configProp,
  drmAuthorizationKey,
  isProtected: isProtectedProp,
  autoPlay: autoPlayProp,
  controls: controlsProp,
  fill = false,
  onError,
  onReady,
}: EyzflowPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [config, setConfig] = useState<PlayerConfig>(DEFAULT_CONFIG);
  const [configLoading, setConfigLoading] = useState(!!configId);

  // Load remote config
  useEffect(() => {
    const merge = (base: PlayerConfig, patch?: Partial<PlayerConfig>): PlayerConfig => ({
      ...base,
      ...patch,
      theme: { ...base.theme, ...patch?.theme },
      features: { ...base.features, ...patch?.features },
      cast: patch?.cast ?? base.cast,
      ads: patch?.ads ?? base.ads,
      drm: patch?.drm
        ? { ...base.drm, ...patch.drm, parameters: { ...base.drm?.parameters, ...patch.drm.parameters } }
        : base.drm,
    });

    if (!configId) {
      setConfig(merge(DEFAULT_CONFIG, configProp));
      return;
    }
    setConfigLoading(true);
    fetchPlayerConfig(configId)
      .then((remote) => setConfig(merge(remote, configProp)))
      .catch(() => setConfig(merge(DEFAULT_CONFIG, configProp)))
      .finally(() => setConfigLoading(false));
  }, [configId, configProp]);

  const resolved = {
    isProtected: isProtectedProp ?? config.isProtected,
    autoPlay: autoPlayProp ?? config.features.autoPlay,
    controls: controlsProp ?? config.features.controls,
  };

  // Auto-hide controls
  const [hiding, setHiding] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetHideTimer = useCallback(() => {
    setHiding(false);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (config.features.autoHideControls) {
      hideTimer.current = setTimeout(() => setHiding(true), 3000);
    }
  }, [config.features.autoHideControls]);

  useEffect(() => {
    resetHideTimer();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [resetHideTimer]);

  const shaka = useShaka({
    streamId,
    isProtected: resolved.isProtected,
    drmAuthorizationKey,
    drmParameters: config.drm?.parameters,
    autoPlay: resolved.autoPlay,
    muted: config.features.muted,
    loop: config.features.loop,
    onReady,
    onError,
  });

  // Apply theme as CSS custom properties
  const { theme } = config;
  const cssVars = {
    "--eyz-accent": theme.accentColor,
    "--eyz-accent-hover": adjustAccent(theme.accentColor),
    "--eyz-bg": theme.backgroundColor,
    "--eyz-bar": theme.controlsBarColor,
    "--eyz-text": theme.textColor,
    "--eyz-border-radius": theme.borderRadius,
  } as React.CSSProperties;

  if (configLoading) {
    return (
      <div
        className={`eyz-player${fill ? " eyz-player--fill" : ""}`}
        style={cssVars}
        ref={containerRef}
      >
        <div className="eyz-overlay">
          <div className="eyz-spinner" aria-label="Loading configuration" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`eyz-player${fill ? " eyz-player--fill" : ""}${hiding ? " eyz-player--hide-controls" : ""}`}
      style={cssVars}
      ref={containerRef}
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      <video
        ref={shaka.videoRef}
        className="eyz-video"
        playsInline
        muted={config.features.muted}
      />
      <PlayerOverlay state={shaka.state} errorMsg={shaka.errorMsg} />
      {resolved.controls && shaka.state !== "error" && (
        <ControlBar
          playing={shaka.playing}
          currentTime={shaka.currentTime}
          duration={shaka.duration}
          buffered={shaka.buffered}
          volume={shaka.volume}
          muted={shaka.muted}
          tracks={shaka.tracks}
          activeTrack={shaka.activeTrack}
          textTracks={shaka.textTracks}
          captionsVisible={shaka.captionsVisible}
          features={config.features}
          castConfig={config.cast}
          videoRef={shaka.videoRef}
          containerRef={containerRef}
          onPlay={shaka.play}
          onPause={shaka.pause}
          onSeek={shaka.seek}
          onVolume={shaka.setVolume}
          onMute={shaka.setMuted}
          onSelectTrack={shaka.selectTrack}
          onToggleCaptions={shaka.toggleCaptions}
        />
      )}
    </div>
  );
}

/** Lighten an accent hex color slightly for hover state */
function adjustAccent(hex: string): string {
  try {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((n >> 16) & 0xff) + 40);
    const g = Math.min(255, ((n >> 8) & 0xff) + 40);
    const b = Math.min(255, (n & 0xff) + 40);
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return hex;
  }
}
