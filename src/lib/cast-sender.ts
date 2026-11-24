import { API_ORIGIN } from "./api";
import { streamManifestUrl } from "./manifest";
import type { CastTrack } from "./media-tracks";

/** Google's Default Media Receiver: plays clear streams only, since it can't send the DRM access token. */
export const DEFAULT_RECEIVER_APP_ID = "CC1AD845";

/** The DASH manifest's type: the EYZFlow receiver plays DASH with Widevine, as the web player does. */
const DASH = "application/dash+xml";

/**
 * What the EYZFlow receiver loads (stream.eyzflow.com/cast): the stream id as `contentId`, and in `customData` the
 * DASH manifest, plus the Widevine licence URL and the browser's `access-token` header for a protected stream. The
 * same LOAD the Flutter player sends.
 */
export function castMediaFor(streamId: string, accessToken: string | null) {
  const manifestUrl = streamManifestUrl(streamId, "dash");
  return {
    contentId: streamId,
    contentUrl: manifestUrl,
    contentType: DASH,
    customData: {
      manifestUrl,
      ...(accessToken && {
        licenseUrl: `${API_ORIGIN}/v1/drm/${encodeURIComponent(streamId)}/widevine/acquire`,
        accessToken,
      }),
    },
  };
}

// The parts of the Cast Web Sender SDK (cast.framework, chrome.cast.media) the player uses.

export type CastMediaSession = {
  media?: { contentId?: string; tracks?: CastTrack[] | null } | null;
  activeTrackIds?: number[] | null;
  playerState?: string;
  idleReason?: string | null;
  addUpdateListener: (fn: (alive: boolean) => void) => void;
  removeUpdateListener: (fn: (alive: boolean) => void) => void;
  editTracksInfo: (request: unknown, onSuccess: () => void, onError: (error: unknown) => void) => void;
};

export type CastSession = {
  getMediaSession: () => CastMediaSession | null;
  getCastDevice: () => { friendlyName?: string };
  loadMedia: (request: unknown) => Promise<unknown>;
};

export type CastContext = {
  setOptions: (options: { receiverApplicationId: string; autoJoinPolicy?: string }) => void;
  requestSession: () => Promise<unknown>;
  getCurrentSession: () => CastSession | null;
  endCurrentSession: (stopCasting: boolean) => void;
  addEventListener: (type: string, fn: (event: { sessionState: string }) => void) => void;
  removeEventListener: (type: string, fn: (event: { sessionState: string }) => void) => void;
};

export type RemotePlayer = {
  isConnected: boolean;
  isMediaLoaded: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  volumeLevel: number;
  isMuted: boolean;
  playerState: string | null;
};

export type RemotePlayerController = {
  playOrPause: () => void;
  seek: () => void;
  setVolumeLevel: () => void;
  muteOrUnmute: () => void;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
};

export type CastFramework = {
  CastContext: { getInstance: () => CastContext };
  CastContextEventType: { SESSION_STATE_CHANGED: string };
  SessionState: { SESSION_STARTED: string; SESSION_RESUMED: string; SESSION_ENDED: string };
  RemotePlayer: new () => RemotePlayer;
  RemotePlayerController: new (player: RemotePlayer) => RemotePlayerController;
  RemotePlayerEventType: { ANY_CHANGE: string };
};

export type ChromeCastMedia = {
  MediaInfo: new (contentId: string, contentType: string) => Record<string, unknown>;
  LoadRequest: new (mediaInfo: unknown) => Record<string, unknown>;
  EditTracksInfoRequest: new (activeTrackIds: number[]) => unknown;
  StreamType: { BUFFERED: string };
};

export type CastSdk = { framework: CastFramework; media: ChromeCastMedia };

declare global {
  interface Window {
    __onGCastApiAvailable?: (loaded: boolean) => void;
  }
}

function sdk(): CastSdk | null {
  const w = window as unknown as {
    cast?: { framework?: CastFramework };
    chrome?: { cast?: { media?: ChromeCastMedia } };
  };
  const framework = w.cast?.framework;
  const media = w.chrome?.cast?.media;
  return framework && media ? { framework, media } : null;
}

let loading: Promise<CastSdk | null> | null = null;

/** Loads the Cast sender SDK once. Null where Cast is not offered (browsers other than Chrome and Edge). */
export function loadCastSender(): Promise<CastSdk | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const ready = sdk();
  if (ready) return Promise.resolve(ready);
  loading ??= new Promise((resolve) => {
    const previous = window.__onGCastApiAvailable;
    window.__onGCastApiAvailable = (available) => {
      previous?.(available);
      resolve(available ? sdk() : null);
    };
    const script = document.createElement("script");
    script.id = "eyz-cast-sdk";
    script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return loading;
}
