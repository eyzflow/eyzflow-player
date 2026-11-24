function origin(value: string | undefined, fallback: string): string {
  return value ? value.replace(/\/$/, "") : fallback;
}

// Written as `import.meta.env?.X` so Vite replaces it and other bundlers fall back to the production origins.

/** The eyzflow API: DRM licences, playback sessions, player keys and analytics. */
export const API_ORIGIN = origin(import.meta.env?.VITE_DRM_API_ORIGIN as string | undefined, "https://api.eyzflow.com");
/** Remote player configs. */
export const CONFIG_API_ORIGIN = origin(import.meta.env?.VITE_CONFIG_API_ORIGIN as string | undefined, "https://api.eyzflow.com");
/** Manifests, segments and the FairPlay certificate. */
export const STREAM_CDN_ORIGIN = origin(import.meta.env?.VITE_STREAM_CDN_ORIGIN as string | undefined, "https://stream.eyzflow.com");

/** This player's version, sent with licence checks and analytics. */
export const PLAYER_VERSION = "0.9.1";
