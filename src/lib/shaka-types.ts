export type ShakaTrack = {
  id: number;
  active: boolean;
  type: string;
  bandwidth: number;
  language: string;
  label: string | null;
  kind: string | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  mimeType: string | null;
};

export type ShakaTextTrack = {
  id: number;
  active: boolean;
  type: string;
  language: string;
  label: string | null;
  kind: string | null;
  mimeType: string | null;
};

export type ShakaNetworkingEngine = {
  registerRequestFilter: (
    fn: (type: number, request: { headers: Record<string, string> }) => void,
  ) => void;
};

export type ShakaPlayerApi = {
  configure: (config: unknown) => void;
  attach: (video: HTMLVideoElement) => Promise<void>;
  load: (uri: string) => Promise<void>;
  unload: () => Promise<void>;
  destroy: () => Promise<void>;
  addEventListener: (event: string, fn: (e: Event) => void) => void;
  removeEventListener: (event: string, fn: (e: Event) => void) => void;
  getNetworkingEngine: () => ShakaNetworkingEngine;
  getVariantTracks: () => ShakaTrack[];
  getTextTracks: () => ShakaTextTrack[];
  selectVariantTrack: (track: ShakaTrack, clearBuffer?: boolean) => void;
  /** Selecting a track shows it; passing null unloads/hides text. */
  selectTextTrack: (track: ShakaTextTrack | null) => void;
  isLive?: () => boolean;
  /** The key system in use once a licence was asked for (e.g. "com.widevine.alpha"). */
  drmInfo?: () => { keySystem?: string } | null;
  /** Null in builds without the ads module. */
  getAdManager?: () => ShakaAdManager | null;
};

/** The ad playing now (shaka.extern.IAd), the part the player reads. */
export type ShakaAd = {
  isLinear: () => boolean;
};

/** Shaka's ad manager (shaka.extern.IAdManager), the client-side part the player uses. */
export type ShakaAdManager = {
  setContainers: (clientSideAdContainer: HTMLElement, serverSideAdContainer: HTMLElement) => void;
  requestClientSideAds: (imaRequest: ImaAdsRequest, adsRenderingSettings: unknown | null) => void;
  getCurrentAd: () => ShakaAd | null;
  /** Releases IMA (its ads manager, schedule and loader); the next request sets it up again. */
  onAssetUnload: () => void;
  addEventListener: (event: string, fn: (e: Event) => void) => void;
  removeEventListener: (event: string, fn: (e: Event) => void) => void;
};

/** Events of Shaka's ad manager (shaka.ads.Utils), the ones the player listens to. */
export const SHAKA_AD_EVENTS = {
  STARTED: "ad-started",
  STOPPED: "ad-stopped",
  ALL_COMPLETED: "all-ads-completed",
  ERROR: "ad-error",
  /** A VMAP tag loaded: its breaks as `cuepoints` ({ start }: 0 pre-roll, -1 post-roll). */
  CUEPOINTS_CHANGED: "ad-cue-points-changed",
} as const;

/** google.ima.AdsRequest, the fields the player sets. */
export type ImaAdsRequest = {
  adTagUrl: string;
  linearAdSlotWidth: number;
  linearAdSlotHeight: number;
  nonLinearAdSlotWidth: number;
  nonLinearAdSlotHeight: number;
  vastLoadTimeout: number;
  setAdWillAutoPlay: (autoPlay: boolean) => void;
  setAdWillPlayMuted: (muted: boolean) => void;
};

/** window.google.ima: the client-side IMA SDK, the part the player uses. */
export type ImaGlobal = {
  AdsLoader: unknown;
  AdsRequest: new () => ImaAdsRequest;
};

/** The error Shaka reports (shaka.util.Error): severity 2 is critical (playback stopped). */
export type ShakaError = { code?: number; category?: number; severity?: number; message?: string; data?: unknown[] };

export type ShakaPlayerConstructor = {
  new (): ShakaPlayerApi;
  isBrowserSupported: () => boolean;
};

export type ShakaNet = {
  NetworkingEngine: {
    RequestType: { LICENSE: number };
  };
};

export type ShakaGlobal = {
  polyfill: { installAll: () => void };
  Player: ShakaPlayerConstructor;
  net: ShakaNet;
};
