/**
 * The ad breaks marked on a stream in the dashboard (Stream → Signals → Ad break). The packager writes each one into
 * the MPD as a SCTE-35 splice_insert event; Shaka reports them as timeline regions, and this schedule decides when
 * one is due.
 */

/** The SCTE-35 schemes a DASH EventStream can carry. eyzflow writes the first. */
export const SCTE35_SCHEMES: ReadonlySet<string> = new Set([
  "urn:scte:scte35:2014:xml+bin",
  "urn:scte:scte35:2013:xml",
  "urn:scte:scte35:2014:bin",
]);

/** A break at or before this many seconds is a pre-roll: it plays when the viewer first presses play. */
export const PREROLL_WINDOW_S = 0.5;

/**
 * Playback moving further than this between two time updates is a seek or a jump, not playing through: breaks passed
 * that way are not played (time updates come every 0.25 s or so while playing).
 */
export const MAX_PLAY_STEP_S = 2;

export type AdBreak = {
  id: string;
  /** Position in the content, in seconds. */
  start: number;
  /** The planned length of the ad pod, when the break has one. */
  duration: number | null;
};

/** What the schedule reads from a Shaka timeline region (shaka.extern.TimelineRegionInfo). */
export type TimelineRegionLike = { schemeIdUri: string; id: string; startTime: number; endTime: number };

/** The ad break a timeline region marks, or null when it is another kind of region. */
export function adBreakFromRegion(region: TimelineRegionLike): AdBreak | null {
  if (!SCTE35_SCHEMES.has(region.schemeIdUri) || !Number.isFinite(region.startTime)) return null;
  const duration = Number.isFinite(region.endTime) && region.endTime > region.startTime ? region.endTime - region.startTime : null;
  return { id: region.id || `t${region.startTime}`, start: Math.max(0, region.startTime), duration };
}

/** The stream's ad breaks, each played at most once per impression. */
export class AdBreakSchedule {
  private readonly breaks = new Map<string, AdBreak>();
  private readonly played = new Set<string>();

  /** A region Shaka found in the manifest. Returns true when it was an ad break. */
  addRegion(region: TimelineRegionLike): boolean {
    const adBreak = adBreakFromRegion(region);
    if (!adBreak) return false;
    this.breaks.set(adBreak.id, adBreak);
    return true;
  }

  /** The stream has ad breaks: ads play at them, not where the ad tag would put them. */
  get hasBreaks(): boolean {
    return this.breaks.size > 0;
  }

  /** The pre-roll break, if the stream has one; marked as played. */
  takePreroll(): AdBreak | null {
    for (const adBreak of this.ordered()) {
      if (adBreak.start > PREROLL_WINDOW_S) break;
      if (this.played.has(adBreak.id)) continue;
      this.played.add(adBreak.id);
      return adBreak;
    }
    return null;
  }

  /**
   * The break the playhead reached while playing from `previous` to `current`, marked as played; null when none was
   * reached, or when the move was a seek. With several breaks in one step (rare), only the last plays.
   */
  due(previous: number, current: number): AdBreak | null {
    const step = current - previous;
    if (!(step > 0) || step > MAX_PLAY_STEP_S) return null;
    let reached: AdBreak | null = null;
    for (const adBreak of this.ordered()) {
      if (adBreak.start <= PREROLL_WINDOW_S || this.played.has(adBreak.id)) continue;
      if (adBreak.start > previous && adBreak.start <= current) {
        this.played.add(adBreak.id);
        reached = adBreak;
      }
    }
    return reached;
  }

  /** Starts of the mid-roll breaks not played yet, in order (for the countdown before them). */
  upcomingStarts(): number[] {
    return this.ordered()
      .filter((b) => b.start > PREROLL_WINDOW_S && !this.played.has(b.id))
      .map((b) => b.start);
  }

  private ordered(): AdBreak[] {
    return [...this.breaks.values()].sort((a, b) => a.start - b.start);
  }
}
