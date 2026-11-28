import { describe, expect, it } from "vitest";
import { slideStep, type SlideState } from "./recap-slide-step";

const start: SlideState = { index: 0, done: false, run: 0, from: null, dir: 1 };

describe("slideStep", () => {
  it("keeps the slide before as the one leaving, with the direction", () => {
    const next = slideStep(start, { type: "go", to: 1, count: 5 });
    expect(next).toEqual({ index: 1, done: false, run: 1, from: 0, dir: 1 });
    expect(slideStep(next, { type: "go", to: 0, count: 5 })).toEqual({ index: 0, done: false, run: 2, from: 1, dir: -1 });
  });

  it("drops the leaving slide once its run settles, and ignores a late settle", () => {
    const a = slideStep(start, { type: "go", to: 1, count: 5 });
    const b = slideStep(a, { type: "go", to: 2, count: 5 });
    expect(slideStep(b, { type: "settle", run: 1 })).toBe(b);
    expect(slideStep(b, { type: "settle", run: 2 }).from).toBeNull();
  });

  it("stays within the slides, and finishing keeps the slide", () => {
    expect(slideStep(start, { type: "go", to: 9, count: 3 }).index).toBe(2);
    expect(slideStep(start, { type: "go", to: -1, count: 3 }).index).toBe(0);
    expect(slideStep({ ...start, index: 2 }, { type: "finish" })).toMatchObject({ index: 2, done: true, run: 0 });
  });
});
