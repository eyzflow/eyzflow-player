/** How far the arrow keys and the on-screen back and forward buttons jump. */
export type PlayerSeekConfig = {
  /** Seconds ← and → jump. Missing: 5. */
  arrowKeySeconds?: number;
  /** Seconds the on-screen back and forward buttons (and J and L) jump. Missing: 10. */
  buttonSeconds?: number;
};

export type SeekSteps = { arrowKeys: number; buttons: number };

export const DEFAULT_SEEK_STEPS: SeekSteps = { arrowKeys: 5, buttons: 10 };

const MIN_STEP = 1;
const MAX_STEP = 600;

/** A step in whole seconds from 1 to 600; anything else (missing, zero, negative, not a number) falls back. */
function step(value: unknown, fallback: number): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  const whole = Math.round(n);
  if (whole < MIN_STEP) return fallback;
  return Math.min(MAX_STEP, whole);
}

/** The steps to use: the player's own (props) win over the config's, which win over the defaults. */
export function seekSteps(config?: PlayerSeekConfig | null, overrides?: PlayerSeekConfig | null): SeekSteps {
  const arrowKeys = step(config?.arrowKeySeconds, DEFAULT_SEEK_STEPS.arrowKeys);
  const buttons = step(config?.buttonSeconds, DEFAULT_SEEK_STEPS.buttons);
  return {
    arrowKeys: step(overrides?.arrowKeySeconds, arrowKeys),
    buttons: step(overrides?.buttonSeconds, buttons),
  };
}

/** Where a relative seek lands: `delta` seconds from `from`, kept inside the stream. */
export function seekTarget(from: number, delta: number, duration: number): number {
  const end = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
  return Math.max(0, Math.min(end, from + delta));
}
