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
import { SHAKA_AD_EVENTS, type ShakaAd, type ShakaAdManager, type ShakaError, type ShakaPlayerApi, type ShakaTrack, type ShakaTextTrack } from "./shaka-types";
import { loadIma } from "./ima-loader";
import { AdBreakSchedule } from "./ad-breaks";
import { SignalSchedule, type SignalRegionLike, type StreamSignal } from "./stream-signals";
import { withTargeting } from "./ad-tag";
import { CuePointSchedule, countdownLength, countdownSeconds, type CuePointLike } from "./ad-countdown";
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
  /**
   * A VAST/VMAP ad tag to play through Google IMA (client-side). Only pass it when the config's `features.ads` is on.
   * Ads that cannot load (blocked, empty, timed out) are skipped and the content plays.
   */
  adTagUrl?: string;
  /** Count down the last 5 s before a mid-roll ("Ad in 5"): the config's `features.adCountdown`. Default on. */
  adCountdown?: boolean;
  /** How many seconds the countdown shows: the config's `ads.countdownSeconds` (1–30). Default 5. */
  adCountdownSeconds?: number;
  /** The player key check refused this site or key. */
  onLicenseError?: (error: PlayerLicenseError) => void;
  /** Playback entered an intro, recap or credits signal (or left one: null). */
  onSignal?: (signal: StreamSignal | null) => void;
  onReady?: () => void;
  onError?: (msg: string) => void;
  /** A plan's stream or device limit was reached, or the viewer was signed out on this device. */
  onLimitReached?: (limit: PlaybackLimitError) => void;
};

export type UseShakaReturn = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** The element IMA draws ads and their UI in: placed over the video, below the player's own overlays. */
  adContainerRef: React.RefObject<HTMLDivElement | null>;
  /** A linear ad is playing: the content is paused and its controls should be hidden. */
  adPlaying: boolean;
  /** Seconds (the countdown's length … 1) until a mid-roll starts, while the notice should show; otherwise null. */
  adCountdown: number | null;
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
  /** The intro, recap or credits signal playback is in, if any. */
  activeSignal: StreamSignal | null;
  /** Jumps to the end of the active signal. */
  skipSignal: () => void;
  /** The film played to its end (until it plays or seeks again). */
  ended: boolean;
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
  const { streamId, isProtected, drmAuthorizationKey, drmParameters, deviceName, autoPlay, muted: initMuted, loop, onReady, onError, onLimitReached, playerKey, configId, analytics = true, cmcd = false, adTagUrl, adCountdown: adCountdownOn = true, adCountdownSeconds, onLicenseError, onSignal } = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const adContainerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<ShakaPlayerApi | null>(null);
  // The previous player's teardown: a new stream on the same <video> waits for it, or the two players overlap and the
  // new load never starts.
  const destroyingRef = useRef<Promise<unknown> | null>(null);
  const [adPlaying, setAdPlaying] = useState(false);
  // Read by play/seek and the autoplay kick, which must not touch the content while an ad plays over it.
  const adPlayingRef = useRef(false);
  const [adCountdown, setAdCountdown] = useState<number | null>(null);
  // Read while playing, so switching it doesn't reload the stream.
  const adCountdownOnRef = useRef(adCountdownOn);
  const adCountdownLengthRef = useRef(countdownLength(adCountdownSeconds));
  useEffect(() => {
    adCountdownOnRef.current = adCountdownOn;
    adCountdownLengthRef.current = countdownLength(adCountdownSeconds);
  }, [adCountdownOn, adCountdownSeconds]);

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
  const [activeSignal, setActiveSignal] = useState<StreamSignal | null>(null);
  const [ended, setEnded] = useState(false);
  // Compared on each time update, so the state (and onSignal) only changes when playback enters or leaves a signal.
  const activeSignalRef = useRef<StreamSignal | null>(null);

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
  const onSignalRef = useRef(onSignal);
  const configIdRef = useRef(configId);
  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
    onLimitReachedRef.current = onLimitReached;
    onLicenseErrorRef.current = onLicenseError;
    onSignalRef.current = onSignal;
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
    adPlayingRef.current = false;
    setAdPlaying(false);
    setAdCountdown(null);
    activeSignalRef.current = null;
    setActiveSignal(null);
    setEnded(false);

    // Client-side ads through Shaka's ad manager and IMA. The SDK starts loading now, alongside the licence and
    // manifest, so a pre-roll is usually ready by the time the content is.
    const imaReady = adTagUrl ? loadIma().catch(() => null) : null;
    let adManager: ShakaAdManager | null = null;
    // A storefront viewer's playback session says whether their plan plays ads (false: none at all) and how to
    // target them. Without a session, the player config decides.
    let planAds: boolean | null = null;
    let adTargeting: Record<string, string> = {};
    const adsOn = () => !!adTagUrl && planAds !== false;
    // A VMAP's mid-roll cue points (streams without markers), for the countdown before them.
    const cuePoints = new CuePointSchedule();
    const onCuePoints = (e: Event) => {
      cuePoints.set((e as Event & { cuepoints?: CuePointLike[] }).cuepoints ?? []);
    };
    // The ad breaks marked on the stream (SCTE-35 events in the MPD). With any, ads play only at them.
    const adBreaks = new AdBreakSchedule();
    // A mid-roll holds the content at its marker until the ad starts, or until it turns out there is none.
    let heldForBreak = false;
    let breakTimer: ReturnType<typeof setTimeout> | null = null;
    let lastTime = 0;
    let seeking = false;
    const onAdStarted = (e: Event) => {
      if (cancelled) return;
      const ad = (e as Event & { ad?: ShakaAd }).ad ?? adManager?.getCurrentAd() ?? null;
      if (ad && !ad.isLinear()) return; // an overlay: the content keeps playing under it
      if (breakTimer) clearTimeout(breakTimer);
      breakTimer = null;
      adPlayingRef.current = true;
      setAdPlaying(true);
      setAdCountdown(null);
      collector?.beginAd();
    };
    const onAdStopped = () => {
      if (breakTimer) clearTimeout(breakTimer);
      breakTimer = null;
      if (cancelled || !adPlayingRef.current) return;
      adPlayingRef.current = false;
      setAdPlaying(false);
      collector?.endAd();
      if (heldForBreak) {
        heldForBreak = false;
        // Shaka resumes the content after an ad it played; after an empty or failed tag nothing does.
        if (video.paused && !video.ended) void video.play().catch(() => {});
      }
    };
    // With markers on the stream, the markers decide where ads go. A VMAP tag brings its own schedule (mid-rolls at
    // its own times, a post-roll); once the marker's break is over that schedule is dropped, so it never plays.
    let endingSchedule = false;
    const endTagSchedule = () => {
      if (!adBreaks.hasBreaks || endingSchedule) return;
      endingSchedule = true;
      // Not from inside IMA's own event dispatch.
      setTimeout(() => {
        endingSchedule = false;
        if (cancelled || adPlayingRef.current) return;
        try {
          adManager?.onAssetUnload();
        } catch {
          // Nothing left to release.
        }
      }, 0);
    };
    const onBreakOver = () => {
      onAdStopped();
      endTagSchedule();
    };
    const adListeners: Array<[string, (e: Event) => void]> = [
      [SHAKA_AD_EVENTS.STARTED, onAdStarted],
      [SHAKA_AD_EVENTS.STOPPED, onBreakOver],
      [SHAKA_AD_EVENTS.ALL_COMPLETED, onBreakOver],
      [SHAKA_AD_EVENTS.ERROR, onBreakOver],
      [SHAKA_AD_EVENTS.CUEPOINTS_CHANGED, onCuePoints],
    ];
    /** IMA and Shaka's ad manager, set up once per impression; null when ads cannot play here. */
    const adsReady = async (player: ShakaPlayerApi) => {
      if (!adsOn() || !imaReady) return null;
      const ima = await imaReady;
      if (cancelled || !ima) return null;
      if (adManager) return { ima, manager: adManager };
      const container = adContainerRef.current;
      const manager = player.getAdManager?.() ?? null;
      if (!container || !manager) return null;
      manager.setContainers(container, container);
      for (const [event, fn] of adListeners) manager.addEventListener(event, fn);
      adManager = manager;
      return { ima, manager };
    };
    const sendAdRequest = (ready: NonNullable<Awaited<ReturnType<typeof adsReady>>>, willAutoPlay: boolean) => {
      const request = new ready.ima.AdsRequest();
      request.adTagUrl = withTargeting(adTagUrl!, adTargeting);
      request.linearAdSlotWidth = video.clientWidth;
      request.linearAdSlotHeight = video.clientHeight;
      request.nonLinearAdSlotWidth = video.clientWidth;
      request.nonLinearAdSlotHeight = Math.round(video.clientHeight / 3);
      request.vastLoadTimeout = 5000;
      request.setAdWillAutoPlay(willAutoPlay);
      request.setAdWillPlayMuted(video.muted);
      ready.manager.requestClientSideAds(request, null);
    };
    /**
     * At load. Without ad markers on the stream, the tag decides (a VAST pre-roll, or a VMAP schedule). With markers,
     * only a marker at the start gives a pre-roll; the others are mid-rolls, requested when playback reaches them.
     */
    const requestAds = async (player: ShakaPlayerApi) => {
      if (adBreaks.hasBreaks && !adBreaks.takePreroll()) return;
      try {
        const ready = await adsReady(player);
        if (!ready || isRemotePlayback(video)) return;
        sendAdRequest(ready, !!autoPlay);
      } catch {
        // A broken tag or SDK: play the content without ads, no error for the viewer.
        onAdStopped();
      }
    };
    const playBreak = async (player: ShakaPlayerApi) => {
      try {
        const ready = await adsReady(player);
        if (!ready || cancelled || isRemotePlayback(video) || adPlayingRef.current) return;
        heldForBreak = true;
        adPlayingRef.current = true;
        setAdPlaying(true);
        collector?.beginAd();
        video.pause();
        // The content already played: start the ad as soon as it loads instead of waiting for a play event.
        player.configure({ ads: { skipPlayDetection: true } });
        // IMA gives up on a VAST after 5 s and reports it; this only guards against it never answering.
        breakTimer = setTimeout(onBreakOver, 12_000);
        sendAdRequest(ready, true);
      } catch {
        onAdStopped();
      }
    };
    // The intro, recap and credits marked on the stream (eyzflow signal events in the MPD).
    const signals = new SignalSchedule();
    const updateSignal = () => {
      if (cancelled) return;
      const next = signals.size ? signals.at(video.currentTime) : null;
      if (next?.id === activeSignalRef.current?.id) return;
      activeSignalRef.current = next;
      setActiveSignal(next);
      onSignalRef.current?.(next);
    };
    const onRegionAdded = (e: Event) => {
      const region = (e as CustomEvent<SignalRegionLike>).detail;
      if (!region) return;
      if (!adBreaks.addRegion(region) && signals.addRegion(region)) updateSignal();
    };
    const checkAdBreak = () => {
      const now = video.currentTime;
      const previous = lastTime;
      lastTime = now;
      const player = playerRef.current;
      if (!adsOn() || seeking || adPlayingRef.current || video.paused || !player) return;
      cuePoints.pass(previous, now);
      if (adBreaks.due(previous, now)) void playBreak(player);
    };
    /** The notice before a mid-roll: markers on the stream, else a VMAP's cue points. Hidden while paused or seeking. */
    const updateCountdown = () => {
      if (cancelled) return;
      let left: number | null = null;
      if (adCountdownOnRef.current && adsOn() && !adPlayingRef.current && !seeking && !video.paused && !isRemotePlayback(video)) {
        left = countdownSeconds(
          video.currentTime,
          adBreaks.hasBreaks ? adBreaks.upcomingStarts() : cuePoints.upcoming(),
          adCountdownLengthRef.current,
        );
      }
      setAdCountdown(left);
    };
    const onSeeking = () => {
      seeking = true;
      if (!cancelled) setEnded(false);
      updateCountdown();
    };
    const onSeeked = () => {
      seeking = false;
      lastTime = video.currentTime;
      updateSignal();
    };
    const endAds = () => {
      if (breakTimer) clearTimeout(breakTimer);
      breakTimer = null;
      if (adManager) for (const [event, fn] of adListeners) adManager.removeEventListener(event, fn);
      adManager = null;
    };

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
      checkAdBreak();
      updateCountdown();
      updateSignal();
    };
    const onAddTrack = () => { if (!cancelled) bindCueTrack(); };
    const onDuration = () => {
      if (!cancelled && Number.isFinite(video.duration)) setDuration(video.duration);
    };
    const onPlay = () => {
      if (cancelled) return;
      setPlaying(true);
      setEnded(false);
      updateCountdown();
    };
    const onPause = () => {
      if (cancelled) return;
      setPlaying(false);
      updateCountdown();
    };
    const onEnded = () => {
      if (!cancelled) setEnded(true);
    };
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
    video.addEventListener("ended", onEnded);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);
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

      await destroyingRef.current?.catch(() => {});
      if (cancelled) return;
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
      // Shaka reports the manifest's events while loading it, before load() resolves.
      player.addEventListener("timelineregionadded", onRegionAdded);

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

      // A storefront viewer (signed in, with a storefront): the playback session counts this stream against the
      // plan's limits and says whether the plan plays ads. Opened for clear streams too, for the ads answer.
      const storefrontId = drmParameters?.storefront_id;
      const deviceId = drmAuthorizationKey ? getDeviceId() : null;
      const parameters: Record<string, unknown> = { ...drmParameters, device_id: deviceId };
      if (drmAuthorizationKey) {
        if (typeof storefrontId === "string" && storefrontId) {
          const target = { storefrontId, authorization: drmAuthorizationKey, deviceId: deviceId! };
          try {
            const opened = await openPlaybackSession({ ...target, streamId, deviceName });
            if (cancelled) {
              if (opened.id) closePlaybackSession(target, opened.id);
              return;
            }
            planAds = opened.ads;
            adTargeting = opened.adTargeting;
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
            // Any other failure leaves the limits to the licence request, which counts this stream itself; ads follow
            // the player config.
          }
        }
        if (isProtected) {
          configureDrm(player, shaka, streamId, drmAuthorizationKey, () =>
            license ? { ...parameters, player_token: license.token } : parameters,
          );
        }
      }

      try {
        await player.load(streamManifestUrl(streamId));
        if (cancelled) return;
        setState("ready");
        setErrorMsg(null);
        collector?.markReady();
        refreshTracks();
        onReadyRef.current?.();
        // Before the first play: Shaka starts the ad manager on the content's play event, so a pre-roll comes first.
        await requestAds(player);
        if (cancelled) return;
        if (autoPlay) {
          const kick = () => {
            if (!adPlayingRef.current) void video.play().catch(() => {});
          };
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
      endAds();
      endAnalytics();
      license?.stop();
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDuration);
      video.removeEventListener("loadedmetadata", onDuration);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);
      video.textTracks.removeEventListener("addtrack", onAddTrack);
      unbindCueTrack();
      const p = playerRef.current;
      playerRef.current = null;
      if (p) destroyingRef.current = p.destroy();
    };
  }, [streamId, isProtected, drmAuthorizationKey, drmParameters, deviceName, autoPlay, playerKey, analytics, cmcd, adTagUrl, fail, failLimit, failLicense, refreshTracks, bindCueTrack, unbindCueTrack]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.loop = loop ?? false;
  }, [loop]);

  // While an ad plays, the content stays where the ad manager put it.
  const play = useCallback(() => {
    if (!adPlayingRef.current) void videoRef.current?.play().catch(() => {});
  }, []);
  const pause = useCallback(() => videoRef.current?.pause(), []);
  const skipSignal = useCallback(() => {
    const video = videoRef.current;
    const signal = activeSignalRef.current;
    if (!video || !signal || adPlayingRef.current) return;
    // A span that runs to the end of the film ends it.
    video.currentTime = Number.isFinite(video.duration) ? Math.min(signal.end, video.duration) : signal.end;
  }, []);
  const seek = useCallback((s: number) => {
    if (videoRef.current && !adPlayingRef.current) videoRef.current.currentTime = Math.max(0, s);
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
    adContainerRef,
    adPlaying,
    adCountdown,
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
    activeSignal,
    skipSignal,
    ended,
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

/** The video plays on another device (AirPlay, Remote Playback or a Cast session): no ads are requested then. */
function isRemotePlayback(video: HTMLVideoElement): boolean {
  const v = video as HTMLVideoElement & { remote?: { state?: string }; webkitCurrentPlaybackTargetIsWireless?: boolean };
  if (v.remote?.state === "connected" || v.webkitCurrentPlaybackTargetIsWireless === true) return true;
  const cast = (window as { cast?: { framework?: { CastContext?: { getInstance?: () => { getCurrentSession?: () => unknown } } } } }).cast;
  try {
    return cast?.framework?.CastContext?.getInstance?.()?.getCurrentSession?.() != null;
  } catch {
    return false;
  }
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
