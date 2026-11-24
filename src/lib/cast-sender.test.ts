import { describe, expect, it } from "vitest";
import { castMediaFor } from "./cast-sender";

describe("castMediaFor", () => {
  it("sends the DASH manifest, the Widevine licence URL and the access token for a protected stream", () => {
    const media = castMediaFor("abc 1", "token");
    expect(media.contentId).toBe("abc 1");
    expect(media.contentType).toBe("application/dash+xml");
    expect(media.customData).toEqual({
      manifestUrl: "https://stream.eyzflow.com/abc%201/manifest.mpd",
      licenseUrl: "https://api.eyzflow.com/v1/drm/abc%201/widevine/acquire",
      accessToken: "token",
    });
  });
  it("sends only the manifest for a clear stream", () => {
    expect(castMediaFor("abc", null).customData).toEqual({ manifestUrl: "https://stream.eyzflow.com/abc/manifest.mpd" });
  });
});
