import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerCastConfig } from "./config-types";
import {
  castMediaFor,
  castReceiverAppId,
  loadCastSender,
  type CastContext,
  type CastMediaSession,
  type CastSdk,
  type RemotePlayer,
  type RemotePlayerController,
} from "./cast-sender";
import {
  castAudioOptions,
  castHandback,
  castTextTracks,
  castTrackForLanguage,
  withActiveTrack,
  type AudioOption,
  type CastHandback,
  type CastTrack,
} from "./media-tracks";
import type { ShakaTextTrack } from "./shaka-types";
import { seekTarget } from "./seek-steps";

/** Where the browser is when casting starts, read then (and again when the stream changes while casting). */
export type CastStart = {
  accessToken: string | null;
  startTime: number;
  /** The browser's video plays: handed back as it was when casting fails before the TV started. */
  playing: boolean;
  /** The subtitle language on in the browser, or null when subtitles are off. */
  textLanguage: string | null;
  audioLanguage: string | null;
  /** The browser's audio label, to tell one language's stereo and 5.1 apart. */
  audioLabel: string | null;
  /** The film's title and poster, for the TV. */
  title?: string | null;
  poster?: string | null;
};

export type UseCastOptions = {
  /** `features.chromecast`: the Cast SDK loads only then. */
  enabled: boolean;
  config?: PlayerCastConfig;
  streamId: string;
  /** The browser finished loading `streamId` (its DRM token and start position are known): the TV loads it then. */
  ready: boolean;
  start: () => CastStart;
  /** Casting started: the browser's video stops. */
  onStart?: () => void;
  /**
   * Casting ended, with where the TV was, whether it played and its last subtitle and audio (null when the TV reported
   * no tracks): the browser takes over there.
   */
  onEnd?: (position: number, playing: boolean, tracks: CastHandback | null) => void;
};

export type UseCastReturn = {
  /** A Cast device can be picked (Chrome or Edge, with the SDK loaded). */
  available: boolean;
  /** A Cast session is open: the controls drive the TV. */
  casting: boolean;
  deviceName: string | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  textTracks: ShakaTextTrack[];
  activeTextTrack: ShakaTextTrack | null;
  audioOptions: AudioOption[];
  activeAudio: AudioOption | null;
  /** Opens Chrome's device picker, or stops casting. */
  toggle: () => void;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  seekBy: (delta: number) => number | null;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  selectTextTrack: (track: ShakaTextTrack) => void;
  disableCaptions: () => void;
  toggleCaptions: () => void;
  selectAudio: (option: AudioOption) => void;
};

type Remote = { sdk: CastSdk; context: CastContext; player: RemotePlayer; controller: RemotePlayerController };

const log = (...args: unknown[]) => console.warn("[eyzflow-cast]", ...args);

/** How long the TV may take to start the stream before casting counts as failed (as in the Flutter player). */
const LOAD_TIMEOUT_MS = 20_000;

/**
 * Chromecast through the Cast Web Sender SDK and the EYZFlow receiver: loads the stream on the TV where the browser
 * is, carries the browser's subtitle and audio language over, and while casting reports the TV's state and switches
 * its tracks (EDIT_TRACKS_INFO).
 */
export function useCast({ enabled, config, streamId, ready, start, onStart, onEnd }: UseCastOptions): UseCastReturn {
  const [available, setAvailable] = useState(false);
  const [casting, setCasting] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMutedState] = useState(false);
  const [tracks, setTracks] = useState<CastTrack[]>([]);
  const [activeIds, setActiveIds] = useState<number[]>([]);

  const remoteRef = useRef<Remote | null>(null);
  const mediaRef = useRef<CastMediaSession | null>(null);
  // The browser's languages, applied once the TV reports its tracks.
  const carryRef = useRef<{ text: string | null; audio: string | null; audioLabel: string | null } | null>(null);
  // The TV's last position and play state, for handing back when the session ends (the remote player resets then).
  const lastRef = useRef({ time: 0, playing: false });
  // The TV's tracks and the ones on, from its last status (or the viewer's last switch), handed back the same way.
  const lastTracksRef = useRef<{ tracks: CastTrack[]; ids: number[] }>({ tracks: [], ids: [] });
  // The subtitle track the viewer last had on, for the captions button.
  const lastTextRef = useRef<number | null>(null);
  // A LOAD is on its way to the TV (its stream id).
  const loadingRef = useRef<string | null>(null);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamIdRef = useRef(streamId);
  const startRef = useRef(start);
  const onStartRef = useRef(onStart);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    streamIdRef.current = streamId;
    startRef.current = start;
    onStartRef.current = onStart;
    onEndRef.current = onEnd;
  });

  const editTracks = useCallback((ids: number[]) => {
    const media = mediaRef.current;
    const remote = remoteRef.current;
    if (!media || !remote) return;
    setActiveIds(ids);
    lastTracksRef.current = { ...lastTracksRef.current, ids };
    media.editTracksInfo(new remote.sdk.media.EditTracksInfoRequest(ids), () => {}, (error) => log("switching tracks failed", error));
  }, []);

  const sync = useCallback(() => {
    const remote = remoteRef.current;
    if (!remote) return;
    const { player } = remote;
    const media = remote.context.getCurrentSession()?.getMediaSession() ?? null;
    if (media?.playerState === "IDLE" && media.idleReason === "ERROR") {
      log("the TV stopped with an error");
      remote.context.endCurrentSession(true);
      return;
    }
    const t = media?.media?.tracks ?? [];
    let ids = media?.activeTrackIds ?? [];
    const carry = carryRef.current;
    // Once the TV plays: a switch sent while it still loads gives way to the receiver's own default tracks.
    const started = media?.playerState === "PLAYING" || media?.playerState === "PAUSED";
    if (carry && t.length > 0 && started) {
      carryRef.current = null;
      const text = castTrackForLanguage(t, "TEXT", carry.text);
      const audio = castTrackForLanguage(t, "AUDIO", carry.audio, carry.audioLabel);
      let next = withActiveTrack(t, ids, "TEXT", text?.trackId ?? null);
      if (audio) next = withActiveTrack(t, next, "AUDIO", audio.trackId);
      if (next.join() !== ids.join()) {
        ids = next;
        editTracks(next);
      }
    }
    setTracks(t);
    setActiveIds(ids);
    if (t.length > 0) lastTracksRef.current = { tracks: t, ids };
    if (player.isMediaLoaded) {
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
      loadTimerRef.current = null;
      lastRef.current = { time: player.currentTime, playing: !player.isPaused };
      setCurrentTime(player.currentTime);
      setDuration(player.duration);
      setPlaying(!player.isPaused);
    }
    setVolumeState(player.volumeLevel);
    setMutedState(player.isMuted);
  }, [editTracks]);

  const watchMedia = useCallback(() => {
    const media = remoteRef.current?.context.getCurrentSession()?.getMediaSession() ?? null;
    if (media === mediaRef.current) return;
    mediaRef.current?.removeUpdateListener(sync);
    mediaRef.current = media;
    media?.addUpdateListener(sync);
  }, [sync]);

  const load = useCallback(async () => {
    const remote = remoteRef.current;
    const session = remote?.context.getCurrentSession();
    const id = streamIdRef.current;
    if (!remote || !session || loadingRef.current === id) return;
    loadingRef.current = id;
    const from = startRef.current();
    lastRef.current = { ...lastRef.current, time: from.startTime };
    setCurrentTime(from.startTime);
    setTracks([]);
    setActiveIds([]);
    lastTracksRef.current = { tracks: [], ids: [] };
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    loadTimerRef.current = setTimeout(() => {
      loadTimerRef.current = null;
      if (remoteRef.current?.player.isMediaLoaded) return;
      log("the TV did not start the stream in time");
      remoteRef.current?.context.endCurrentSession(true);
    }, LOAD_TIMEOUT_MS);
    try {
      const { media: castMedia, Image } = remote.sdk;
      const media = castMediaFor(id, from.accessToken, { title: from.title, poster: from.poster });
      const info = new castMedia.MediaInfo(media.contentId, media.contentType);
      info.contentUrl = media.contentUrl;
      info.customData = media.customData;
      info.streamType = castMedia.StreamType.BUFFERED;
      if (media.metadata) {
        // The title and poster only decorate the TV: casting goes on without them.
        try {
          const metadata = new castMedia.MovieMediaMetadata();
          if (media.metadata.title) metadata.title = media.metadata.title;
          metadata.images = media.metadata.images.map((url) => new Image(url));
          info.metadata = metadata;
        } catch (error) {
          log("leaving out the title and poster", error);
        }
      }
      const request = new castMedia.LoadRequest(info);
      request.currentTime = from.startTime;
      request.autoplay = true;
      await session.loadMedia(request);
    } catch (error) {
      log("the TV could not load the stream", error);
      if (loadingRef.current === id) loadingRef.current = null;
      remoteRef.current?.context.endCurrentSession(true);
      return;
    }
    if (loadingRef.current === id) loadingRef.current = null;
    if (streamIdRef.current !== id) return;
    // Set only now, so a status of the media before this one can't use it up.
    carryRef.current = { text: from.textLanguage, audio: from.audioLanguage, audioLabel: from.audioLabel };
    watchMedia();
    sync();
  }, [sync, watchMedia]);

  const receiverAppId = castReceiverAppId(config);
  const autoJoinPolicy = config?.autoJoinPolicy ?? "tab_and_origin_scoped";

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let detach: (() => void) | null = null;

    void loadCastSender().then((sdk) => {
      if (cancelled || !sdk) return;
      const { framework } = sdk;
      const context = framework.CastContext.getInstance();
      context.setOptions({ receiverApplicationId: receiverAppId, autoJoinPolicy });
      const player = new framework.RemotePlayer();
      const controller = new framework.RemotePlayerController(player);
      remoteRef.current = { sdk, context, player, controller };

      const begin = (resumed: boolean) => {
        const session = context.getCurrentSession();
        if (!session) return;
        const from = startRef.current();
        lastRef.current = { time: from.startTime, playing: from.playing };
        lastTracksRef.current = { tracks: [], ids: [] };
        setDeviceName(session.getCastDevice().friendlyName ?? null);
        onStartRef.current?.();
        // A resumed session (a reload) may already play this stream: take it as it is. Otherwise the effect below
        // loads the stream once the browser has it.
        if (resumed && session.getMediaSession()?.media?.contentId === streamIdRef.current) {
          watchMedia();
          sync();
        }
        setCasting(true);
      };
      const end = () => {
        if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
        loadTimerRef.current = null;
        loadingRef.current = null;
        mediaRef.current?.removeUpdateListener(sync);
        mediaRef.current = null;
        carryRef.current = null;
        setCasting(false);
        setDeviceName(null);
        setTracks([]);
        setActiveIds([]);
        const { tracks: lastTracks, ids: lastIds } = lastTracksRef.current;
        lastTracksRef.current = { tracks: [], ids: [] };
        onEndRef.current?.(lastRef.current.time, lastRef.current.playing, castHandback(lastTracks, lastIds));
      };
      const onSession = (event: { sessionState: string }) => {
        const { SessionState } = framework;
        if (event.sessionState === SessionState.SESSION_STARTED) begin(false);
        else if (event.sessionState === SessionState.SESSION_RESUMED) begin(true);
        else if (event.sessionState === SessionState.SESSION_ENDED) end();
      };
      const onChange = () => {
        watchMedia();
        sync();
      };
      context.addEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, onSession);
      controller.addEventListener(framework.RemotePlayerEventType.ANY_CHANGE, onChange);
      detach = () => {
        context.removeEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, onSession);
        controller.removeEventListener(framework.RemotePlayerEventType.ANY_CHANGE, onChange);
        mediaRef.current?.removeUpdateListener(sync);
        mediaRef.current = null;
        remoteRef.current = null;
        if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
        loadTimerRef.current = null;
        loadingRef.current = null;
      };
      setAvailable(true);
      if (context.getCurrentSession()) begin(true);
    });

    return () => {
      cancelled = true;
      detach?.();
      setAvailable(false);
      setCasting(false);
    };
  }, [enabled, receiverAppId, autoJoinPolicy, sync, watchMedia]);

  // The TV loads the stream once the browser has it (its DRM token and position): when casting starts, and when the
  // end screen (or the app) picks another stream while casting.
  useEffect(() => {
    if (!casting || !ready) return;
    const playingId = remoteRef.current?.context.getCurrentSession()?.getMediaSession()?.media?.contentId;
    if (playingId !== streamId) void load();
  }, [casting, ready, streamId, load]);

  const toggle = useCallback(() => {
    const context = remoteRef.current?.context;
    if (!context) return;
    if (context.getCurrentSession()) context.endCurrentSession(true);
    // Rejected when the viewer closes the picker: nothing to do.
    else context.requestSession().catch(() => {});
  }, []);

  const play = useCallback(() => {
    const remote = remoteRef.current;
    if (remote?.player.isPaused) remote.controller.playOrPause();
  }, []);
  const pause = useCallback(() => {
    const remote = remoteRef.current;
    if (remote && !remote.player.isPaused) remote.controller.playOrPause();
  }, []);
  const seek = useCallback((seconds: number) => {
    const remote = remoteRef.current;
    if (!remote) return;
    const target = Math.max(0, seconds);
    remote.player.currentTime = target;
    remote.controller.seek();
    setCurrentTime(target);
  }, []);
  const seekBy = useCallback((delta: number) => {
    const remote = remoteRef.current;
    if (!remote?.player.isMediaLoaded) return null;
    const target = seekTarget(remote.player.currentTime, delta, remote.player.duration);
    seek(target);
    return target;
  }, [seek]);
  const setVolume = useCallback((v: number) => {
    const remote = remoteRef.current;
    if (!remote) return;
    remote.player.volumeLevel = Math.max(0, Math.min(1, v));
    remote.controller.setVolumeLevel();
    if (remote.player.isMuted) remote.controller.muteOrUnmute();
  }, []);
  const setMuted = useCallback((m: boolean) => {
    const remote = remoteRef.current;
    if (remote && remote.player.isMuted !== m) remote.controller.muteOrUnmute();
  }, []);

  const selectTextTrack = useCallback((track: ShakaTextTrack) => {
    lastTextRef.current = track.id;
    editTracks(withActiveTrack(tracks, activeIds, "TEXT", track.id));
  }, [tracks, activeIds, editTracks]);
  const disableCaptions = useCallback(() => {
    editTracks(withActiveTrack(tracks, activeIds, "TEXT", null));
  }, [tracks, activeIds, editTracks]);
  const selectAudio = useCallback((option: AudioOption) => {
    editTracks(withActiveTrack(tracks, activeIds, "AUDIO", Number(option.id)));
  }, [tracks, activeIds, editTracks]);

  const text = castTextTracks(tracks, activeIds);
  const audio = castAudioOptions(tracks, activeIds);

  const toggleCaptions = useCallback(() => {
    if (text.active) {
      disableCaptions();
      return;
    }
    const track = text.tracks.find((t) => t.id === lastTextRef.current) ?? text.tracks[0];
    if (track) selectTextTrack(track);
  }, [text.active, text.tracks, disableCaptions, selectTextTrack]);

  return {
    available,
    casting,
    deviceName,
    playing,
    currentTime,
    duration,
    volume,
    muted,
    textTracks: text.tracks,
    activeTextTrack: text.active,
    audioOptions: audio.options,
    activeAudio: audio.active,
    toggle,
    play,
    pause,
    seek,
    seekBy,
    setVolume,
    setMuted,
    selectTextTrack,
    disableCaptions,
    toggleCaptions,
    selectAudio,
  };
}
