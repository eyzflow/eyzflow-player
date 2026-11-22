export { EYZFlowPlayer } from "./components/EYZFlowPlayer";
export type { EYZFlowPlayerProps, EYZFlowPlayerAnalyticsOptions } from "./components/EYZFlowPlayer";

// Deprecated spellings, kept for one release. Removed in 0.5.0.
import {
  EYZFlowPlayer,
  type EYZFlowPlayerProps,
  type EYZFlowPlayerAnalyticsOptions,
} from "./components/EYZFlowPlayer";
/** @deprecated Renamed to `EYZFlowPlayer`. This alias is removed in 0.5.0. */
export const EyzflowPlayer = EYZFlowPlayer;
/** @deprecated Renamed to `EYZFlowPlayerProps`. This alias is removed in 0.5.0. */
export type EyzflowPlayerProps = EYZFlowPlayerProps;
/** @deprecated Renamed to `EYZFlowPlayerAnalyticsOptions`. This alias is removed in 0.5.0. */
export type EyzflowPlayerAnalyticsOptions = EYZFlowPlayerAnalyticsOptions;
export type {
  PlayerConfig,
  PlayerTheme,
  PlayerFeatures,
  PlayerCastConfig,
  PlayerAdsConfig,
  PlayerDrmConfig,
} from "./lib/config-types";
export type { PlaybackLimitCode, PlaybackLimitError } from "./lib/playback-session";
export type { PlayerLicenseCode, PlayerLicenseError } from "./lib/license";
export type { SkipButtonTypes, StreamSignal, StreamSignalType } from "./lib/stream-signals";
export type { SignalOverlayContext, SignalOverlayControls } from "./lib/signal-overlay";
export type {
  EndScreenItem,
  EndScreenItemContext,
  EndScreenOptions,
  EndScreenSelectContext,
  PlayerEndScreenConfig,
} from "./lib/end-screen";
