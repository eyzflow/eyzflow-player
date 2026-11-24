import type { PlayerEndScreenConfig } from "./end-screen";
import type { SkipButtonTypes } from "./stream-signals";
import type { PlayerSeekConfig } from "./seek-steps";

export type PlayerTheme = {
  accentColor: string;
  backgroundColor: string;
  controlsBarColor: string;
  textColor: string;
  borderRadius: string;
};

export type PlayerFeatures = {
  controls: boolean;
  autoPlay: boolean;
  muted: boolean;
  loop: boolean;
  chromecast: boolean;
  airplay: boolean;
  qualitySelector: boolean;
  captions: boolean;
  pip: boolean;
  ads: boolean;
  autoHideControls: boolean;
  /** Count down the last 5 s before a mid-roll ("Ad in 5"). Missing (older configs): on. */
  adCountdown?: boolean;
  /** "Skip intro", "Skip recap" and "Skip credits" buttons at the stream's signals. Missing (older configs): on. */
  skipButtons?: boolean;
  /** The end screen (up next and similar films) when the app passes items. Missing (older configs): on. */
  endScreen?: boolean;
  /** Thumbnails over the seek bar, from the stream's thumbnails track. Missing (older configs): on. */
  thumbnails?: boolean;
  /** Back and forward buttons beside play in the middle of the player, as on iOS. Missing (older configs): on. */
  seekButtons?: boolean;
};

export type PlayerCastConfig = {
  receiverAppId: string;
  androidReceiverCompatible?: boolean;
  autoJoinPolicy?: "tab_and_origin_scoped" | "origin_scoped" | "page_scoped";
};

export type PlayerAdsConfig = {
  adTagUrl: string;
  /** Seconds the countdown before a mid-roll shows (`features.adCountdown`), 1–30. Missing: 5. */
  countdownSeconds?: number;
};

/** Watch progress ("Continue watching"). Every field is optional; the players fill in the defaults. */
export type PlayerWatchProgressConfig = {
  /** From this share of the film on (in percent, 50–100), it counts as watched. Missing: 95. */
  completedPercent?: number;
};

export type PlayerDrmConfig = {
  parameters?: Record<string, unknown>;
};

export type PlayerConfig = {
  id: string;
  name: string;
  isProtected: boolean;
  theme: PlayerTheme;
  features: PlayerFeatures;
  cast?: PlayerCastConfig;
  ads?: PlayerAdsConfig;
  drm?: PlayerDrmConfig;
  /** How the end screen behaves (`features.endScreen`). */
  endScreen?: PlayerEndScreenConfig;
  /** Which signals get a skip button (`features.skipButtons`). Missing: intro, recap and opening credits. */
  skipButtonTypes?: SkipButtonTypes;
  /** Highest bitrate the player picks, in bits per second (video and audio together). Missing: no cap. */
  maxBitrate?: number;
  /** How far ← / → and the back and forward buttons jump. Missing: 5 s and 10 s. */
  seek?: PlayerSeekConfig;
  /** When a film counts as watched. Missing: from 95 %. */
  watchProgress?: PlayerWatchProgressConfig;
};

export const DEFAULT_THEME: PlayerTheme = {
  accentColor: "#615fff",
  backgroundColor: "#0a0a0a",
  controlsBarColor: "rgba(10,10,10,0.88)",
  textColor: "#fafafa",
  borderRadius: "10px",
};

export const DEFAULT_FEATURES: PlayerFeatures = {
  controls: true,
  autoPlay: false,
  muted: false,
  loop: false,
  chromecast: true,
  airplay: true,
  qualitySelector: true,
  captions: true,
  pip: true,
  ads: false,
  autoHideControls: true,
  adCountdown: true,
  skipButtons: true,
  endScreen: true,
  thumbnails: true,
  seekButtons: true,
};

export const DEFAULT_CONFIG: PlayerConfig = {
  id: "default",
  name: "Default",
  isProtected: true,
  theme: DEFAULT_THEME,
  features: DEFAULT_FEATURES,
};
