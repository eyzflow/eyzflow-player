import { describe, expect, it } from "vitest";
import { DEFAULT_SEEK_STEPS, seekSteps, seekTarget } from "./seek-steps";

describe("seekSteps", () => {
  it("defaults to 5 s for the arrow keys and 10 s for the buttons", () => {
    expect(seekSteps()).toEqual(DEFAULT_SEEK_STEPS);
    expect(seekSteps({}, {})).toEqual({ arrowKeys: 5, buttons: 10 });
  });
  it("takes the config's steps", () => {
    expect(seekSteps({ arrowKeySeconds: 3, buttonSeconds: 15 })).toEqual({ arrowKeys: 3, buttons: 15 });
  });
  it("lets the player's own steps win over the config", () => {
    expect(seekSteps({ arrowKeySeconds: 3, buttonSeconds: 15 }, { buttonSeconds: 30 })).toEqual({ arrowKeys: 3, buttons: 30 });
  });
  it("ignores invalid steps and rounds to whole seconds", () => {
    expect(seekSteps({ arrowKeySeconds: 0, buttonSeconds: -10 })).toEqual(DEFAULT_SEEK_STEPS);
    expect(seekSteps({ arrowKeySeconds: Number.NaN }, { buttonSeconds: Infinity })).toEqual(DEFAULT_SEEK_STEPS);
    expect(seekSteps({ arrowKeySeconds: 7.4, buttonSeconds: 9999 })).toEqual({ arrowKeys: 7, buttons: 600 });
  });
  it("accepts numbers sent as strings", () => {
    expect(seekSteps({ arrowKeySeconds: "8" as unknown as number })).toEqual({ arrowKeys: 8, buttons: 10 });
  });
});

describe("seekTarget", () => {
  it("adds the step", () => {
    expect(seekTarget(20, 5, 100)).toBe(25);
    expect(seekTarget(20, -10, 100)).toBe(10);
  });
  it("stays inside the stream", () => {
    expect(seekTarget(3, -10, 100)).toBe(0);
    expect(seekTarget(97, 10, 100)).toBe(100);
  });
  it("has no end before the duration is known", () => {
    expect(seekTarget(20, 10, Number.NaN)).toBe(30);
    expect(seekTarget(20, 10, 0)).toBe(30);
  });
});
