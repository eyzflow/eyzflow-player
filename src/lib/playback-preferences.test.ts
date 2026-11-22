import { describe, expect, it } from "vitest";
import { audioPreference, bitrateRestrictions, defaultThumbnailsUrl, matchesLanguage } from "./playback-preferences";

describe("matchesLanguage", () => {
  it("ignores region and case", () => {
    expect(matchesLanguage("de-DE", "de")).toBe(true);
    expect(matchesLanguage("DE", "de-at")).toBe(true);
    expect(matchesLanguage("fr", "de")).toBe(false);
  });
  it("matches three-letter codes", () => {
    expect(matchesLanguage("deu", "de")).toBe(true);
    expect(matchesLanguage("fre", "fr")).toBe(true);
    expect(matchesLanguage("dut", "nl-BE")).toBe(true);
  });
  it("never matches missing or undetermined languages", () => {
    expect(matchesLanguage("und", "und")).toBe(false);
    expect(matchesLanguage("", "de")).toBe(false);
    expect(matchesLanguage("de", undefined)).toBe(false);
  });
});

describe("audioPreference", () => {
  it("is null without a language", () => {
    expect(audioPreference("")).toBeNull();
    expect(audioPreference(undefined)).toBeNull();
  });
  it("keeps Shaka's other defaults", () => {
    expect(audioPreference("fr")).toEqual({ language: "fr", role: "", label: "", channelCount: 2, codec: "" });
  });
});

describe("bitrateRestrictions", () => {
  it("caps the bandwidth", () => {
    expect(bitrateRestrictions(5_000_000)).toEqual({ maxBandwidth: 5_000_000 });
  });
  it("ignores missing or invalid caps", () => {
    expect(bitrateRestrictions(undefined)).toBeNull();
    expect(bitrateRestrictions(0)).toBeNull();
    expect(bitrateRestrictions(Number.NaN)).toBeNull();
  });
});

it("builds the default thumbnails url", () => {
  expect(defaultThumbnailsUrl("https://stream.eyzflow.com", "abc")).toBe("https://stream.eyzflow.com/abc/thumbnails/thumbnail.vtt");
});
