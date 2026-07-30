import type { ShakaGlobal, ShakaPlayerApi } from "./shaka-types";

const STREAM_CDN = (import.meta.env?.VITE_STREAM_CDN_ORIGIN as string | undefined)?.replace(/\/$/, "") ?? "https://stream.eyzflow.com";
const DRM_API = (import.meta.env?.VITE_DRM_API_ORIGIN as string | undefined)?.replace(/\/$/, "") ?? "https://api.eyzflow.com";

export function buildAccessToken(authorizationKey: string): string {
  const payload = {
    headers: { authorization: authorizationKey },
    parameters: {} as Record<string, unknown>,
  };
  return btoa(JSON.stringify(payload));
}

export function configureDrm(
  player: ShakaPlayerApi,
  shaka: ShakaGlobal,
  streamId: string,
  authorizationKey: string,
): void {
  const id = encodeURIComponent(streamId);
  player.configure({
    drm: {
      servers: {
        "com.widevine.alpha": `${DRM_API}/v1/drm/${id}/widevine/acquire`,
        "com.microsoft.playready": `${DRM_API}/v1/drm/${id}/playready/acquire`,
        "com.apple.fps": `${DRM_API}/v1/drm/${id}/fairplay/acquire`,
      },
      advanced: {
        "com.apple.fps": {
          serverCertificateUri: `${STREAM_CDN}/fps.cer`,
        },
      },
    },
  });

  const accessToken = buildAccessToken(authorizationKey);
  const LICENSE = shaka.net.NetworkingEngine.RequestType.LICENSE;
  player.getNetworkingEngine().registerRequestFilter((type, request) => {
    if (type === LICENSE) {
      request.headers["access-token"] = accessToken;
    }
  });
}
