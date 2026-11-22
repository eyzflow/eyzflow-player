import { STREAM_CDN_ORIGIN as STREAM_CDN } from "./api";

export function streamManifestUrl(streamId: string): string {
  return `${STREAM_CDN}/${encodeURIComponent(streamId)}/manifest.mpd`;
}
