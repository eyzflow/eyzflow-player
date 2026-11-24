import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./EYZFlowPlayer.css";
import { useShaka } from "../lib/use-shaka";
import { useCast } from "../lib/use-cast";
import { fetchPlayerConfig } from "../lib/remote-config";
import { DEFAULT_CONFIG, type PlayerConfig } from "../lib/config-types";
import { ControlBar } from "./controls/ControlBar";
import { adCountdownLabel } from "../lib/ad-countdown";
import { skipButtonFor, skipSignalLabel, type StreamSignal } from "../lib/stream-signals";
import { overlayMoment, type SignalOverlayContext } from "../lib/signal-overlay";
import { cornerVideoSize, endScreenLabels, endScreenPhase, endScreenSettings, type EndScreenItem, type EndScreenOptions } from "../lib/end-screen";
import { EndScreen } from "./EndScreen";
import { PlayerOverlay } from "./PlayerOverlay";
import { Icon, type IconName } from "./controls/icons";
import { toggleFullscreen } from "../lib/fullscreen";
import type { PlaybackLimitError } from "../lib/playback-session";
import type { PlayerLicenseError } from "../lib/license";
import { STREAM_CDN_ORIGIN } from "../lib/api";
import { defaultThumbnailsUrl } from "../lib/playback-preferences";
import { seekSteps as resolveSeekSteps, type PlayerSeekConfig } from "../lib/seek-steps";
import { SeekButtons, SeekIcon } from "./controls/SeekButtons";

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
    seek: patch?.seek ? { ...base.seek, ...patch.seek } : base.seek,
    drm: patch?.drm
      ? { ...base.drm, ...patch.drm, parameters: { ...base.drm?.parameters, ...patch.drm.parameters } }
      : base.drm,
  };
}

export type EYZFlowPlayerAnalyticsOptions = {
  /** Add CMCD data (with the analytics impression id) to manifest and segment requests, so CDN logs can be joined. */
  cmcd?: boolean;
};

export type EYZFlowPlayerProps = {
  streamId: string;
  /**
   * The organisation's player key (pk_…, from the dashboard: Player → Keys). The player checks it for this site before
   * playing; it also turns on playback quality analytics when the key has them on.
   */
  playerKey?: string;
  /** Playback quality analytics, with a player key. `false` turns them off for this player. Default on. */
  analytics?: boolean | EYZFlowPlayerAnalyticsOptions;
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
  /**
   * The offer (film or episode) `streamId` plays. With `drmAuthorizationKey` and `storefrontId`, the player reports
   * the seconds the viewer watched for licensor royalties. Leave it out for trailers.
   */
  offerId?: string;
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
  /**
   * Audio language to start in when the stream has it (BCP 47, e.g. "de"); otherwise the stream's default. Read when a
   * stream loads.
   */
  preferredAudioLanguage?: string;
  /**
   * Subtitles to show from the start when the stream has them in this language (BCP 47, e.g. "de"); otherwise none.
   * The viewer can still change them. Read when a stream loads.
   */
  preferredSubtitleLanguage?: string;
  /** Highest bitrate the player picks, in bits per second (video and audio together). Overrides `maxBitrate` in the config. */
  maxBitrate?: number;
  /**
   * Seek bar thumbnails: `true` (default) uses the stream's own thumbnails track, a string is the URL of a WebVTT
   * sprite track, `false` turns them off. The config's `features.thumbnails: false` turns them off too.
   */
  thumbnails?: boolean | string;
  /**
   * How far ← / → (`arrowKeySeconds`, default 5) and the back and forward buttons, J and L (`buttonSeconds`, default
   * 10) jump, in whole seconds. Overrides the config's `seek`.
   */
  seekSteps?: PlayerSeekConfig;
  /** Where `streamId` starts, in seconds, e.g. to resume. A stream the end screen picks starts at the beginning. */
  startTime?: number;
  /** About four times a second while the content plays, and after a seek. Not during an ad. */
  onTimeUpdate?: (time: number, duration: number) => void;
  /** The viewer paused the content (not an ad break or the end). */
  onPause?: (time: number) => void;
  /** A seek finished at `time`. */
  onSeeked?: (time: number) => void;
  /** The stream played to its end. */
  onEnded?: () => void;
  onError?: (msg: string) => void;
  onReady?: () => void;
};

export function EYZFlowPlayer({
  streamId,
  playerKey,
  analytics: analyticsProp,
  onLicenseError,
  configId,
  config: configProp,
  drmAuthorizationKey,
  storefrontId,
  deviceName,
  offerId,
  onLimitReached,
  isProtected: isProtectedProp,
  autoPlay: autoPlayProp,
  controls: controlsProp,
  fill = false,
  onSignal,
  renderOverlay,
  endScreen,
  preferredAudioLanguage,
  preferredSubtitleLanguage,
  maxBitrate,
  thumbnails = true,
  seekSteps: seekStepsProp,
  startTime,
  onTimeUpdate,
  onPause,
  onSeeked,
  onEnded,
  onError,
  onReady,
}: EYZFlowPlayerProps) {
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
  const thumbnailsUrl =
    thumbnails === false || config.features.thumbnails === false
      ? undefined
      : typeof thumbnails === "string"
        ? thumbnails
        : defaultThumbnailsUrl(STREAM_CDN_ORIGIN, playingStreamId);

  const shaka = useShaka({
    streamId: playingStreamId,
    // The <video> only renders once the remote config is in.
    deferLoad: configLoading,
    isProtected: resolved.isProtected,
    drmAuthorizationKey,
    drmParameters,
    deviceName,
    playerKey,
    configId,
    analytics: analyticsProp !== false,
    cmcd: typeof analyticsProp === "object" && analyticsProp.cmcd === true,
    // A film the end screen picked is another offer: it reports nothing.
    offerId: playingStreamId === streamId ? offerId : undefined,
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
    preferredAudioLanguage,
    preferredSubtitleLanguage,
    maxBitrate: maxBitrate ?? config.maxBitrate,
    // A custom track belongs to the app's stream, not to one the end screen picked.
    thumbnailsUrl: typeof thumbnails === "string" && playingStreamId !== streamId ? undefined : thumbnailsUrl,
    startTime: playingStreamId === streamId ? startTime : undefined,
    onTimeUpdate,
    onPause,
    onSeeked,
    onEnded,
  });

  // Chromecast: while a session is open the TV plays, and the controls below drive it instead of the <video>.
  const cast = useCast({
    enabled: config.features.chromecast && !configLoading,
    config: config.cast,
    streamId: playingStreamId,
    ready: shaka.loadedStreamId === playingStreamId,
    start: () => ({
      accessToken: shaka.castAccessToken(),
      startTime: shaka.videoRef.current?.currentTime ?? shaka.currentTime,
      playing: shaka.playing,
      textLanguage: shaka.captionsVisible ? (shaka.activeTextTrack?.language ?? null) : null,
      audioLanguage: shaka.activeAudio?.language ?? null,
    }),
    onStart: shaka.pause,
    onEnd: (position, wasPlaying) => {
      shaka.seek(position);
      if (wasPlaying) shaka.play();
    },
  });
  const casting = cast.casting;
  const media = casting ? cast : shaka;

  const { activeSignal, skipSignal, adPlaying, state, ended, hasClosingCredits, hasThumbnails, getThumbnail } = shaka;
  const { seek, play, pause, playing, currentTime, duration } = media;

  // The browser's video stays still while the TV plays, also when its autoplay comes after the session (a page that
  // rejoins a running session).
  const localPlaying = shaka.playing;
  const pauseLocal = shaka.pause;
  useEffect(() => {
    if (casting && localPlaying) pauseLocal();
  }, [casting, localPlaying, pauseLocal]);

  // The app hears where the TV is while casting, as it does from the <video> (e.g. to keep a resume point).
  const onTimeUpdateRef = useRef(onTimeUpdate);
  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  });
  useEffect(() => {
    if (casting && cast.currentTime > 0) onTimeUpdateRef.current?.(cast.currentTime, cast.duration);
  }, [casting, cast.currentTime, cast.duration]);

  // The app's overlay: asked for at a signal or after the end, until dismissed for that moment.
  const moment = overlayMoment(activeSignal, ended);
  const momentKey = moment && `${playingStreamId}:${moment}`;
  const [dismissedMoment, setDismissedMoment] = useState<string | null>(null);
  const overlay =
    renderOverlay && momentKey && momentKey !== dismissedMoment && !adPlaying && state === "ready" && !casting
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
  // The corner video's size, from the player's size and the film's own shape; kept up to date while it shows.
  const [cornerSize, setCornerSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    const video = shaka.videoRef.current;
    if (!shrunk || !container || !video) return;
    const measure = () => setCornerSize(cornerVideoSize(container.clientWidth, container.clientHeight, video.videoWidth, video.videoHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    video.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      video.removeEventListener("resize", measure);
    };
  }, [shrunk, shaka.videoRef]);
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

  // The signal is the browser video's, which stands still while casting.
  const showSkip = config.features.skipButtons !== false && !adPlaying && state === "ready" && !overlayShown && !endPhase && !casting;

  // Auto-hide controls after 3s of pointer inactivity, but only while playing
  // and no settings menu is open.
  const [hiding, setHiding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetHideTimer = useCallback(() => {
    setHiding(false);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (config.features.autoHideControls && playing && !menuOpen && !casting) {
      hideTimer.current = setTimeout(() => setHiding(true), 3000);
    }
  }, [config.features.autoHideControls, playing, menuOpen, casting]);

  // Clicks and shortcuts drive the video only while the controls are in charge:
  // not during an ad, the app's overlay or the end screen.
  const controlsActive = resolved.controls && state === "ready" && !adPlaying && !overlayShown && !endPhase;

  // Centre flash after a click or shortcut (play, pause, volume, seek).
  // Seeks flash on their own side, clear of the back, play and forward buttons in the middle.
  const [flash, setFlash] = useState<{ icon: IconName | "replay" | "forward"; text?: string; side?: "left" | "right"; key: number } | null>(null);
  const showFlash = useCallback((icon: IconName | "replay" | "forward", text?: string, side?: "left" | "right") => {
    setFlash((prev) => ({ icon, text, side, key: (prev?.key ?? 0) + 1 }));
  }, []);

  const { videoRef } = shaka;
  const { setVolume, setMuted, toggleCaptions, seekBy, volume, muted } = media;
  const steps = resolveSeekSteps(config.seek, seekStepsProp);

  // Quick presses in one direction add up in the flash ("15 seconds"), as on YouTube.
  const seekRun = useRef<{ direction: number; total: number; at: number } | null>(null);
  const stepBy = useCallback(
    (delta: number, flashIt = true) => {
      if (seekBy(delta) === null) return;
      const direction = Math.sign(delta);
      const now = Date.now();
      const run = seekRun.current;
      const total = run && run.direction === direction && now - run.at < 1000 ? run.total + Math.abs(delta) : Math.abs(delta);
      seekRun.current = { direction, total, at: now };
      if (flashIt) showFlash(delta < 0 ? "replay" : "forward", `${total} seconds`, delta < 0 ? "left" : "right");
    },
    [seekBy, showFlash],
  );
  const seekButtonsOn = config.features.seekButtons !== false;
  const togglePlay = useCallback(() => {
    if (playing) pause();
    else play();
    // The middle play button already shows the change when it is on screen.
    if (!seekButtonsOn || hiding) showFlash(playing ? "pause" : "play");
  }, [playing, play, pause, showFlash, seekButtonsOn, hiding]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      resetHideTimer();
      if (!controlsActive || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement;
      const onInput = target.tagName === "INPUT";
      // The seek slider's own arrow step (a tenth of a second) is too small to notice: ← and → jump there too.
      const onSeekSlider = target.classList.contains("eyz-seekbar-input");
      const onButton = target.tagName === "BUTTON";
      const video = videoRef.current;
      if (!video) return;
      const vol = (delta: number) => {
        const next = Math.round(Math.max(0, Math.min(1, volume + delta)) * 100) / 100;
        setVolume(next);
        showFlash(next === 0 ? "volumeOff" : "volumeUp", `${Math.round(next * 100)}%`);
      };
      switch (e.key) {
        case " ":
          if (onButton) return;
          togglePlay();
          break;
        case "k":
          togglePlay();
          break;
        case "j":
          stepBy(-steps.buttons);
          break;
        case "l":
          stepBy(steps.buttons);
          break;
        case "ArrowLeft":
          if (onInput && !onSeekSlider) return;
          stepBy(-steps.arrowKeys);
          break;
        case "ArrowRight":
          if (onInput && !onSeekSlider) return;
          stepBy(steps.arrowKeys);
          break;
        case "ArrowUp":
          if (onInput) return;
          vol(0.05);
          break;
        case "ArrowDown":
          if (onInput) return;
          vol(-0.05);
          break;
        case "m":
          setMuted(!muted);
          showFlash(muted ? "volumeUp" : "volumeOff");
          break;
        case "f":
          void toggleFullscreen(containerRef.current);
          break;
        case "c":
          if (config.features.captions) toggleCaptions();
          break;
        default:
          if (/^[0-9]$/.test(e.key) && duration) {
            seek((duration * Number(e.key)) / 10);
            break;
          }
          return;
      }
      e.preventDefault();
    },
    [resetHideTimer, controlsActive, videoRef, seek, stepBy, steps.arrowKeys, steps.buttons, setVolume, setMuted, volume, muted, duration, toggleCaptions, togglePlay, showFlash, config.features.captions],
  );

  useEffect(() => {
    resetHideTimer();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [resetHideTimer]);

  // Apply theme as CSS custom properties
  const { theme } = config;
  const cssVars = {
    ...(cornerSize && { "--eyz-corner-width": `${cornerSize.width}px`, "--eyz-corner-height": `${cornerSize.height}px` }),
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
      onKeyDown={onKeyDown}
      tabIndex={resolved.controls ? 0 : undefined}
    >
      <video
        ref={shaka.videoRef}
        className="eyz-video"
        playsInline
        muted={config.features.muted}
        onClick={shrunk ? dismissMoment : undefined}
        title={shrunk ? endScreenBackLabel : undefined}
      />
      {controlsActive && (
        <div
          className="eyz-click-layer"
          onClick={togglePlay}
          onDoubleClick={() => void toggleFullscreen(containerRef.current)}
        />
      )}
      <div ref={shaka.adContainerRef} className="eyz-ad-container" />
      {casting && (
        <div className="eyz-casting" role="status">
          <Icon name="castConnected" size={48} />
          <span>{cast.deviceName ? `Playing on ${cast.deviceName}` : "Playing on your TV"}</span>
        </div>
      )}
      {shaka.activeCueLines.length > 0 && !shaka.adPlaying && !shrunk && !casting && (
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
      {flash && controlsActive && (
        <div key={flash.key} className={`eyz-flash${flash.side ? ` eyz-flash--${flash.side}` : ""}`} aria-hidden="true">
          <div className="eyz-flash-icon">
            {flash.icon === "replay" || flash.icon === "forward" ? <SeekIcon direction={flash.icon} size={36} /> : <Icon name={flash.icon} size={36} />}
          </div>
          {flash.text && <div className="eyz-flash-text">{flash.text}</div>}
        </div>
      )}
      {controlsActive && !playing && currentTime === 0 ? (
        <button type="button" className="eyz-big-play" onClick={togglePlay} aria-label="Play">
          <Icon name="play" size={40} />
        </button>
      ) : (
        controlsActive &&
        seekButtonsOn && (
          <SeekButtons
            seconds={steps.buttons}
            playing={playing}
            onBack={() => { resetHideTimer(); stepBy(-steps.buttons, false); }}
            onForward={() => { resetHideTimer(); stepBy(steps.buttons, false); }}
            onTogglePlay={() => { resetHideTimer(); if (playing) pause(); else play(); }}
          />
        )
      )}
      <PlayerOverlay state={shaka.state} errorMsg={shaka.errorMsg} />
      {resolved.controls && shaka.state !== "error" && !shaka.adPlaying && (
        <ControlBar
          playing={playing}
          currentTime={currentTime}
          duration={duration}
          buffered={casting ? 0 : shaka.buffered}
          volume={volume}
          muted={muted}
          tracks={shaka.tracks}
          activeTrack={shaka.activeTrack}
          textTracks={media.textTracks}
          activeTextTrack={media.activeTextTrack}
          captionsVisible={casting ? cast.activeTextTrack !== null : shaka.captionsVisible}
          audioOptions={media.audioOptions}
          activeAudio={media.activeAudio}
          features={config.features}
          cast={{ available: cast.available, casting, deviceName: cast.deviceName, onToggle: cast.toggle }}
          videoRef={shaka.videoRef}
          containerRef={containerRef}
          onPlay={play}
          onPause={pause}
          onSeek={seek}
          onVolume={setVolume}
          onMute={setMuted}
          onSelectTrack={shaka.selectTrack}
          onSelectTextTrack={media.selectTextTrack}
          onCaptionsOff={media.disableCaptions}
          onSelectAudio={media.selectAudio}
          onToggleCaptions={toggleCaptions}
          onMenuOpenChange={setMenuOpen}
          getThumbnail={hasThumbnails ? getThumbnail : undefined}
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
