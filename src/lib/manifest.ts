import { STREAM_CDN_ORIGIN as STREAM_CDN } from "./api";

/** DASH everywhere it can decrypt; HLS where FairPlay is the only DRM (Safari), since only HLS carries a FairPlay key. */
export type ManifestFormat = "dash" | "hls";

export function streamManifestUrl(streamId: string, format: ManifestFormat = "dash"): string {
  const file = format === "hls" ? "master.m3u8" : "manifest.mpd";
  return `${STREAM_CDN}/${encodeURIComponent(streamId)}/${file}`;
}

/** Which DRM systems this browser offers. */
export type KeySystemSupport = { widevine: boolean; playready: boolean; fairplay: boolean };

/** A clear stream plays from DASH everywhere; a protected one needs HLS only where FairPlay is the sole DRM. */
export function manifestFormatFor(isProtected: boolean, support: KeySystemSupport): ManifestFormat {
  if (!isProtected) return "dash";
  return support.fairplay && !support.widevine && !support.playready ? "hls" : "dash";
}

const VIDEO = [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }];
const KEY_SYSTEMS: Record<keyof KeySystemSupport, { id: string; initDataTypes: string[] }> = {
  widevine: { id: "com.widevine.alpha", initDataTypes: ["cenc"] },
  playready: { id: "com.microsoft.playready", initDataTypes: ["cenc"] },
  fairplay: { id: "com.apple.fps", initDataTypes: ["sinf", "skd"] },
};

/** Asks the browser which DRM systems it has (EME). A browser without EME reports none. */
export async function probeKeySystems(nav: Navigator | undefined = typeof navigator !== "undefined" ? navigator : undefined): Promise<KeySystemSupport> {
  const has = async (name: keyof KeySystemSupport): Promise<boolean> => {
    if (!nav?.requestMediaKeySystemAccess) return false;
    const { id, initDataTypes } = KEY_SYSTEMS[name];
    try {
      await nav.requestMediaKeySystemAccess(id, [{ initDataTypes, videoCapabilities: VIDEO }]);
      return true;
    } catch {
      return false;
    }
  };
  const [widevine, playready, fairplay] = await Promise.all([has("widevine"), has("playready"), has("fairplay")]);
  return { widevine, playready, fairplay };
}
