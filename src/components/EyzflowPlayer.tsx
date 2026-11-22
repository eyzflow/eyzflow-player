import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./EyzflowPlayer.css";
import { useShaka } from "../lib/use-shaka";
import { fetchPlayerConfig } from "../lib/remote-config";
import { DEFAULT_CONFIG, type PlayerConfig } from "../lib/config-types";
import { ControlBar } from "./controls/ControlBar";
import { adCountdownLabel } from "../lib/ad-countdown";
import { skipButtonFor, skipSignalLabel, type StreamSignal } from "../lib/stream-signals";
import { overlayMoment, type SignalOverlayContext } from "../lib/signal-overlay";
import { endScreenLabels, endScreenPhase, endScreenSettings, type EndScreenItem, type EndScreenOptions } from "../lib/end-screen";
import { EndScreen } from "./EndScreen";
import { PlayerOverlay } from "./PlayerOverlay";
import type { PlaybackLimitError } from "../lib/playback-session";
import type { PlayerLicenseError } from "../lib/license";

function mergeConfig(
  base: PlayerConfig,
  patch?: Partial<PlayerConfig>,
): PlayerConfig {
  return {
    ...base,
    ...patch,
    theme: { ...base.theme, ...patch?.theme },
    features: { ...base.features, ...patch?.features },
    cast: patch?.cast ?? base.cast,
    ads: patch?.ads ?? base.ads,
    endScreen: patch?.endScreen ? { ...base.endScreen, ...patch.endScreen } : base.endScreen,
    skipButtonTypes: patch?.skipButtonTypes
      ? { ...base.skipButtonTypes, ...patch.skipButtonTypes }
      : base.skipButtonTypes,
    drm: patch?.drm
      ? { ...base.drm, ...patch.drm, parameters: { ...base.drm?.parameters, ...patch.drm.parameters } }
      : base.drm,
  };
}

export type EyzflowPlayerAnalyticsOptions = {
  /** Add CMCD data (with the analytics impression id) to manifest and segment requests, so CDN logs can be joined. */
  cmcd?: boolean;
};

export type EyzflowPlayerProps = {
  streamId: string;
  /**
   * The organisation's player key (pk_…, from the dashboard: Player → Keys). The player checks it for this site before
   * playing; it also turns on playback quality analytics when the key has them on.
   */
  playerKey?: string;
  /** Playback quality analytics, with a player key. `false` turns them off for this player. Default on. */
  analytics?: boolean | EyzflowPlayerAnalyticsOptions;
  /** The player key check refused this site or key (the player shows an error instead of the video). */
  onLicenseError?: (error: PlayerLicenseError) => void;
  /** Fetch remote config by ID from the eyzflow API */
  configId?: string;
  /** Inline config — merged over remote config (this wins) */
  config?: Partial<PlayerConfig>;
  /** DRM authorization key for the logged-in user. Required when stream is DRM-protected. */
  drmAuthorizationKey?: string;
  /**
   * The storefront the viewer watches on (else `drm.parameters.storefront_id` from the config). With it the player
   * opens a playback session, so the plan's stream and device limits apply, and heartbeats it while playing.
   */
  storefrontId?: string;
  /** Shown in the viewer's device list, e.g. "Living room". */
  deviceName?: string;
  /** A stream or device limit was reached, or the viewer was signed out on this device. */
  onLimitReached?: (limit: PlaybackLimitError) => void;
  /** Override isProtected (default comes from config) */
  isProtected?: boolean;
  autoPlay?: boolean;
  controls?: boolean;
  /** Fill parent container instead of 16:9 aspect ratio */
  fill?: boolean;
  /**
   * Playback entered an intro, recap or credits signal marked on the stream (Stream → Signals), or left one (null).
   * For example, offer the next episode when `closing_credits` starts.
   */
  onSignal?: (signal: StreamSignal | null) => void;
  /**
   * The app's own UI over the player while playback is in a signal (e.g. three similar films at the closing credits)
   * or after the film ended. Return null to show nothing. It is drawn inside the player, so it stays in fullscreen,
   * above the video and subtitles and below the control bar; the skip button hides while it shows. Not during an ad.
   */
  renderOverlay?: (context: SignalOverlayContext) => React.ReactNode;
  /**
   * The built-in end screen: "Up next" with a countdown and a row of films the app passes, over the closing credits
   * (shrunk into a corner) or after the film. A picked film plays in place; `onSelect` hears it and can prevent it.
   * The config's `features.endScreen` and `endScreen` settings apply where this leaves them out. `renderOverlay`
   * wins when it returns something.
   */
  endScreen?: EndScreenOptions;
  onError?: (msg: string) => void;
  onReady?: () => void;
};

export function EyzflowPlayer({
  streamId,
  playerKey,
  analytics: analyticsProp,
  onLicenseError,
  configId,
  config: configProp,
  drmAuthorizationKey,
  storefrontId,
  deviceName,
  onLimitReached,
  isProtected: isProtectedProp,
  autoPlay: autoPlayProp,
  controls: controlsProp,
  fill = false,
  onSignal,
  renderOverlay,
  endScreen,
  onError,
  onReady,
}: EyzflowPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [remoteConfig, setRemoteConfig] = useState<PlayerConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(!!configId);

  // Derived during render so DRM parameters are available on the first load.
  const config = useMemo(
    () => mergeConfig(remoteConfig ?? DEFAULT_CONFIG, configProp),
    [remoteConfig, configProp],
  );

  useEffect(() => {
    if (!configId) return;
    let cancelled = false;
    setConfigLoading(true);
    fetchPlayerConfig(configId)
      .then((remote) => { if (!cancelled) setRemoteConfig(remote); })
      .catch(() => { if (!cancelled) setRemoteConfig(null); })
      .finally(() => { if (!cancelled) setConfigLoading(false); });
    return () => { cancelled = true; };
  }, [configId]);

  const resolved = {
    isProtected: isProtectedProp ?? config.isProtected,
    autoPlay: autoPlayProp ?? config.features.autoPlay,
    controls: controlsProp ?? config.features.controls,
  };

  // Value-keyed so an inline `config` prop doesn't tear down playback each render.
  const mergedDrmParameters = storefrontId
    ? { ...config.drm?.parameters, storefront_id: storefrontId }
    : config.drm?.parameters;
  const drmParametersKey = mergedDrmParameters
    ? JSON.stringify(mergedDrmParameters)
    : "";
  const drmParameters = useMemo(
    () =>
      drmParametersKey
        ? (JSON.parse(drmParametersKey) as Record<string, unknown>)
        : undefined,
    [drmParametersKey],
  );

  // A stream the end screen picked plays in place, until the app passes another `streamId`.
  const [picked, setPicked] = useState<{ from: string; streamId: string } | null>(null);
  const playingStreamId = picked?.from === streamId ? picked.streamId : streamId;

  const shaka = useShaka({
    streamId: playingStreamId,
    isProtected: resolved.isProtected,
    drmAuthorizationKey,
    drmParameters,
    deviceName,
    playerKey,
    configId,
    analytics: analyticsProp !== false,
    cmcd: typeof analyticsProp === "object" && analyticsProp.cmcd === true,
    onLicenseError,
    // A picked stream starts at once, whatever the config says.
    autoPlay: resolved.autoPlay || playingStreamId !== streamId,
    muted: config.features.muted,
    loop: config.features.loop,
    // Both the Ads switch and a tag are needed: the switch turns ads off without losing the tag.
    adTagUrl: (config.features.ads && config.ads?.adTagUrl.trim()) || undefined,
    adCountdown: config.features.adCountdown !== false,
    adCountdownSeconds: config.ads?.countdownSeconds,
    onSignal,
    onReady,
    onError,
    onLimitReached,
  });

  const { activeSignal, skipSignal, adPlaying, state, ended, seek, play, pause, playing, currentTime, duration, hasClosingCredits } =
    shaka;

  // The app's overlay: asked for at a signal or after the end, until dismissed for that moment.
  const moment = overlayMoment(activeSignal, ended);
  const momentKey = moment && `${playingStreamId}:${moment}`;
  const [dismissedMoment, setDismissedMoment] = useState<string | null>(null);
  const overlay =
    renderOverlay && momentKey && momentKey !== dismissedMoment && !adPlaying && state === "ready"
      ? renderOverlay({
          signal: activeSignal,
          ended,
          controls: { skip: skipSignal, seek, play, pause, dismiss: () => setDismissedMoment(momentKey) },
        })
      : null;
  const overlayShown = overlay !== null && overlay !== undefined && overlay !== false;

  // The built-in end screen, when the app's own overlay shows nothing.
  // The last second counts as the end: credits that run to the end leave their signal a moment before `ended`.
  const endSettings = endScreenSettings(config, endScreen);
  const nearEnd = duration > 0 && currentTime >= duration - 1;
  const endShownPhase =
    endScreen && !overlayShown && !adPlaying && state === "ready"
      ? endScreenPhase(endSettings, {
          signal: activeSignal,
          ended: ended || nearEnd,
          position: currentTime,
          duration,
          hasClosingCredits,
        })
      : null;
  const endMomentKey = endShownPhase && `${playingStreamId}:${endShownPhase}`;
  const [dismissedEndMoment, setDismissedEndMoment] = useState<string | null>(null);
  const endPhase = endShownPhase && endMomentKey !== dismissedEndMoment ? endShownPhase : null;
  const shrunk = endPhase === "credits" && endSettings.shrinkVideo;
  const dismissMoment = useCallback(() => {
    if (endMomentKey) setDismissedEndMoment(endMomentKey);
  }, [endMomentKey]);
  const selectEndItem = (item: EndScreenItem, autoplay: boolean) => {
    let prevented = false;
    endScreen?.onSelect?.(item, { autoplay, preventDefault: () => { prevented = true; } });
    if (!prevented) setPicked({ from: streamId, streamId: item.streamId });
  };
  // Esc goes back to the credits, as clicking the shrunk video does.
  useEffect(() => {
    if (!endPhase) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissMoment();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [endPhase, dismissMoment]);

  const showSkip = config.features.skipButtons !== false && !adPlaying && state === "ready" && !overlayShown && !endPhase;

  // Auto-hide controls after 3s of pointer inactivity, but only while playing.
  const [hiding, setHiding] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetHideTimer = useCallback(() => {
    setHiding(false);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (config.features.autoHideControls && shaka.playing) {
      hideTimer.current = setTimeout(() => setHiding(true), 3000);
    }
  }, [config.features.autoHideControls, shaka.playing]);

  useEffect(() => {
    resetHideTimer();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [resetHideTimer]);

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
      className={`eyz-player${fill ? " eyz-player--fill" : ""}${hiding ? " eyz-player--hide-controls" : ""}${shrunk ? " eyz-player--credits-shrunk" : ""}`}
      style={cssVars}
      ref={containerRef}
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
      onFocus={resetHideTimer}
      onKeyDown={resetHideTimer}
    >
      <video
        ref={shaka.videoRef}
        className="eyz-video"
        playsInline
        muted={config.features.muted}
        onClick={shrunk ? dismissMoment : undefined}
        title={shrunk ? endScreenBackLabel : undefined}
      />
      <div ref={shaka.adContainerRef} className="eyz-ad-container" />
      {shaka.activeCueLines.length > 0 && !shaka.adPlaying && !shrunk && (
        <div className="eyz-text-layer" aria-live="off">
          <div className="eyz-cue">
            {shaka.activeCueLines.map((line, i) => (
              <span key={i} className="eyz-cue-line">
                {line}
              </span>
            ))}
          </div>
        </div>
      )}
      {showSkip && activeSignal && skipButtonFor(activeSignal.type, config.skipButtonTypes) && (
        <button type="button" key={activeSignal.id} className="eyz-skip-signal" onClick={skipSignal}>
          {skipSignalLabel(activeSignal.type)}
        </button>
      )}
      {overlayShown && <div className="eyz-signal-overlay">{overlay}</div>}
      {endPhase && endScreen && (
        <div className="eyz-signal-overlay eyz-signal-overlay--end-screen">
          <EndScreen
            // Per stream, not per moment: the countdown carries on when the credits run into the end of the film.
            key={playingStreamId}
            options={endScreen}
            settings={endSettings}
            phase={endPhase}
            counting={playing || ended}
            onSelect={selectEndItem}
            onDismiss={dismissMoment}
          />
        </div>
      )}
      {shaka.adCountdown !== null && !shaka.adPlaying && (
        <div className="eyz-ad-countdown" role="status" aria-live="polite">
          {adCountdownLabel(shaka.adCountdown)}
        </div>
      )}
      <PlayerOverlay state={shaka.state} errorMsg={shaka.errorMsg} />
      {resolved.controls && shaka.state !== "error" && !shaka.adPlaying && (
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
          activeTextTrack={shaka.activeTextTrack}
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
          onSelectTextTrack={shaka.selectTextTrack}
          onCaptionsOff={shaka.disableCaptions}
        />
      )}
    </div>
  );
}

const endScreenBackLabel = endScreenLabels().backToCredits;

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
