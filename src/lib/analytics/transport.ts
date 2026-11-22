import { API_ORIGIN, PLAYER_VERSION } from "../api";
import type { AnalyticsCollector } from "./collector";
import type { Beat } from "./types";

/** The path avoids the word "analytics", which content blockers stop. */
export const BEAT_URL = `${API_ORIGIN}/v1/player/beat`;

export type BeatSender = (body: string, opts: { final: boolean }) => Promise<boolean>;

/**
 * Sends a beat. text/plain keeps it a simple request (no CORS preflight); keepalive lets it finish while the page closes.
 * On the last beat of a closing page, navigator.sendBeacon first: browsers deliver it even after the page is gone.
 */
export const defaultSender: BeatSender = async (body, { final }) => {
  if (final && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      if (navigator.sendBeacon(BEAT_URL, new Blob([body], { type: "text/plain;charset=UTF-8" }))) return true;
    } catch {
      // fall through to fetch
    }
  }
  try {
    const res = await fetch(BEAT_URL, { method: "POST", body, headers: { "Content-Type": "text/plain;charset=UTF-8" }, keepalive: true, credentials: "omit" });
    return res.ok || res.status === 400 || res.status === 401 || res.status === 413;
  } catch {
    return false;
  }
};

function newImpressionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export type BeatTransportOptions = {
  getToken: () => string | null;
  streamId: string;
  intervalSeconds: number;
  isLive: () => boolean;
  autoplay: boolean;
  /** The DRM system in use ("widevine", "playready", "fairplay", "clearkey", "none"), once known. */
  drm: () => string | null;
  send?: BeatSender;
  impressionId?: string;
};

/**
 * Sends one impression's beats: on the first frame and on errors at once, then every heartbeat interval, and a last
 * one when playback stops or the page is hidden or closed. Each beat carries the counters so far and a growing sequence
 * number, so the server keeps the newest and ignores repeats.
 */
export class BeatTransport {
  readonly impressionId: string;
  private readonly startedAt = Date.now();
  private seq = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private readonly onHidden = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") void this.beat(false);
  };
  private readonly onPageHide = () => this.stop();

  private readonly collector: AnalyticsCollector;
  private readonly opts: BeatTransportOptions;

  constructor(collector: AnalyticsCollector, opts: BeatTransportOptions) {
    this.collector = collector;
    this.opts = opts;
    this.impressionId = opts.impressionId ?? newImpressionId();
    collector.onMilestone = () => void this.beat(false);
  }

  start(): void {
    if (this.timer || this.stopped) return;
    this.timer = setInterval(() => void this.beat(false), Math.max(this.opts.intervalSeconds, 10) * 1000);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onHidden);
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.onPageHide);
  }

  /** Sends the last beat and stops. Safe to call more than once. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onHidden);
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.onPageHide);
    void this.beat(true, true);
  }

  async beat(final: boolean, force = false): Promise<void> {
    if (this.stopped && !force) return;
    const token = this.opts.getToken();
    if (!token) return;
    const errors = this.collector.takeErrors();
    const beat: Beat = {
      token,
      sid: this.impressionId,
      seq: ++this.seq,
      started_at: this.startedAt,
      final,
      stream_id: this.opts.streamId,
      is_live: this.opts.isLive(),
      autoplay: this.opts.autoplay,
      drm: this.opts.drm(),
      player_version: PLAYER_VERSION,
      m: this.collector.metrics(),
      errors,
    };
    const sent = await (this.opts.send ?? defaultSender)(JSON.stringify(beat), { final });
    if (!sent && errors.length) this.collector.returnErrors(errors);
  }
}
