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
      secondsBeforeEnd: 20,
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
  const at = (signal: StreamSignal | null, ended: boolean, position = 0, hasClosingCredits = true) => ({
    signal,
    ended,
    position,
    duration: 600,
    hasClosingCredits,
  });

  it("shows over the closing credits and after the end", () => {
    expect(endScreenPhase(on, at(credits, false))).toBe("credits");
    expect(endScreenPhase(on, at(null, true))).toBe("ended");
    expect(endScreenPhase(on, at(intro, false))).toBeNull();
    expect(endScreenPhase(on, at(null, false, 590))).toBeNull();
  });

  it("without a closing credits signal, the last 20 s count as the credits", () => {
    expect(endScreenPhase(on, at(null, false, 579, false))).toBeNull();
    expect(endScreenPhase(on, at(null, false, 580, false))).toBe("credits");
    expect(endScreenPhase({ ...on, secondsBeforeEnd: 45 }, at(null, false, 556, false))).toBe("credits");
    expect(endScreenPhase({ ...on, secondsBeforeEnd: 0 }, at(null, false, 595, false))).toBeNull();
    expect(endScreenPhase(on, { ...at(null, false, 580, false), duration: 0 })).toBeNull();
  });

  it("with showAt end, only after the end", () => {
    const atEnd = { ...on, showAt: "end" as const };
    expect(endScreenPhase(atEnd, at(credits, false))).toBeNull();
    expect(endScreenPhase(atEnd, at(null, false, 590, false))).toBeNull();
    expect(endScreenPhase(atEnd, at(null, true))).toBe("ended");
  });

  it("never when off", () => {
    expect(endScreenPhase({ ...on, enabled: false }, at(credits, true))).toBeNull();
  });

  it("reads secondsBeforeEnd from the config and the prop, clamped", () => {
    expect(endScreenSettings(config({ endScreen: { secondsBeforeEnd: 40 } }), { items: [film] }).secondsBeforeEnd).toBe(40);
    expect(endScreenSettings(config(), { items: [film], secondsBeforeEnd: 500 }).secondsBeforeEnd).toBe(120);
    expect(endScreenSettings(config(), { items: [film], secondsBeforeEnd: 0 }).secondsBeforeEnd).toBe(0);
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
