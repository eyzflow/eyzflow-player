import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, type PlayerConfig } from "./config-types";
import { endScreenLabels, endScreenPhase, endScreenSettings, formatRuntime } from "./end-screen";
import type { StreamSignal } from "./stream-signals";

const film = { streamId: "a", title: "Film A" };
const credits: StreamSignal = { id: "c", type: "closing_credits", start: 50, end: 60, label: null };
const intro: StreamSignal = { id: "i", type: "intro", start: 5, end: 65, label: null };

function config(patch: Partial<PlayerConfig> = {}): PlayerConfig {
  return { ...DEFAULT_CONFIG, ...patch, features: { ...DEFAULT_CONFIG.features, ...patch.features } };
}

describe("endScreenSettings", () => {
  it("is on with something to show, with the defaults", () => {
    expect(endScreenSettings(config(), { items: [film] })).toEqual({
      enabled: true,
      autoplaySeconds: 10,
      showAt: "credits",
      shrinkVideo: true,
    });
  });

  it("is off without items or a next stream", () => {
    expect(endScreenSettings(config(), undefined).enabled).toBe(false);
    expect(endScreenSettings(config(), { items: [] }).enabled).toBe(false);
    expect(endScreenSettings(config(), { nextUp: film }).enabled).toBe(true);
  });

  it("is off when the config or the prop switches it off", () => {
    expect(endScreenSettings(config({ features: { ...DEFAULT_CONFIG.features, endScreen: false } }), { items: [film] }).enabled).toBe(false);
    expect(endScreenSettings(config(), { items: [film], enabled: false }).enabled).toBe(false);
  });

  it("takes the remote settings where the prop leaves them out, and clamps the countdown", () => {
    const remote = config({ endScreen: { autoplaySeconds: 5, showAt: "end", shrinkVideo: false } });
    expect(endScreenSettings(remote, { items: [film] })).toMatchObject({ autoplaySeconds: 5, showAt: "end", shrinkVideo: false });
    expect(endScreenSettings(remote, { items: [film], showAt: "credits", shrinkVideo: true, nextUp: { ...film, autoplaySeconds: 99 } }))
      .toMatchObject({ autoplaySeconds: 30, showAt: "credits", shrinkVideo: true });
    expect(endScreenSettings(config({ endScreen: { autoplaySeconds: 0 } }), { items: [film] }).autoplaySeconds).toBe(0);
  });
});

describe("endScreenPhase", () => {
  const on = endScreenSettings(config(), { items: [film] });

  it("shows over the closing credits and after the end", () => {
    expect(endScreenPhase(on, credits, false)).toBe("credits");
    expect(endScreenPhase(on, null, true)).toBe("ended");
    expect(endScreenPhase(on, intro, false)).toBeNull();
    expect(endScreenPhase(on, null, false)).toBeNull();
  });

  it("with showAt end, only after the end", () => {
    const atEnd = { ...on, showAt: "end" as const };
    expect(endScreenPhase(atEnd, credits, false)).toBeNull();
    expect(endScreenPhase(atEnd, null, true)).toBe("ended");
  });

  it("never when off", () => {
    expect(endScreenPhase({ ...on, enabled: false }, credits, true)).toBeNull();
  });
});

describe("formatRuntime and labels", () => {
  it("formats lengths", () => {
    expect(formatRuntime(5520)).toBe("1 h 32 min");
    expect(formatRuntime(2700)).toBe("45 min");
    expect(formatRuntime(7200)).toBe("2 h");
    expect(formatRuntime(undefined)).toBe("");
    expect(formatRuntime(30)).toBe("");
  });

  it("speaks the viewer's language", () => {
    expect(endScreenLabels("de-DE").nextIn(5)).toBe("Weiter in 5");
    expect(endScreenLabels("fr").moreLikeThis).toBe("Titres similaires");
    expect(endScreenLabels("ja").upNext).toBe("Up next");
  });
});
