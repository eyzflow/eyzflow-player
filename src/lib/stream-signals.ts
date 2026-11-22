/**
 * The intro, recap and credits marked on a stream in the dashboard (Stream → Signals). The backend writes each one
 * into the MPD as an Event in an EventStream with this scheme, `messageData` holding the type and an optional label
 * (`intro` or `intro:Season 2 intro`); Shaka reports them as timeline regions.
 */
export const SIGNAL_SCHEME = "urn:eyzflow:signal";

export const STREAM_SIGNAL_TYPES = ["intro", "recap", "opening_credits", "closing_credits"] as const;
export type StreamSignalType = (typeof STREAM_SIGNAL_TYPES)[number];

export type StreamSignal = {
  id: string;
  type: StreamSignalType;
  /** Position in the content, in seconds. */
  start: number;
  /** Where the span ends, in seconds: a skip lands here. */
  end: number;
  /** The label set in the dashboard, if any. */
  label: string | null;
};

/** What the schedule reads from a Shaka timeline region (shaka.extern.TimelineRegionInfo). */
export type SignalRegionLike = {
  schemeIdUri: string;
  id: string;
  startTime: number;
  endTime: number;
  eventNode?: { attributes?: Record<string, string | undefined> } | null;
};

/**
 * Playback this close to a span's end counts as past it, so a skip that lands a few milliseconds short (or a span
 * that ends at the very end of the film) doesn't leave the button up.
 */
export const SIGNAL_END_SLACK_S = 0.25;

function isSignalType(value: string): value is StreamSignalType {
  return (STREAM_SIGNAL_TYPES as readonly string[]).includes(value);
}

/** The signal a timeline region marks, or null when it is another kind of region (an ad break, say). */
export function signalFromRegion(region: SignalRegionLike): StreamSignal | null {
  if (region.schemeIdUri !== SIGNAL_SCHEME) return null;
  const { startTime: start, endTime: end } = region;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const message = region.eventNode?.attributes?.messageData ?? "";
  const colon = message.indexOf(":");
  const type = (colon === -1 ? message : message.slice(0, colon)).trim();
  if (!isSignalType(type)) return null;
  const label = colon === -1 ? "" : message.slice(colon + 1).trim();
  return {
    id: region.id ? `${type}-${region.id}` : `${type}-${start}`,
    type,
    start: Math.max(0, start),
    end,
    label: label || null,
  };
}

/** The stream's signals, and which one playback is in. */
export class SignalSchedule {
  private readonly signals = new Map<string, StreamSignal>();

  /** A region Shaka found in the manifest. Returns true when it was a signal. */
  addRegion(region: SignalRegionLike): boolean {
    const signal = signalFromRegion(region);
    if (!signal) return false;
    this.signals.set(signal.id, signal);
    return true;
  }

  /** Whether the stream has a signal of this type, anywhere. */
  has(type: StreamSignalType): boolean {
    for (const signal of this.signals.values()) if (signal.type === type) return true;
    return false;
  }

  get size(): number {
    return this.signals.size;
  }

  /** The signal covering `time`; with overlapping spans, the one that started last. */
  at(time: number): StreamSignal | null {
    if (!Number.isFinite(time)) return null;
    let found: StreamSignal | null = null;
    for (const signal of this.signals.values()) {
      if (time < signal.start || time >= signal.end - SIGNAL_END_SLACK_S) continue;
      if (!found || signal.start > found.start) found = signal;
    }
    return found;
  }
}

const LABELS: Record<string, Record<StreamSignalType, string>> = {
  en: { intro: "Skip intro", recap: "Skip recap", opening_credits: "Skip credits", closing_credits: "Skip credits" },
  de: {
    intro: "Intro überspringen",
    recap: "Rückblick überspringen",
    opening_credits: "Vorspann überspringen",
    closing_credits: "Abspann überspringen",
  },
  fr: {
    intro: "Passer l’intro",
    recap: "Passer le récap",
    opening_credits: "Passer le générique",
    closing_credits: "Passer le générique",
  },
  nl: {
    intro: "Intro overslaan",
    recap: "Samenvatting overslaan",
    opening_credits: "Begintiteling overslaan",
    closing_credits: "Aftiteling overslaan",
  },
};

/** Which signals get a skip button: the player config's `skipButtonTypes`. Missing types use the defaults. */
export type SkipButtonTypes = {
  intro?: boolean;
  recap?: boolean;
  openingCredits?: boolean;
  closingCredits?: boolean;
};

/**
 * The defaults: intro, recap and opening credits on; closing credits off (skipping them only ends the film, and the
 * end screen belongs there).
 */
export const DEFAULT_SKIP_BUTTON_TYPES: Required<SkipButtonTypes> = {
  intro: true,
  recap: true,
  openingCredits: true,
  closingCredits: false,
};

const SKIP_TYPE_KEY: Record<StreamSignalType, keyof SkipButtonTypes> = {
  intro: "intro",
  recap: "recap",
  opening_credits: "openingCredits",
  closing_credits: "closingCredits",
};

/** Whether `type` gets a skip button under `types` (the config's section, maybe partial or missing). */
export function skipButtonFor(type: StreamSignalType, types?: SkipButtonTypes): boolean {
  const key = SKIP_TYPE_KEY[type];
  return types?.[key] ?? DEFAULT_SKIP_BUTTON_TYPES[key];
}

/** The skip button's text in the viewer's language (en, de, fr, nl; English otherwise). */
export function skipSignalLabel(type: StreamSignalType, language?: string): string {
  const lang = (language ?? (typeof navigator !== "undefined" ? navigator.language : "en")).toLowerCase().split("-")[0];
  return (LABELS[lang] ?? LABELS.en)[type];
}
