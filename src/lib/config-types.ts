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
};

export type PlayerCastConfig = {
  receiverAppId: string;
  androidReceiverCompatible?: boolean;
  autoJoinPolicy?: "tab_and_origin_scoped" | "origin_scoped" | "page_scoped";
};

export type PlayerAdsConfig = {
  adTagUrl: string;
};

export type PlayerConfig = {
  id: string;
  name: string;
  isProtected: boolean;
  theme: PlayerTheme;
  features: PlayerFeatures;
  cast?: PlayerCastConfig;
  ads?: PlayerAdsConfig;
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
};

export const DEFAULT_CONFIG: PlayerConfig = {
  id: "default",
  name: "Default",
  isProtected: true,
  theme: DEFAULT_THEME,
  features: DEFAULT_FEATURES,
};
