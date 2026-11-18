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
