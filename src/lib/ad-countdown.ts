import { MAX_PLAY_STEP_S, PREROLL_WINDOW_S } from "./ad-breaks";

/** How long before a mid-roll the notice counts down ("Ad in 5" … "Ad in 1"). */
export const AD_COUNTDOWN_S = 5;

/**
 * The whole seconds left (5 … 1) until the next break start ahead of `current`, or null when none is within
 * AD_COUNTDOWN_S.
 */
export function countdownSeconds(current: number, starts: readonly number[]): number | null {
  let next = Infinity;
  for (const start of starts) if (start > current && start < next) next = start;
  const left = next - current;
  if (!(left > 0) || left > AD_COUNTDOWN_S) return null;
  return Math.max(1, Math.ceil(left));
}

/** IMA's AdCuePoint as Shaka reports it: `start` 0 is the pre-roll, -1 the post-roll. */
export type CuePointLike = { start: number; end?: number | null };

/**
 * The mid-roll cue points of a VMAP tag, on streams without ad break markers (IMA plays those itself). A cue point
 * counts as passed once playback runs through it, so its notice doesn't come back after a rewind: IMA plays each
 * break once.
 */
export class CuePointSchedule {
  private starts: number[] = [];
  private readonly passed = new Set<number>();

  set(cuePoints: readonly CuePointLike[]): void {
    this.starts = cuePoints.map((c) => c.start).filter((s) => Number.isFinite(s) && s > PREROLL_WINDOW_S);
  }

  /** Playback moved from `previous` to `current`: cue points played through are passed (not ones seeked past). */
  pass(previous: number, current: number): void {
    const step = current - previous;
    if (!(step > 0) || step > MAX_PLAY_STEP_S) return;
    for (const start of this.starts) if (start > previous && start <= current) this.passed.add(start);
  }

  upcoming(): number[] {
    return this.starts.filter((s) => !this.passed.has(s));
  }
}

const LABELS: Record<string, (n: number) => string> = {
  en: (n) => `Ad in ${n}`,
  de: (n) => `Werbung in ${n}`,
  fr: (n) => `Publicité dans ${n}`,
  nl: (n) => `Reclame over ${n}`,
};

/** The notice in the viewer's language (en, de, fr, nl; English otherwise). */
export function adCountdownLabel(seconds: number, language?: string): string {
  const lang = (language ?? (typeof navigator !== "undefined" ? navigator.language : "en")).toLowerCase().split("-")[0];
  return (LABELS[lang] ?? LABELS.en)(seconds);
}
