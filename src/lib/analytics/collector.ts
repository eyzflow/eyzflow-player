import type { BeatError, BeatMetrics, PlaybackState } from "./types";

/** What the collector reads from the video element (an HTMLVideoElement, or a stand-in in tests). */
export type MediaLike = EventTarget & {
  currentTime: number;
  duration: number;
  paused: boolean;
  getVideoPlaybackQuality?: () => { droppedVideoFrames: number };
};

/** What the collector reads from Shaka. */
export type PlayerLike = {
  addEventListener: (event: string, fn: (e: Event) => void) => void;
  removeEventListener: (event: string, fn: (e: Event) => void) => void;
  getVariantTracks?: () => Array<{ active: boolean; bandwidth: number }>;
};

const MAX_ERRORS = 20;

/**
 * Watches one impression (one video loaded in the player) and keeps its quality counters: how long it took to start,
 * how long it played, paused and stalled, how often it stalled and was sought, which bitrates it played, and its errors.
 * A small state machine; time is added to the state being left. Plain class, no React, so it can be tested without a
 * browser.
 */
export class AnalyticsCollector {
  private state: PlaybackState = "startup";
  private since = 0;
  private createdAt = 0;
  private startRef = 0;
  private ready = false;
  private everPlayed = false;
  private readonly m: BeatMetrics = {
    player_startup_ms: null,
    video_startup_ms: null,
    played_ms: 0,
    paused_ms: 0,
    rebuffer_ms: 0,
    rebuffer_count: 0,
    seek_count: 0,
    avg_bitrate: null,
    min_bitrate: null,
    max_bitrate: null,
    quality_switches: 0,
    dropped_frames: 0,
    max_position_s: 0,
    duration_s: null,
  };
  private bitrate: number | null = null;
  private bitrateWeighted = 0;
  private bitrateTime = 0;
  private errorCount = 0;
  private pending: BeatError[] = [];
  private readonly listeners: Array<[EventTarget | PlayerLike, string, (e: Event) => void]> = [];
  /** Called on the first frame and on errors, so the transport sends a beat at once. */
  onMilestone: (() => void) | null = null;

  private readonly video: MediaLike;
  private readonly player: PlayerLike | null;
  private readonly opts: { autoplay: boolean; now?: () => number };

  constructor(video: MediaLike, player: PlayerLike | null, opts: { autoplay: boolean; now?: () => number }) {
    this.video = video;
    this.player = player;
    this.opts = opts;
    this.createdAt = this.now();
    this.since = this.createdAt;
    this.startRef = this.createdAt;
    this.on(video, "play", () => this.onPlay());
    this.on(video, "playing", () => this.onPlaying());
    this.on(video, "waiting", () => this.onWaiting());
    this.on(video, "pause", () => this.onPause());
    this.on(video, "seeking", () => this.onSeeking());
    this.on(video, "seeked", () => this.onSeeked());
    this.on(video, "ended", () => this.enter("ended"));
    this.on(video, "timeupdate", () => this.onTime());
    this.on(video, "durationchange", () => this.onTime());
    if (player) {
      this.on(player, "buffering", (e) => this.onBuffering((e as CustomEvent<{ buffering?: boolean }>).detail?.buffering ?? (e as Event & { buffering?: boolean }).buffering));
      this.on(player, "adaptation", () => this.onVariant(true));
      this.on(player, "variantchanged", () => this.onVariant(true));
      this.on(player, "trackschanged", () => this.onVariant(false));
    }
  }

  /** The video loaded and can play: the player's own startup is over. */
  markReady(): void {
    if (this.ready) return;
    this.ready = true;
    this.m.player_startup_ms = Math.round(this.now() - this.createdAt);
    this.onVariant(false);
    this.onTime();
  }

  /** An error the viewer met. Kept once per impression up to 20; a fatal one ends the impression. */
  recordError(error: { code: string | number; category?: string | number | null; message?: string | null; fatal?: boolean }): void {
    if (this.errorCount < MAX_ERRORS) {
      this.pending.push({
        n: this.errorCount,
        code: String(error.code).slice(0, 64),
        category: error.category == null ? null : String(error.category).slice(0, 32),
        message: error.message ? error.message.slice(0, 300) : null,
        position_s: Number.isFinite(this.video.currentTime) ? this.video.currentTime : null,
      });
    }
    this.errorCount += 1;
    if (error.fatal !== false) this.enter("error");
    this.onMilestone?.();
  }

  get currentState(): PlaybackState {
    return this.state;
  }

  /** The counters so far, the time in the current state included. */
  metrics(): BeatMetrics {
    const now = this.now();
    const out = { ...this.m };
    const open = now - this.since;
    if (this.state === "playing") out.played_ms += open;
    else if (this.state === "paused") out.paused_ms += open;
    else if (this.state === "buffering") out.rebuffer_ms += open;
    const weighted = this.bitrateWeighted + (this.state === "playing" && this.bitrate ? this.bitrate * open : 0);
    const time = this.bitrateTime + (this.state === "playing" && this.bitrate ? open : 0);
    out.avg_bitrate = time > 0 ? Math.round(weighted / time) : this.bitrate;
    out.played_ms = Math.round(out.played_ms);
    out.paused_ms = Math.round(out.paused_ms);
    out.rebuffer_ms = Math.round(out.rebuffer_ms);
    const quality = this.video.getVideoPlaybackQuality?.();
    if (quality) out.dropped_frames = quality.droppedVideoFrames;
    return out;
  }

  /** The errors not yet sent, once. */
  takeErrors(): BeatError[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  /** Errors that could not be sent go back to be sent with the next beat. */
  returnErrors(errors: BeatError[]): void {
    this.pending = [...errors, ...this.pending].slice(0, MAX_ERRORS);
  }

  destroy(): void {
    for (const [target, event, fn] of this.listeners) target.removeEventListener(event, fn);
    this.listeners.length = 0;
  }

  // --- events ---------------------------------------------------------------------------------------------------------

  private onPlay(): void {
    // Without autoplay, startup time counts from the viewer pressing play.
    if (!this.everPlayed && !this.opts.autoplay) this.startRef = this.now();
  }

  private onPlaying(): void {
    if (!this.everPlayed) {
      this.everPlayed = true;
      this.m.video_startup_ms = Math.max(0, Math.round(this.now() - this.startRef));
      this.enter("playing");
      this.onMilestone?.();
      return;
    }
    if (this.state !== "seeking") this.enter("playing");
  }

  private onWaiting(): void {
    if (this.everPlayed && this.state === "playing") this.startStall();
  }

  private onBuffering(buffering: boolean | undefined): void {
    if (buffering === true && this.everPlayed && this.state === "playing") this.startStall();
    else if (buffering === false && this.state === "buffering") this.enter(this.video.paused ? "paused" : "playing");
  }

  private startStall(): void {
    this.m.rebuffer_count += 1;
    this.enter("buffering");
  }

  private onPause(): void {
    if (this.state === "ended" || this.state === "error" || this.state === "seeking") return;
    if (this.everPlayed) this.enter("paused");
  }

  private onSeeking(): void {
    if (!this.everPlayed || this.state === "ended") return;
    this.m.seek_count += 1;
    this.enter("seeking");
  }

  private onSeeked(): void {
    if (this.state === "seeking") this.enter(this.video.paused ? "paused" : "playing");
  }

  private onTime(): void {
    const position = this.video.currentTime;
    if (Number.isFinite(position) && position > this.m.max_position_s) this.m.max_position_s = position;
    const duration = this.video.duration;
    this.m.duration_s = Number.isFinite(duration) && duration > 0 ? duration : null;
  }

  private onVariant(switched: boolean): void {
    const active = this.player?.getVariantTracks?.().find((track) => track.active);
    const bitrate = active?.bandwidth && active.bandwidth > 0 ? active.bandwidth : null;
    if (bitrate === null || bitrate === this.bitrate) return;
    this.flushBitrate();
    if (switched && this.bitrate !== null) this.m.quality_switches += 1;
    this.bitrate = bitrate;
    this.m.min_bitrate = this.m.min_bitrate === null ? bitrate : Math.min(this.m.min_bitrate, bitrate);
    this.m.max_bitrate = this.m.max_bitrate === null ? bitrate : Math.max(this.m.max_bitrate, bitrate);
  }

  // --- state ----------------------------------------------------------------------------------------------------------

  private enter(next: PlaybackState): void {
    if (next === this.state) return;
    const now = this.now();
    const spent = now - this.since;
    if (this.state === "playing") {
      this.m.played_ms += spent;
      if (this.bitrate) {
        this.bitrateWeighted += this.bitrate * spent;
        this.bitrateTime += spent;
      }
    } else if (this.state === "paused") this.m.paused_ms += spent;
    else if (this.state === "buffering") this.m.rebuffer_ms += spent;
    this.state = next;
    this.since = now;
  }

  /** Counts the time played at the old bitrate before it changes. */
  private flushBitrate(): void {
    if (this.state !== "playing") return;
    const now = this.now();
    const spent = now - this.since;
    this.m.played_ms += spent;
    if (this.bitrate) {
      this.bitrateWeighted += this.bitrate * spent;
      this.bitrateTime += spent;
    }
    this.since = now;
  }

  private on(target: EventTarget | PlayerLike, event: string, fn: (e: Event) => void): void {
    target.addEventListener(event, fn);
    this.listeners.push([target, event, fn]);
  }

  private now(): number {
    return this.opts.now ? this.opts.now() : performance.now();
  }
}
