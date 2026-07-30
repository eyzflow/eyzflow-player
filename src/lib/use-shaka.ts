import { useCallback, useEffect, useRef, useState } from "react";
import { loadShaka } from "./shaka-loader";
import { configureDrm } from "./drm";
import { streamManifestUrl } from "./manifest";
import type { ShakaPlayerApi, ShakaTrack, ShakaTextTrack } from "./shaka-types";

export type ShakaState = "idle" | "loading" | "ready" | "error";

export type UseShakaOptions = {
  streamId: string;
  isProtected: boolean;
  drmAuthorizationKey?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  onReady?: () => void;
  onError?: (msg: string) => void;
};

export type UseShakaReturn = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  state: ShakaState;
  errorMsg: string | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  muted: boolean;
  tracks: ShakaTrack[];
  activeTrack: ShakaTrack | null;
  textTracks: ShakaTextTrack[];
  captionsVisible: boolean;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  selectTrack: (track: ShakaTrack) => void;
  selectTextTrack: (track: ShakaTextTrack) => void;
  toggleCaptions: () => void;
};

export function useShaka(options: UseShakaOptions): UseShakaReturn {
  const { streamId, isProtected, drmAuthorizationKey, autoPlay, muted: initMuted, loop, onReady, onError } = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<ShakaPlayerApi | null>(null);

  const [state, setState] = useState<ShakaState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMutedState] = useState(initMuted ?? false);
  const [tracks, setTracks] = useState<ShakaTrack[]>([]);
  const [activeTrack, setActiveTrack] = useState<ShakaTrack | null>(null);
  const [textTracks, setTextTracks] = useState<ShakaTextTrack[]>([]);
  const [captionsVisible, setCaptionsVisible] = useState(false);

  const fail = useCallback(
    (msg: string) => {
      setState("error");
      setErrorMsg(msg);
      onError?.(msg);
    },
    [onError],
  );

  const refreshTracks = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    const vt = p.getVariantTracks();
    setTracks(vt);
    setActiveTrack(vt.find((t) => t.active) ?? null);
    setTextTracks(p.getTextTracks());
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;

    const onTimeUpdate = () => {
      if (cancelled) return;
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
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

    void (async () => {
      setState("loading");

      let shaka;
      try {
        shaka = await loadShaka();
      } catch (e) {
        if (!cancelled) fail(e instanceof Error ? e.message : "Could not load player.");
        return;
      }

      shaka.polyfill.installAll();

      if (!shaka.Player.isBrowserSupported()) {
        if (!cancelled) fail("Playback not supported in this browser.");
        return;
      }

      const player = new shaka.Player();
      playerRef.current = player;
      await player.attach(video);

      player.addEventListener("error", (event: Event) => {
        if (cancelled) return;
        const detail = (event as CustomEvent<{ message?: string; code?: number }>).detail;
        const msg = detail?.code
          ? `Playback error ${detail.code}${detail.message ? `: ${detail.message}` : ""}`
          : (detail?.message ?? "Playback failed.");
        fail(msg);
      });

      player.addEventListener("trackschanged", () => { if (!cancelled) refreshTracks(); });
      player.addEventListener("adaptation", () => { if (!cancelled) refreshTracks(); });

      if (isProtected && drmAuthorizationKey) {
        configureDrm(player, shaka, streamId, drmAuthorizationKey);
      }

      try {
        await player.load(streamManifestUrl(streamId));
        if (cancelled) return;
        setState("ready");
        setErrorMsg(null);
        refreshTracks();
        onReady?.();
        if (autoPlay) {
          const kick = () => void video.play().catch(() => {});
          kick();
          setTimeout(kick, 300);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const e = err as { code?: number; message?: string };
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
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDuration);
      video.removeEventListener("loadedmetadata", onDuration);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("volumechange", onVolumeChange);
      const p = playerRef.current;
      playerRef.current = null;
      if (p) void p.destroy();
    };
  }, [streamId, isProtected, drmAuthorizationKey, autoPlay, fail, refreshTracks, onReady]);

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
    p.setTextTrackVisibility(true);
    setCaptionsVisible(true);
  }, []);
  const toggleCaptions = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    const next = !captionsVisible;
    p.setTextTrackVisibility(next);
    setCaptionsVisible(next);
  }, [captionsVisible]);

  return {
    videoRef,
    state,
    errorMsg,
    playing,
    currentTime,
    duration,
    buffered,
    volume,
    muted,
    tracks,
    activeTrack,
    textTracks,
    captionsVisible,
    play,
    pause,
    seek,
    setVolume,
    setMuted,
    selectTrack,
    selectTextTrack,
    toggleCaptions,
  };
}
