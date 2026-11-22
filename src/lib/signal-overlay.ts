import type { StreamSignal } from "./stream-signals";

/** What the app's overlay can do to playback. */
export type SignalOverlayControls = {
  /** Jumps to the end of the signal playback is in (the end of the film at most). */
  skip: () => void;
  /** Jumps to a position, in seconds. */
  seek: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  /** Hides the overlay until playback enters another signal or the film ends. */
  dismiss: () => void;
};

/** What `renderOverlay` gets: the moment it is called for, and the controls. */
export type SignalOverlayContext = {
  /** The intro, recap or credits signal playback is in; null after the end. */
  signal: StreamSignal | null;
  /** The film played to its end. */
  ended: boolean;
  controls: SignalOverlayControls;
};

/**
 * The moment an overlay is drawn for, as a key: a signal playback is in, or the end of the film. Null when there is
 * neither, and the overlay is not asked for. A dismissed overlay stays hidden while this key stays the same.
 */
export function overlayMoment(signal: StreamSignal | null, ended: boolean): string | null {
  if (signal) return `signal:${signal.id}`;
  return ended ? "ended" : null;
}
