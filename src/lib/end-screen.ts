import type { PlayerConfig } from "./config-types";
import type { StreamSignal } from "./stream-signals";

/** A film or episode the end screen offers. The app supplies them; the player plays `streamId` when picked. */
export type EndScreenItem = {
  streamId: string;
  title: string;
  /** Image URL, shown 16:9. */
  poster?: string;
  description?: string;
  /** Length in seconds. */
  duration?: number;
  /** A short tag over the poster, e.g. "New" or "S1 E2". */
  badge?: string;
  /** Anything the app wants back in `onSelect` and `renderItem`. */
  data?: unknown;
};

export type EndScreenSelectContext = {
  /** Picked by the "Up next" countdown reaching 0, not by the viewer. */
  autoplay: boolean;
  /** Stops the player from playing the item itself: the app handles it. */
  preventDefault: () => void;
};

export type EndScreenItemContext = {
  /** Plays the item (as a click on it would). */
  select: () => void;
};

/** The `endScreen` prop. Remote config fields (`features.endScreen`, `endScreen.*`) apply where this leaves them out. */
export type EndScreenOptions = {
  /** The row of films. */
  items?: EndScreenItem[];
  /** The next stream, with a countdown that plays it at 0. */
  nextUp?: EndScreenItem & { autoplaySeconds?: number };
  /** The row's heading; "More like this" in the viewer's language by default. */
  title?: string;
  /** "credits": from the closing credits signal (else at the end); "end": only once the film ended. */
  showAt?: "credits" | "end";
  /** Shrinks the credits into a corner while the end screen shows over them. Default off: they play on behind it. */
  shrinkVideo?: boolean;
  /**
   * Without a closing credits signal on the stream, the end screen shows this many seconds before the end, as at the
   * credits (0–120; 0: only when the film ends). Default 20.
   */
  secondsBeforeEnd?: number;
  /** False turns it off for this player, over the config. */
  enabled?: boolean;
  /** Extra class on the end screen's root, for the app's own styles. */
  className?: string;
  /** The viewer (or the countdown) picked an item. Without `preventDefault()`, the player then plays it in place. */
  onSelect?: (item: EndScreenItem, context: EndScreenSelectContext) => void;
  /** Draws one item instead of the built-in card. */
  renderItem?: (item: EndScreenItem, context: EndScreenItemContext) => React.ReactNode;
};

/** The player config's end screen settings, as the dashboard saves them. */
export type PlayerEndScreenConfig = {
  /** Seconds the "Up next" countdown runs, 0–30; 0 is no autoplay. Missing: 10. */
  autoplaySeconds?: number;
  showAt?: "credits" | "end";
  /** Shrinks the credits into a corner. Missing: off. */
  shrinkVideo?: boolean;
  /** Without a closing credits signal: seconds before the end it shows, 0–120. Missing: 20. */
  secondsBeforeEnd?: number;
};

export const END_SCREEN_AUTOPLAY_S = 10;
export const END_SCREEN_BEFORE_END_S = 20;
export const END_SCREEN_BEFORE_END_MAX_S = 120;
export const END_SCREEN_AUTOPLAY_MAX_S = 30;

export type EndScreenSettings = {
  enabled: boolean;
  autoplaySeconds: number;
  showAt: "credits" | "end";
  shrinkVideo: boolean;
  secondsBeforeEnd: number;
};

function seconds(value: unknown, max = END_SCREEN_AUTOPLAY_MAX_S): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(0, Math.round(value)));
}

/**
 * The end screen as this player shows it: the prop over the config. On only with something to show (items or a next
 * stream), `features.endScreen` not false, and the prop not switching it off.
 */
export function endScreenSettings(config: PlayerConfig, options?: EndScreenOptions): EndScreenSettings {
  const remote = config.endScreen;
  const hasContent = !!options && ((options.items?.length ?? 0) > 0 || !!options.nextUp);
  const showAt = options?.showAt ?? remote?.showAt;
  return {
    enabled: hasContent && config.features.endScreen !== false && options?.enabled !== false,
    autoplaySeconds:
      seconds(options?.nextUp?.autoplaySeconds) ?? seconds(remote?.autoplaySeconds) ?? END_SCREEN_AUTOPLAY_S,
    showAt: showAt === "end" ? "end" : "credits",
    shrinkVideo: options?.shrinkVideo ?? remote?.shrinkVideo ?? false,
    secondsBeforeEnd:
      seconds(options?.secondsBeforeEnd, END_SCREEN_BEFORE_END_MAX_S) ??
      seconds(remote?.secondsBeforeEnd, END_SCREEN_BEFORE_END_MAX_S) ??
      END_SCREEN_BEFORE_END_S,
  };
}

/** When the end screen shows: over the closing credits, after the end, or not now. */
export type EndScreenPhase = "credits" | "ended" | null;

/** Where playback is, for `endScreenPhase`. */
export type EndScreenPlayback = {
  signal: StreamSignal | null;
  /** Ended, or in the film's last second. */
  ended: boolean;
  /** Seconds. */
  position: number;
  /** Seconds; 0 while unknown. */
  duration: number;
  /** The stream marks its closing credits. */
  hasClosingCredits: boolean;
};

/**
 * Over the closing credits; on a stream without them, the last `secondsBeforeEnd` seconds count as the credits. After
 * the end. Or not now.
 */
export function endScreenPhase(settings: EndScreenSettings, playback: EndScreenPlayback): EndScreenPhase {
  if (!settings.enabled) return null;
  if (playback.ended) return "ended";
  if (settings.showAt !== "credits") return null;
  if (playback.signal?.type === "closing_credits") return "credits";
  const { duration, position, hasClosingCredits } = playback;
  if (!hasClosingCredits && settings.secondsBeforeEnd > 0 && duration > 0 && position >= duration - settings.secondsBeforeEnd) {
    return "credits";
  }
  return null;
}

/** "1 h 32 min", "45 min"; empty for a missing or odd length. */
export function formatRuntime(totalSeconds: number | undefined): string {
  if (!totalSeconds || !Number.isFinite(totalSeconds) || totalSeconds < 60) return "";
  const minutes = Math.round(totalSeconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

type Labels = {
  upNext: string;
  nextIn: (s: number) => string;
  play: string;
  cancel: string;
  moreLikeThis: string;
  backToCredits: string;
};

const LABELS: Record<string, Labels> = {
  en: {
    upNext: "Up next",
    nextIn: (s) => `Next in ${s}`,
    play: "Play",
    cancel: "Cancel",
    moreLikeThis: "More like this",
    backToCredits: "Back to credits",
  },
  de: {
    upNext: "Als Nächstes",
    nextIn: (s) => `Weiter in ${s}`,
    play: "Abspielen",
    cancel: "Abbrechen",
    moreLikeThis: "Ähnliche Titel",
    backToCredits: "Zurück zum Abspann",
  },
  fr: {
    upNext: "À suivre",
    nextIn: (s) => `Suite dans ${s}`,
    play: "Lecture",
    cancel: "Annuler",
    moreLikeThis: "Titres similaires",
    backToCredits: "Revenir au générique",
  },
  nl: {
    upNext: "Hierna",
    nextIn: (s) => `Volgende over ${s}`,
    play: "Afspelen",
    cancel: "Annuleren",
    moreLikeThis: "Meer zoals dit",
    backToCredits: "Terug naar de aftiteling",
  },
};

/** The end screen's texts in the viewer's language (en, de, fr, nl; English otherwise). */
export function endScreenLabels(language?: string): Labels {
  const lang = (language ?? (typeof navigator !== "undefined" ? navigator.language : "en")).toLowerCase().split("-")[0];
  return LABELS[lang] ?? LABELS.en;
}

/** The corner video's share of the player's width, and the most of its height it may take, so the cards stay clear. */
const CORNER_WIDTH = 0.42;
const CORNER_WIDTH_SMALL = 0.5;
const CORNER_MAX_HEIGHT = 0.44;
/** Below this player width the corner video takes a larger share, or it gets too small to watch. */
const SMALL_PLAYER = 640;

/**
 * The size of the video in the corner at the credits, in pixels: the picture itself at its own aspect ratio, so a
 * player of another shape (fill on a tall screen) doesn't shrink its black bars along with it.
 */
export function cornerVideoSize(
  playerWidth: number,
  playerHeight: number,
  videoWidth: number,
  videoHeight: number,
): { width: number; height: number } | null {
  if (!(playerWidth > 0) || !(playerHeight > 0)) return null;
  const aspect = videoWidth > 0 && videoHeight > 0 ? videoWidth / videoHeight : 16 / 9;
  const share = playerWidth < SMALL_PLAYER ? CORNER_WIDTH_SMALL : CORNER_WIDTH;
  const width = Math.min(playerWidth * share, playerHeight * CORNER_MAX_HEIGHT * aspect);
  return { width: Math.round(width), height: Math.round(width / aspect) };
}
