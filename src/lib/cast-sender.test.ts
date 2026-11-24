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
  it("names the film and its poster when the app gives them", () => {
    expect(castMediaFor("abc", null, { title: " Ein Film ", poster: "https://img/p.jpg" }).metadata).toEqual({
      title: "Ein Film",
      images: ["https://img/p.jpg"],
    });
    expect(castMediaFor("abc", null, { poster: "https://img/p.jpg" }).metadata).toEqual({ title: undefined, images: ["https://img/p.jpg"] });
    expect(castMediaFor("abc", null, { title: "  " }).metadata).toBeNull();
    expect(castMediaFor("abc", null).metadata).toBeNull();
  });
});
