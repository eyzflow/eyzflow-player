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
};

export const DEFAULT_CONFIG: PlayerConfig = {
  id: "default",
  name: "Default",
  isProtected: true,
  theme: DEFAULT_THEME,
  features: DEFAULT_FEATURES,
};
