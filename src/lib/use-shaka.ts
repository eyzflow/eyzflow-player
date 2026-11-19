import { useCallback, useEffect, useRef, useState } from "react";
import { loadShaka } from "./shaka-loader";
import { configureDrm } from "./drm";
import { streamManifestUrl } from "./manifest";
import { getDeviceId } from "./device";
import {
  closePlaybackSession,
  heartbeatPlaybackSession,
  limitMessage,
  openPlaybackSession,
  PlaybackLimitException,
  type PlaybackLimitCode,
  type PlaybackLimitError,
} from "./playback-session";
import type { ShakaError, ShakaPlayerApi, ShakaTrack, ShakaTextTrack } from "./shaka-types";
import { LICENSE_CODES, LicenseSession, licenseMessage, PlayerLicenseException, type PlayerLicenseCode, type PlayerLicenseError } from "./license";
import { AnalyticsCollector } from "./analytics/collector";
import { BeatTransport } from "./analytics/transport";

export type ShakaState = "idle" | "loading" | "ready" | "error";

export type UseShakaOptions = {
  streamId: string;
  isProtected: boolean;
  drmAuthorizationKey?: string;
  drmParameters?: Record<string, unknown>;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  /** Shown in the viewer's device list, e.g. "Living room". Defaults to the browser's description. */
  deviceName?: string;
  /** The organisation's player key: checked for this site before playing, and needed for analytics. */
  playerKey?: string;
  /** The remote config id, sent with the licence check. */
  configId?: string;
  /** Send playback quality analytics (only with a player key whose analytics are on). Default true. */
  analytics?: boolean;
  /** Add CMCD data (with the analytics impression id) to manifest and segment requests. Default false. */
  cmcd?: boolean;
  /** The player key check refused this site or key. */
  onLicenseError?: (error: PlayerLicenseError) => void;
  onReady?: () => void;
  onError?: (msg: string) => void;
  /** A plan's stream or device limit was reached, or the viewer was signed out on this device. */
  onLimitReached?: (limit: PlaybackLimitError) => void;
};

export type UseShakaReturn = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  state: ShakaState;
  errorMsg: string | null;
  /** Set when playback was refused or stopped by a stream or device limit. */
  limitError: PlaybackLimitError | null;
  /** Set when the player key check refused this site or key. */
  licenseError: PlayerLicenseError | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  muted: boolean;
  tracks: ShakaTrack[];
  activeTrack: ShakaTrack | null;
  textTracks: ShakaTextTrack[];
  activeTextTrack: ShakaTextTrack | null;
  captionsVisible: boolean;
  /** Text lines of the currently active subtitle cues, for custom rendering. */
  activeCueLines: string[];
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  selectTrack: (track: ShakaTrack) => void;
  selectTextTrack: (track: ShakaTextTrack) => void;
  disableCaptions: () => void;
  toggleCaptions: () => void;
};

export function useShaka(options: UseShakaOptions): UseShakaReturn {
  const { streamId, isProtected, drmAuthorizationKey, drmParameters, deviceName, autoPlay, muted: initMuted, loop, onReady, onError, onLimitReached, playerKey, configId, analytics = true, cmcd = false, onLicenseError } = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<ShakaPlayerApi | null>(null);

  const [state, setState] = useState<ShakaState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [limitError, setLimitError] = useState<PlaybackLimitError | null>(null);
  const [licenseError, setLicenseError] = useState<PlayerLicenseError | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMutedState] = useState(initMuted ?? false);
  const [tracks, setTracks] = useState<ShakaTrack[]>([]);
  const [activeTrack, setActiveTrack] = useState<ShakaTrack | null>(null);
  const [textTracks, setTextTracks] = useState<ShakaTextTrack[]>([]);
  const [activeTextTrack, setActiveTextTrack] = useState<ShakaTextTrack | null>(null);
  const [captionsVisible, setCaptionsVisible] = useState(false);
  const [activeCueLines, setActiveCueLines] = useState<string[]>([]);

  // Cues are rendered by the player UI (not the browser's native cue box),
  // so keep the native tracks "hidden": cues stay parsed and cuechange keeps
  // firing, but nothing paints over our layout. Shaka may flip a track back
  // to "showing" when selection changes, so this runs from several places.
  const cueTrackRef = useRef<TextTrack | null>(null);

  const readActiveCues = useCallback(() => {
    const track = cueTrackRef.current;
    if (!track || !track.activeCues) {
      setActiveCueLines([]);
      return;
    }
    const lines: string[] = [];
    for (const cue of Array.from(track.activeCues)) {
      // Strip WebVTT markup (<i>, <c.class>, …) — we render plain text.
      const text = (cue as VTTCue).text?.replace(/<[^>]+>/g, "");
      if (text) lines.push(...text.split("\n"));
    }
    setActiveCueLines(lines);
  }, []);

  const unbindCueTrack = useCallback(() => {
    const prev = cueTrackRef.current;
    if (prev) prev.removeEventListener("cuechange", readActiveCues);
    cueTrackRef.current = null;
    setActiveCueLines([]);
  }, [readActiveCues]);

  const bindCueTrack = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = Array.from(video.textTracks);
    const track =
      tracks.find((t) => t.mode === "showing") ??
      tracks.find((t) => t.mode === "hidden") ??
      null;
    for (const t of tracks) {
      if (t.mode === "showing") t.mode = "hidden";
    }
    if (track === cueTrackRef.current) {
      readActiveCues();
      return;
    }
    unbindCueTrack();
    if (!track) return;
    cueTrackRef.current = track;
    track.addEventListener("cuechange", readActiveCues);
    readActiveCues();
  }, [readActiveCues, unbindCueTrack]);

  // Held in refs so callers can pass inline handlers without re-running setup.
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const onLimitReachedRef = useRef(onLimitReached);
  const onLicenseErrorRef = useRef(onLicenseError);
  const configIdRef = useRef(configId);
  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
    onLimitReachedRef.current = onLimitReached;
    onLicenseErrorRef.current = onLicenseError;
    configIdRef.current = configId;
  });

  const fail = useCallback((msg: string) => {
    setState("error");
    setErrorMsg(msg);
    onErrorRef.current?.(msg);
  }, []);

  const failLimit = useCallback((limit: PlaybackLimitError) => {
    setLimitError(limit);
    onLimitReachedRef.current?.(limit);
    setState("error");
    setErrorMsg(limitMessage(limit.code));
    onErrorRef.current?.(limitMessage(limit.code));
  }, []);

  const failLicense = useCallback((license: PlayerLicenseError) => {
    setLicenseError(license);
    onLicenseErrorRef.current?.(license);
    setState("error");
    setErrorMsg(license.message);
    onErrorRef.current?.(license.message);
  }, []);

  const refreshTracks = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    const vt = p.getVariantTracks();
    setTracks(vt);
    setActiveTrack(vt.find((t) => t.active) ?? null);
    const tt = p.getTextTracks();
    setTextTracks(tt);
    // In Shaka 5 there is no separate visibility flag on Player: text is
    // visible exactly when a track is selected (active).
    const active = tt.find((t) => t.active) ?? null;
    setActiveTextTrack(active);
    setCaptionsVisible(active != null);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    setLimitError(null);
    setLicenseError(null);

    // The player key check (this site may play) and the analytics of this impression, when the embedder gave a key.
    let license: LicenseSession | null = null;
    let collector: AnalyticsCollector | null = null;
    let transport: BeatTransport | null = null;
    const endAnalytics = () => {
      transport?.stop();
      transport = null;
      collector?.destroy();
      collector = null;
    };

    // The playback session that counts this stream against the plan's limits (storefront viewers only).
    let session: { target: Parameters<typeof closePlaybackSession>[0]; id: string } | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    const endSession = () => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      if (session) closePlaybackSession(session.target, session.id);
      session = null;
    };
    window.addEventListener("pagehide", endSession);

    const onTimeUpdate = () => {
      if (cancelled) return;
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
      const cueTrack = cueTrackRef.current;
      if (cueTrack && cueTrack.mode === "showing") cueTrack.mode = "hidden";
    };
    const onAddTrack = () => { if (!cancelled) bindCueTrack(); };
    const onDuration = () => {
      if (!cancelled && Number.isFinite(video.duration)) setDuration(video.duration);
    };
    const onPlay = () => { if (!cancelled) setPlaying(true); };
    const onPause = () => { if (!cancelled) setPlaying(false); };
    const onVolumeChange = () => {
      if (cancelled) return;
      setVolumeState(video.volume);
      setMutedState(video.muted);
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDuration);
    video.addEventListener("loadedmetadata", onDuration);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("volumechange", onVolumeChange);
    video.textTracks.addEventListener("addtrack", onAddTrack);

    void (async () => {
      setState("loading");

      let shaka;
      try {
        shaka = await loadShaka();
      } catch (e) {
        if (!cancelled) fail(e instanceof Error ? e.message : "Could not load player.");
        return;
      }
      if (cancelled) return;

      shaka.polyfill.installAll();

      if (!shaka.Player.isBrowserSupported()) {
        if (!cancelled) fail("Playback not supported in this browser.");
        return;
      }

      const player = new shaka.Player();
      await player.attach(video);
      if (cancelled) {
        void player.destroy();
        return;
      }
      playerRef.current = player;

      player.addEventListener("error", (event: Event) => {
        if (cancelled) return;
        const detail = (event as CustomEvent<ShakaError>).detail;
        collector?.recordError({ code: detail?.code ?? "UNKNOWN", category: detail?.category ?? null, message: detail?.message ?? null, fatal: detail?.severity !== 1 });
        const siteRefused = licenseCodeIn(detail);
        if (siteRefused) {
          endSession();
          failLicense({ code: siteRefused, message: licenseMessage(siteRefused) });
          return;
        }
        const refused = limitCodeIn(detail);
        if (refused) {
          endSession();
          failLimit({ code: refused, message: limitMessage(refused), details: {} });
          return;
        }
        const msg = detail?.code
          ? `Playback error ${detail.code}${detail.message ? `: ${detail.message}` : ""}`
          : (detail?.message ?? "Playback failed.");
        fail(msg);
      });

      player.addEventListener("trackschanged", () => { if (!cancelled) refreshTracks(); });
      player.addEventListener("adaptation", () => { if (!cancelled) refreshTracks(); });
      player.addEventListener("textchanged", () => { if (!cancelled) refreshTracks(); });

      if (playerKey) {
        try {
          license = await LicenseSession.start({ key: playerKey, streamId, configId: configIdRef.current }, (refusal) => {
            // The key was switched off or the site removed while playing: stop when the organisation enforces.
            if (cancelled || license?.current.mode !== "enforce") return;
            endSession();
            endAnalytics();
            void player.unload();
            failLicense(refusal);
          });
        } catch (e) {
          if (cancelled) return;
          if (e instanceof PlayerLicenseException) {
            failLicense(e.license);
            return;
          }
          // The check could not be reached: play without a token (the DRM check still applies) and without analytics.
        }
        if (cancelled) {
          license?.stop();
          return;
        }
        if (license && license.current.analytics.enabled && analytics) {
          collector = new AnalyticsCollector(video, player, { autoplay: !!autoPlay });
          const session = license;
          transport = new BeatTransport(collector, {
            getToken: () => session.token,
            streamId,
            intervalSeconds: session.current.analytics.heartbeatIntervalSeconds,
            isLive: () => player.isLive?.() ?? false,
            autoplay: !!autoPlay,
            drm: () => (isProtected ? drmName(player.drmInfo?.()?.keySystem) : "none"),
          });
          transport.start();
          if (cmcd) player.configure({ cmcd: { enabled: true, sessionId: transport.impressionId, contentId: streamId } });
        }
      }

      if (isProtected && drmAuthorizationKey) {
        const deviceId = getDeviceId();
        const parameters: Record<string, unknown> = { ...drmParameters, device_id: deviceId };
        const storefrontId = drmParameters?.storefront_id;
        if (typeof storefrontId === "string" && storefrontId) {
          const target = { storefrontId, authorization: drmAuthorizationKey, deviceId };
          try {
            const opened = await openPlaybackSession({ ...target, streamId, deviceName });
            if (cancelled) {
              if (opened.id) closePlaybackSession(target, opened.id);
              return;
            }
            if (opened.id) {
              const current = { target, id: opened.id };
              session = current;
              parameters.playback_session_id = opened.id;
              heartbeat = setInterval(() => {
                void heartbeatPlaybackSession(current.target, current.id).then((alive) => {
                  if (alive || cancelled || session !== current) return;
                  session = null;
                  endSession();
                  void player.unload();
                  failLimit({ code: "PLAYBACK_SESSION_ENDED", message: limitMessage("PLAYBACK_SESSION_ENDED"), details: {} });
                });
              }, opened.heartbeatIntervalSeconds * 1000);
            }
          } catch (e) {
            if (cancelled) return;
            if (e instanceof PlaybackLimitException) {
              failLimit(e.limit);
              return;
            }
            // Any other failure leaves the limits to the licence request, which counts this stream itself.
          }
        }
        configureDrm(player, shaka, streamId, drmAuthorizationKey, () =>
          license ? { ...parameters, player_token: license.token } : parameters,
        );
      }

      try {
        await player.load(streamManifestUrl(streamId));
        if (cancelled) return;
        setState("ready");
        setErrorMsg(null);
        collector?.markReady();
        refreshTracks();
        onReadyRef.current?.();
        if (autoPlay) {
          const kick = () => void video.play().catch(() => {});
          kick();
          setTimeout(kick, 300);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const e = err as { code?: number; message?: string };
        if (collector && collector.currentState !== "error") collector.recordError({ code: e?.code ?? "LOAD_FAILED", message: e?.message ?? null });
        const siteRefused = licenseCodeIn(err);
        if (siteRefused) {
          failLicense({ code: siteRefused, message: licenseMessage(siteRefused) });
          return;
        }
        const msg = e?.code
          ? `Playback error ${e.code}${e.message ? `: ${e.message}` : ""}`
          : err instanceof Error
            ? err.message
            : "Playback failed.";
        fail(msg);
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", endSession);
      endSession();
      endAnalytics();
      license?.stop();
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDuration);
      video.removeEventListener("loadedmetadata", onDuration);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("volumechange", onVolumeChange);
      video.textTracks.removeEventListener("addtrack", onAddTrack);
      unbindCueTrack();
      const p = playerRef.current;
      playerRef.current = null;
      if (p) void p.destroy();
    };
  }, [streamId, isProtected, drmAuthorizationKey, drmParameters, deviceName, autoPlay, playerKey, analytics, cmcd, fail, failLimit, failLicense, refreshTracks, bindCueTrack, unbindCueTrack]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.loop = loop ?? false;
  }, [loop]);

  const play = useCallback(() => void videoRef.current?.play().catch(() => {}), []);
  const pause = useCallback(() => videoRef.current?.pause(), []);
  const seek = useCallback((s: number) => {
    if (videoRef.current) videoRef.current.currentTime = Math.max(0, s);
  }, []);
  const setVolume = useCallback((v: number) => {
    if (videoRef.current) {
      videoRef.current.volume = Math.max(0, Math.min(1, v));
      videoRef.current.muted = false;
    }
  }, []);
  const setMuted = useCallback((m: boolean) => {
    if (videoRef.current) videoRef.current.muted = m;
  }, []);
  const selectTrack = useCallback((track: ShakaTrack) => {
    playerRef.current?.selectVariantTrack(track, true);
    setActiveTrack(track);
  }, []);
  const selectTextTrack = useCallback((track: ShakaTextTrack) => {
    const p = playerRef.current;
    if (!p) return;
    p.selectTextTrack(track);
    setCaptionsVisible(true);
    setActiveTextTrack(track);
    // The native track backing the selection may only exist after Shaka
    // processes the switch; bind on the next tick (addtrack covers the rest).
    setTimeout(bindCueTrack, 0);
  }, [bindCueTrack]);
  const disableCaptions = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    p.selectTextTrack(null);
    setCaptionsVisible(false);
    setActiveTextTrack(null);
    unbindCueTrack();
  }, [unbindCueTrack]);
  const toggleCaptions = useCallback(() => {
    if (captionsVisible) {
      disableCaptions();
      return;
    }
    const p = playerRef.current;
    if (!p) return;
    const track = activeTextTrack ?? p.getTextTracks()[0];
    if (track) selectTextTrack(track);
  }, [captionsVisible, activeTextTrack, selectTextTrack, disableCaptions]);

  return {
    videoRef,
    state,
    errorMsg,
    limitError,
    licenseError,
    playing,
    currentTime,
    duration,
    buffered,
    volume,
    muted,
    tracks,
    activeTrack,
    textTracks,
    activeTextTrack,
    captionsVisible,
    activeCueLines,
    play,
    pause,
    seek,
    setVolume,
    setMuted,
    selectTrack,
    selectTextTrack,
    disableCaptions,
    toggleCaptions,
  };
}

/** The DRM system's short name, from a key system id. */
function drmName(keySystem: string | undefined): string | null {
  if (!keySystem) return null;
  if (keySystem.includes("widevine")) return "widevine";
  if (keySystem.includes("playready")) return "playready";
  if (keySystem.includes("fps") || keySystem.includes("fairplay")) return "fairplay";
  if (keySystem.includes("clearkey")) return "clearkey";
  return null;
}

const LICENSE_CODE_PATTERN = /"code"\s*:\s*"([A-Z_]+)"/g;

/** A licence request refused by the player key site check: its code, from the response text Shaka keeps. */
function licenseCodeIn(detail: unknown): PlayerLicenseCode | null {
  let text: string;
  try {
    text = JSON.stringify(detail).replace(/\\"/g, '"');
  } catch {
    return null;
  }
  for (const match of text.matchAll(LICENSE_CODE_PATTERN)) {
    if (LICENSE_CODES.has(match[1])) return match[1] as PlayerLicenseCode;
  }
  return null;
}

const LIMIT_CODE_PATTERN = /"code"\s*:\s*"(STREAM_LIMIT|DEVICE_LIMIT|DEVICE_REVOKED|SESSION_REVOKED|PLAYBACK_SESSION_ENDED)"/;

/** A licence request refused by a stream or device limit: Shaka keeps the response text in the error's data. */
function limitCodeIn(detail: unknown): PlaybackLimitCode | null {
  let text: string;
  try {
    text = JSON.stringify(detail);
  } catch {
    return null;
  }
  const match = LIMIT_CODE_PATTERN.exec(text.replace(/\\"/g, '"'));
  return match ? (match[1] as PlaybackLimitCode) : null;
}
