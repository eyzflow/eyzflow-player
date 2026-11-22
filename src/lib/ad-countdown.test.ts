import { describe, expect, it } from "vitest";
import { AdBreakSchedule } from "./ad-breaks";
import { CuePointSchedule, adCountdownLabel, countdownSeconds } from "./ad-countdown";

const scte = (id: string, start: number) => ({ schemeIdUri: "urn:scte:scte35:2014:xml+bin", id, startTime: start, endTime: start + 30 });

describe("countdownSeconds", () => {
  it("counts down the last 5 s before a break", () => {
    expect(countdownSeconds(24.9, [30])).toBeNull();
    expect(countdownSeconds(25, [30])).toBe(5);
    expect(countdownSeconds(25.1, [30])).toBe(5);
    expect(countdownSeconds(28.2, [30])).toBe(2);
    expect(countdownSeconds(29.9, [30])).toBe(1);
    expect(countdownSeconds(30, [30])).toBeNull();
  });

  it("uses the nearest break ahead", () => {
    expect(countdownSeconds(57, [30, 60, 90])).toBe(3);
    expect(countdownSeconds(10, [])).toBeNull();
  });
});

describe("AdBreakSchedule.upcomingStarts", () => {
  it("lists unplayed mid-roll markers, not the pre-roll", () => {
    const s = new AdBreakSchedule();
    s.addRegion(scte("pre", 0));
    s.addRegion(scte("a", 30));
    s.addRegion(scte("b", 60));
    expect(s.upcomingStarts()).toEqual([30, 60]);
    s.due(29.8, 30.1);
    expect(s.upcomingStarts()).toEqual([60]);
  });

  it("keeps a marker passed by seeking, which still plays when reached later", () => {
    const s = new AdBreakSchedule();
    s.addRegion(scte("a", 30));
    expect(s.due(27, 40)).toBeNull();
    expect(s.upcomingStarts()).toEqual([30]);
  });
});

describe("CuePointSchedule", () => {
  it("keeps mid-roll cue points only, and drops them once played through", () => {
    const c = new CuePointSchedule();
    c.set([{ start: 0 }, { start: 15 }, { start: -1 }]);
    expect(c.upcoming()).toEqual([15]);
    c.pass(10, 12); // seek-free play before it
    expect(c.upcoming()).toEqual([15]);
    c.pass(14.9, 15.1);
    expect(c.upcoming()).toEqual([]);
  });

  it("does not pass a cue point seeked over", () => {
    const c = new CuePointSchedule();
    c.set([{ start: 15 }]);
    c.pass(10, 20);
    expect(c.upcoming()).toEqual([15]);
  });
});

describe("adCountdownLabel", () => {
  it("speaks the viewer's language", () => {
    expect(adCountdownLabel(5, "en-GB")).toBe("Ad in 5");
    expect(adCountdownLabel(4, "de-DE")).toBe("Werbung in 4");
    expect(adCountdownLabel(3, "fr")).toBe("Publicité dans 3");
    expect(adCountdownLabel(2, "nl-BE")).toBe("Reclame over 2");
    expect(adCountdownLabel(1, "es")).toBe("Ad in 1");
  });
});
