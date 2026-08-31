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
  drmParameters?: Record<string, unknown>;
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
  const { streamId, isProtected, drmAuthorizationKey, drmParameters, autoPlay, muted: initMuted, loop, onReady, onError } = options;

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
  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  });

  const fail = useCallback((msg: string) => {
    setState("error");
    setErrorMsg(msg);
    onErrorRef.current?.(msg);
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
        const detail = (event as CustomEvent<{ message?: string; code?: number }>).detail;
        const msg = detail?.code
          ? `Playback error ${detail.code}${detail.message ? `: ${detail.message}` : ""}`
          : (detail?.message ?? "Playback failed.");
        fail(msg);
      });

      player.addEventListener("trackschanged", () => { if (!cancelled) refreshTracks(); });
      player.addEventListener("adaptation", () => { if (!cancelled) refreshTracks(); });
      player.addEventListener("textchanged", () => { if (!cancelled) refreshTracks(); });

      if (isProtected && drmAuthorizationKey) {
        configureDrm(player, shaka, streamId, drmAuthorizationKey, drmParameters);
      }

      try {
        await player.load(streamManifestUrl(streamId));
        if (cancelled) return;
        setState("ready");
        setErrorMsg(null);
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
      video.textTracks.removeEventListener("addtrack", onAddTrack);
      unbindCueTrack();
      const p = playerRef.current;
      playerRef.current = null;
      if (p) void p.destroy();
    };
  }, [streamId, isProtected, drmAuthorizationKey, drmParameters, autoPlay, fail, refreshTracks, bindCueTrack, unbindCueTrack]);

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
