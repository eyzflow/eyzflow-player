import { API_ORIGIN } from "./api";

/** The longest report the backend takes, in seconds. */
export const MAX_REPORT_SECONDS = 120;
/** How often a playing film reports, in seconds. */
export const USAGE_INTERVAL_SECONDS = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a usage report counts against: the viewer, their storefront and the offer played. */
export type UsageTarget = {
  storefrontId: string;
  /** The viewer's `Authorization` value, e.g. "Bearer <token>". */
  authorization: string;
  /** The offer (film or episode) played. */
  offerId: string;
  /** The catalogue entry played; left out when it is not a UUID. */
  catalogueId?: string | null;
};

/** One report, as the backend takes it: the seconds watched since the previous report of this session. */
export type PlaybackEventBody = {
  offer_id: string;
  catalogue_id?: string;
  session_id: string;
  watched_seconds: number;
  is_trailer: false;
};

/** "ok": counted. "retry": not counted yet, send the seconds again later. "drop": refused, sending again won't help. */
export type UsageSendResult = "ok" | "retry" | "drop";
export type UsageSender = (target: UsageTarget, body: PlaybackEventBody, opts: { final: boolean }) => Promise<UsageSendResult>;

export const defaultUsageSender: UsageSender = async (target, body, { final }) => {
  try {
    const res = await fetch(`${API_ORIGIN}/v1/content/storefront/${encodeURIComponent(target.storefrontId)}/playback-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: target.authorization },
      body: JSON.stringify(body),
      // The last report of a closing page still goes out.
      keepalive: final,
      credentials: "omit",
    });
    if (res.ok) return "ok";
    // A bad body, a signed-out viewer or an unknown offer: the same report would be refused again.
    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) return "drop";
    return "retry";
  } catch {
    return "retry";
  }
};

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export type UsageReporterOptions = {
  /** The content's played time so far, in milliseconds (ads, pauses, seeks and stalls not included). */
  playedMs: () => number;
  target: UsageTarget;
  /** Reports at once when it pauses or ends. */
  media?: EventTarget;
  intervalSeconds?: number;
  send?: UsageSender;
  sessionId?: string;
};

/**
 * Reports the seconds of a film the viewer watched, for licensor royalties: every 30 s while it plays, at once on a
 * pause, at the end and when the page is hidden, and a last time when playback stops. Each report carries the seconds
 * since the previous one (at most 120) and one session id for the whole playback. Seconds a report could not deliver
 * go with the next one. Never throws: royalty reporting must not affect playback.
 */
export class UsageReporter {
  readonly sessionId: string;
  /** Played milliseconds already moved into `pendingMs`. */
  private takenMs = 0;
  /** Milliseconds not reported yet. */
  private pendingMs = 0;
  private inFlight = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private readonly opts: UsageReporterOptions;
  private readonly onPause = () => void this.flush(false);
  private readonly onHidden = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") void this.flush(false);
  };
  private readonly onPageHide = () => this.stop();

  constructor(opts: UsageReporterOptions) {
    this.opts = opts;
    this.sessionId = opts.sessionId ?? newSessionId();
  }

  start(): void {
    if (this.timer || this.stopped) return;
    this.timer = setInterval(() => void this.flush(false), (this.opts.intervalSeconds ?? USAGE_INTERVAL_SECONDS) * 1000);
    this.opts.media?.addEventListener("pause", this.onPause);
    this.opts.media?.addEventListener("ended", this.onPause);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onHidden);
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.onPageHide);
  }

  /** Sends the last report and stops. Safe to call more than once. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.opts.media?.removeEventListener("pause", this.onPause);
    this.opts.media?.removeEventListener("ended", this.onPause);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onHidden);
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.onPageHide);
    void this.flush(true, true);
  }

  async flush(final: boolean, force = false): Promise<void> {
    if (this.stopped && !force) return;
    let played: number;
    try {
      played = this.opts.playedMs();
    } catch {
      return;
    }
    if (played > this.takenMs) {
      this.pendingMs += played - this.takenMs;
      this.takenMs = played;
    }
    // One report at a time, so a slow one can't be overtaken; the last one goes out regardless.
    if (this.inFlight && !final) return;
    const seconds = Math.min(Math.floor(this.pendingMs / 1000), MAX_REPORT_SECONDS);
    if (seconds < 1) return;
    this.pendingMs -= seconds * 1000;

    const { target } = this.opts;
    const body: PlaybackEventBody = {
      offer_id: target.offerId,
      ...(target.catalogueId && UUID.test(target.catalogueId) ? { catalogue_id: target.catalogueId } : {}),
      session_id: this.sessionId,
      watched_seconds: seconds,
      is_trailer: false,
    };
    this.inFlight = true;
    let result: UsageSendResult;
    try {
      result = await (this.opts.send ?? defaultUsageSender)(target, body, { final });
    } catch {
      result = "retry";
    } finally {
      this.inFlight = false;
    }
    if (result === "retry") this.pendingMs += seconds * 1000;
  }
}
