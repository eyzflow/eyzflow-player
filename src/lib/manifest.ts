const STREAM_CDN = (import.meta.env?.VITE_STREAM_CDN_ORIGIN as string | undefined)?.replace(/\/$/, "") ?? "https://stream.eyzflow.com";

export function streamManifestUrl(streamId: string): string {
  return `${STREAM_CDN}/${encodeURIComponent(streamId)}/manifest.mpd`;
}
