import { describe, expect, it } from "vitest";
import {
  audioOptionsFrom,
  castAudioOptions,
  castHandback,
  castTextTracks,
  castTrackForLanguage,
  castForcedTrackFor,
  castSubtitlesOn,
  forcedTextTrackFor,
  withSubtitlesOff,
  matchingTrack,
  shakaAudioTrackFor,
  withActiveTrack,
  type CastTrack,
} from "./media-tracks";
import type { ShakaAudioTrack } from "./shaka-types";

const audio = (language: string, active = false, channelsCount = 2, label: string | null = null): ShakaAudioTrack => ({
  language,
  label,
  active,
  channelsCount,
  roles: [],
});

describe("audioOptionsFrom", () => {
  it("collapses one language's channel layouts into one option and finds the active one", () => {
    const { options, active } = audioOptionsFrom([audio("de", false, 2), audio("de", false, 6), audio("en", true, 2)]);
    expect(options.map((o) => o.language)).toEqual(["de", "en"]);
    expect(active?.language).toBe("en");
  });
  it("keeps differently labelled tracks of one language apart", () => {
    const { options } = audioOptionsFrom([audio("en", true, 2, "English"), audio("en", false, 2, "Commentary")]);
    expect(options).toHaveLength(2);
  });
});

describe("shakaAudioTrackFor", () => {
  it("keeps the playing channel layout when the language has it", () => {
    const tracks = [audio("en", true, 6), audio("de", false, 2), audio("de", false, 6)];
    const { options } = audioOptionsFrom(tracks);
    expect(shakaAudioTrackFor(tracks, options.find((o) => o.language === "de")!)?.channelsCount).toBe(6);
  });
});

const castTracks: CastTrack[] = [
  { trackId: 1, type: "VIDEO" },
  { trackId: 2, type: "AUDIO", language: "de", name: "Deutsch" },
  { trackId: 3, type: "AUDIO", language: "en" },
  { trackId: 4, type: "TEXT", language: "de", name: "Deutsch", subtype: "SUBTITLES" },
  { trackId: 5, type: "TEXT", language: "en-US" },
];

describe("castTextTracks", () => {
  it("lists the TV's subtitles with the one on", () => {
    const { tracks, active } = castTextTracks(castTracks, [2, 5]);
    expect(tracks.map((t) => t.id)).toEqual([4, 5]);
    expect(tracks[0].label).toBe("Deutsch");
    expect(active?.id).toBe(5);
  });
  it("reports subtitles off when none is active", () => {
    expect(castTextTracks(castTracks, [2]).active).toBeNull();
  });
});

describe("castAudioOptions", () => {
  it("lists the TV's audio with the one playing", () => {
    const { options, active } = castAudioOptions(castTracks, [3]);
    expect(options.map((o) => o.id)).toEqual(["2", "3"]);
    expect(active?.language).toBe("en");
  });
  it("takes the first when the receiver names none", () => {
    expect(castAudioOptions(castTracks, []).active?.id).toBe("2");
  });
});

describe("withActiveTrack", () => {
  it("replaces only the switched kind", () => {
    expect(withActiveTrack(castTracks, [2, 4], "TEXT", 5)).toEqual([2, 5]);
    expect(withActiveTrack(castTracks, [2, 4], "AUDIO", 3)).toEqual([4, 3]);
  });
  it("turns subtitles off with null", () => {
    expect(withActiveTrack(castTracks, [2, 4], "TEXT", null)).toEqual([2]);
  });
});

describe("castTrackForLanguage", () => {
  it("matches the language ignoring region", () => {
    expect(castTrackForLanguage(castTracks, "TEXT", "en")?.trackId).toBe(5);
    expect(castTrackForLanguage(castTracks, "AUDIO", "de-DE")?.trackId).toBe(2);
    expect(castTrackForLanguage(castTracks, "TEXT", "fr")).toBeNull();
    expect(castTrackForLanguage(castTracks, "TEXT", null)).toBeNull();
  });
  it("prefers the track with the same label", () => {
    const tracks: CastTrack[] = [
      { trackId: 1, type: "AUDIO", language: "de", name: "German stereo" },
      { trackId: 2, type: "AUDIO", language: "de", name: "German 5.1" },
    ];
    expect(castTrackForLanguage(tracks, "AUDIO", "de", "German 5.1")?.trackId).toBe(2);
    expect(castTrackForLanguage(tracks, "AUDIO", "de", "Commentary")?.trackId).toBe(1);
  });
});

describe("castHandback", () => {
  it("hands back the TV's subtitle and audio", () => {
    expect(castHandback(castTracks, [1, 2, 5])).toEqual({
      text: { language: "en-US", label: null },
      audio: { language: "de", label: "Deutsch" },
    });
  });
  it("hands back subtitles off when none is active", () => {
    expect(castHandback(castTracks, [3])).toEqual({ text: null, audio: { language: "en", label: null } });
  });
  it("leaves the audio to the browser when the TV names none", () => {
    expect(castHandback(castTracks, [4])?.audio).toBeNull();
  });
  it("hands back nothing when the TV reported no tracks", () => {
    expect(castHandback([], [])).toBeNull();
    expect(castHandback([{ trackId: 1, type: "VIDEO" }], [1])).toBeNull();
  });
  it("hands back nothing when the TV's subtitle has no language", () => {
    expect(castHandback([...castTracks, { trackId: 6, type: "TEXT" }], [2, 6])).toBeNull();
  });
});

describe("matchingTrack", () => {
  const options = [
    { id: "de|German stereo", language: "de", label: "German stereo" },
    { id: "de|German 5.1", language: "de", label: "German 5.1" },
    { id: "en|", language: "en", label: null },
  ];
  it("prefers the same label, then the language ignoring region", () => {
    expect(matchingTrack(options, { language: "de", label: "German 5.1" })?.id).toBe("de|German 5.1");
    expect(matchingTrack(options, { language: "de-DE", label: "Commentary" })?.id).toBe("de|German stereo");
    expect(matchingTrack(options, { language: "en-US", label: null })?.id).toBe("en|");
  });
  it("finds nothing for a language the browser's stream lacks", () => {
    expect(matchingTrack(options, { language: "fr", label: null })).toBeNull();
  });
  it("matches the browser's subtitle tracks to the TV's", () => {
    const { tracks } = castTextTracks(castTracks, []);
    const handback = castHandback(castTracks, [4]);
    expect(matchingTrack(tracks, handback!.text!)?.id).toBe(4);
  });
});

describe("forced subtitles", () => {
  const tv: CastTrack[] = [
    { trackId: 1, type: "AUDIO", language: "de" },
    { trackId: 2, type: "AUDIO", language: "en" },
    { trackId: 3, type: "TEXT", language: "de" },
    { trackId: 5, type: "TEXT", language: "de", roles: ["forced-subtitle"] },
    { trackId: 6, type: "TEXT", language: "en", roles: ["forced-subtitle"] },
  ];

  it("leaves the TV's forced tracks out of the menu, and one playing reads as off", () => {
    const text = castTextTracks(tv, [1, 5]);
    expect(text.tracks.map((t) => t.id)).toEqual([3]);
    expect(text.active).toBeNull();
    expect(castSubtitlesOn(tv, [1, 5])).toBe(false);
    expect(castSubtitlesOn(tv, [1, 3])).toBe(true);
  });

  it("plays the forced track of the TV's audio when subtitles go off", () => {
    expect(castForcedTrackFor(tv, [2])).toBe(6);
    expect(withSubtitlesOff(tv, [1, 3])).toEqual([1, 5]);
    expect(withSubtitlesOff(tv, [2, 5])).toEqual([2, 6]);
  });

  it("never picks a forced track for a language", () => {
    expect(castTrackForLanguage(tv, "TEXT", "en")).toBeNull();
    expect(castTrackForLanguage(tv, "TEXT", "de")?.trackId).toBe(3);
  });

  it("hands back off when only a forced track plays", () => {
    expect(castHandback(tv, [1, 5])?.text).toBeNull();
  });

  it("finds the browser's forced track for the audio language", () => {
    const tracks = [
      { id: 1, active: false, type: "text", language: "de", label: null, kind: null, mimeType: null },
      { id: 2, active: false, type: "text", language: "de", label: null, kind: null, mimeType: null, forced: true },
    ];
    expect(forcedTextTrackFor(tracks, "de-DE")?.id).toBe(2);
    expect(forcedTextTrackFor(tracks, "en")).toBeNull();
    expect(forcedTextTrackFor(tracks, null)).toBeNull();
  });
});
