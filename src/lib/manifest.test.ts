import { describe, expect, it, vi } from "vitest";
import { manifestFormatFor, probeKeySystems, streamManifestUrl } from "./manifest";

const safari = { widevine: false, playready: false, fairplay: true };
const chrome = { widevine: true, playready: false, fairplay: false };
const edge = { widevine: true, playready: true, fairplay: false };

describe("streamManifestUrl", () => {
  it("points at the DASH manifest by default and at the HLS master for hls", () => {
    expect(streamManifestUrl("abc")).toBe("https://stream.eyzflow.com/abc/manifest.mpd");
    expect(streamManifestUrl("abc", "hls")).toBe("https://stream.eyzflow.com/abc/master.m3u8");
  });
});

describe("manifestFormatFor", () => {
  it("plays a protected stream from HLS where FairPlay is the only DRM (Safari)", () => {
    expect(manifestFormatFor(true, safari)).toBe("hls");
  });

  it("keeps DASH for protected streams wherever Widevine or PlayReady is there", () => {
    expect(manifestFormatFor(true, chrome)).toBe("dash");
    expect(manifestFormatFor(true, edge)).toBe("dash");
    expect(manifestFormatFor(true, { widevine: true, playready: false, fairplay: true })).toBe("dash");
  });

  it("keeps DASH for clear streams, Safari included", () => {
    expect(manifestFormatFor(false, safari)).toBe("dash");
  });

  it("keeps DASH when the browser offers no DRM at all", () => {
    expect(manifestFormatFor(true, { widevine: false, playready: false, fairplay: false })).toBe("dash");
  });
});

describe("probeKeySystems", () => {
  it("reports the key systems the browser grants", async () => {
    const requestMediaKeySystemAccess = vi.fn(async (id: string) => {
      if (id === "com.apple.fps") return {} as MediaKeySystemAccess;
      throw new Error("NotSupportedError");
    });
    expect(await probeKeySystems({ requestMediaKeySystemAccess } as unknown as Navigator)).toEqual(safari);
  });

  it("reports none without EME", async () => {
    expect(await probeKeySystems({} as Navigator)).toEqual({ widevine: false, playready: false, fairplay: false });
  });
});
