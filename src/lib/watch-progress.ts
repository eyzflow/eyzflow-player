import { API_ORIGIN } from "./api";

/** One save of a film's watch progress. */
export type WatchProgress = {
  /** The catalogue entry (film or episode) played. */
  catalogueId: string;
  /** Where the viewer is, in whole seconds. */
  progressSeconds: number;
  /** The viewer watched it to the end, or past the config's `watchProgress.completedPercent` (default 95 %). */
  completed: boolean;
  /** The offer played, when the app passed one. */
  offerId?: string;
};

/**
 * Where a film's watch progress goes: the EYZFlow watch history by default, or the app's own store. The web
 * counterpart of `WatchProgressStore` in the iOS and Flutter players. `final` is the last save of a closing page: send it with
 * `keepalive` (or `navigator.sendBeacon`) so it still goes out.
 */
export type WatchProgressStore = {
  save(progress: WatchProgress, opts: { final: boolean }): Promise<void> | void;
};

/** Who the EYZFlow watch history saves for: the viewer and their storefront. */
export type EYZFlowWatchHistoryTarget = {
  storefrontId: string;
  /** The viewer's `Authorization` value, e.g. "Bearer <token>". */
  authorization: string;
};

/** Saves to the EYZFlow watch history: `PUT /v1/content/storefront/{storefrontId}/watch-history`. */
export function eyzflowWatchHistoryStore(target: EYZFlowWatchHistoryTarget): WatchProgressStore {
  return {
    async save(progress, { final }) {
      const res = await fetch(`${API_ORIGIN}/v1/content/storefront/${encodeURIComponent(target.storefrontId)}/watch-history`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: target.authorization },
        body: JSON.stringify({
          catalogue_id: progress.catalogueId,
          progress_seconds: progress.progressSeconds,
          completed: progress.completed,
          ...(progress.offerId ? { offer_id: progress.offerId } : {}),
        }),
        // The last save of a closing page still goes out.
        keepalive: final,
        credentials: "omit",
      });
      if (!res.ok) throw new Error(`Watch progress was not saved (${res.status}).`);
    },
  };
}

/** How often a playing film saves, at most, in seconds. The iOS and Flutter players use the same. */
export const WATCH_PROGRESS_INTERVAL_SECONDS = 10;
/** From this share of the film on (in percent), it counts as watched, unless the player config says otherwise. */
export const DEFAULT_COMPLETED_PERCENT = 95;

/**
 * The config's `watchProgress.completedPercent` as a share of the film: 50–100 %, else the default. 100 means only the
 * end itself.
 */
export function completedRatio(percent: unknown): number {
  const p = typeof percent === "number" && Number.isFinite(percent) ? percent : DEFAULT_COMPLETED_PERCENT;
  return Math.min(100, Math.max(50, p)) / 100;
}
/** How close to the start position playback must be before anything is saved, in seconds. */
const START_TOLERANCE_SECONDS = 2;

export type WatchProgressRecorderOptions = {
  catalogueId: string;
  offerId?: string;
  /** Read at each save, so the app can swap its store without restarting the recorder. */
  store: () => WatchProgressStore | null;
  /** Where playback starts (the resume point). Nothing is saved until playback gets there or the viewer seeks. */
  startTime?: number;
  intervalSeconds?: number;
  /** From this share of the film on (0.5–1), it counts as watched. Read at each save. Missing: 0.95. */
  completedRatio?: () => number;
  log?: (message: string, error: unknown) => void;
};

/**
 * Saves a film's position to a `WatchProgressStore`: at most every 10 s while it plays, at once on a pause or a seek,
 * when the page is hidden and when playback stops, and as completed at the end. Saves run one after another, so a
 * completion never lands before an earlier position. A failed save is logged and never reaches playback.
 *
 * Positions from before the resume point are ignored: they come from the moment before the player got there, and
 * saving them would overwrite the viewer's place with 0.
 */
export class WatchProgressRecorder {
  private readonly opts: WatchProgressRecorderOptions;
  private armed: boolean;
  private latest = 0;
  private duration = 0;
  private lastSaved: { seconds: number; completed: boolean } | null = null;
  private lastSavedAt: number | null = null;
  private finished = false;
  private stopped = false;
  private chain: Promise<void> = Promise.resolve();
  private generation = 0;
  private readonly onHidden = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") this.checkpoint(this.latest, true);
  };
  private readonly onPageHide = () => this.stop();

  constructor(opts: WatchProgressRecorderOptions) {
    this.opts = opts;
    this.armed = false;
    this.reload();
  }

  start(): void {
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onHidden);
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.onPageHide);
  }

  /** The position while playing; saved when the interval has passed since the last save. */
  report(position: number, duration: number): void {
    if (!this.track(position, duration)) return;
    const interval = this.opts.intervalSeconds ?? WATCH_PROGRESS_INTERVAL_SECONDS;
    if (this.lastSavedAt !== null && Math.abs(position - this.lastSavedAt) < interval) return;
    this.save(false);
  }

  /** Saves the position now: a pause, a seek or the page being hidden. */
  checkpoint(position: number, final = false): void {
    if (!this.track(position, this.duration)) return;
    this.save(final);
  }

  /**
   * The stream loads again (e.g. a new token): it starts over from `startTime`, so positions before it are ignored
   * again until playback gets there.
   */
  reload(): void {
    const start = this.opts.startTime;
    this.armed = !(start && start > START_TOLERANCE_SECONDS);
  }

  /** The viewer moved to `position` themselves: from now on positions are theirs, wherever the start was. */
  seeked(position: number): void {
    this.armed = true;
    this.checkpoint(position);
  }

  /** The film played to its end: saved as completed, once. Later positions are ignored. */
  finish(): void {
    if (this.stopped || this.finished) return;
    this.armed = true;
    this.finished = true;
    if (this.duration > 0) this.latest = this.duration;
    this.enqueue({ seconds: Math.floor(this.latest), completed: true }, false);
  }

  /** Saves the last position and stops. Safe to call more than once. */
  stop(): void {
    if (this.stopped) return;
    if (!this.finished && this.armed && this.latest > 0) this.save(true);
    this.stopped = true;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onHidden);
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.onPageHide);
  }

  /** Resolves once every save so far has finished. */
  idle(): Promise<void> {
    return this.chain;
  }

  private track(position: number, duration: number): boolean {
    if (this.stopped || this.finished || !Number.isFinite(position)) return false;
    if (Number.isFinite(duration) && duration > 0) this.duration = duration;
    if (!this.armed) {
      if (position < (this.opts.startTime ?? 0) - START_TOLERANCE_SECONDS) return false;
      this.armed = true;
    }
    this.latest = position;
    return true;
  }

  private save(final: boolean): void {
    const ratio = this.opts.completedRatio?.() ?? completedRatio(undefined);
    const completed = this.duration > 0 && (ratio >= 1 ? this.latest >= this.duration - 0.5 : this.latest >= this.duration * ratio);
    this.enqueue({ seconds: Math.floor(this.latest), completed }, final);
  }

  private enqueue(entry: { seconds: number; completed: boolean }, final: boolean): void {
    const last = this.lastSaved;
    // Opening a film and leaving at once doesn't put it in "Continue watching".
    if (!last && entry.seconds === 0 && !entry.completed) return;
    this.lastSavedAt = this.latest;
    if (last && last.seconds === entry.seconds && last.completed === entry.completed) return;
    this.lastSaved = entry;
    const progress: WatchProgress = {
      catalogueId: this.opts.catalogueId,
      progressSeconds: entry.seconds,
      completed: entry.completed,
      ...(this.opts.offerId ? { offerId: this.opts.offerId } : {}),
    };
    // A final save replaces the saves still waiting: their positions are older, and a closing page can't wait for them.
    if (final) this.generation++;
    const generation = this.generation;
    const run = async () => {
      if (generation !== this.generation) return;
      const store = this.opts.store();
      if (!store) return;
      try {
        await store.save(progress, { final });
      } catch (e) {
        (this.opts.log ?? defaultLog)("[EYZFlow Player] watch progress not saved", e);
      }
    };
    // A final save goes out at once; only a save already on its way can still land after it.
    this.chain = final ? Promise.all([this.chain, run()]).then(() => {}) : this.chain.then(run);
  }
}

function defaultLog(message: string, error: unknown): void {
  console.warn(message, error);
}
