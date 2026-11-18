import { API_ORIGIN, STREAM_CDN_ORIGIN } from "./api";
import type { ShakaGlobal, ShakaPlayerApi } from "./shaka-types";

export function buildAccessToken(
  authorizationKey: string,
  parameters: Record<string, unknown> = {},
): string {
  const payload = {
    headers: { authorization: authorizationKey },
    parameters,
  };
  return btoa(JSON.stringify(payload));
}

/**
 * Points Shaka at the eyzflow licence servers and adds the access token to every licence request. The parameters are
 * read per request, so a renewed player token (parameters.player_token) is always the one sent.
 */
export function configureDrm(
  player: ShakaPlayerApi,
  shaka: ShakaGlobal,
  streamId: string,
  authorizationKey: string,
  parameters: Record<string, unknown> | (() => Record<string, unknown>) = {},
): void {
  const id = encodeURIComponent(streamId);
  player.configure({
    drm: {
      servers: {
        "com.widevine.alpha": `${API_ORIGIN}/v1/drm/${id}/widevine/acquire`,
        "com.microsoft.playready": `${API_ORIGIN}/v1/drm/${id}/playready/acquire`,
        "com.apple.fps": `${API_ORIGIN}/v1/drm/${id}/fairplay/acquire`,
      },
      advanced: {
        "com.apple.fps": {
          serverCertificateUri: `${STREAM_CDN_ORIGIN}/fps.cer`,
        },
      },
    },
  });

  const read = typeof parameters === "function" ? parameters : () => parameters;
  const LICENSE = shaka.net.NetworkingEngine.RequestType.LICENSE;
  player.getNetworkingEngine().registerRequestFilter((type, request) => {
    if (type === LICENSE) {
      request.headers["access-token"] = buildAccessToken(authorizationKey, read());
    }
  });
}
