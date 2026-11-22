import { describe, expect, it } from "vitest";
import { overlayMoment } from "./signal-overlay";
import type { StreamSignal } from "./stream-signals";

const credits: StreamSignal = { id: "closing_credits-3", type: "closing_credits", start: 50, end: 60, label: null };

describe("overlayMoment", () => {
  it("is the signal playback is in, then the end of the film", () => {
    expect(overlayMoment(credits, false)).toBe("signal:closing_credits-3");
    expect(overlayMoment(null, true)).toBe("ended");
  });

  it("prefers the signal when the film also ended (a seek back into the credits)", () => {
    expect(overlayMoment(credits, true)).toBe("signal:closing_credits-3");
  });

  it("is nothing outside a signal before the end", () => {
    expect(overlayMoment(null, false)).toBeNull();
  });
});
