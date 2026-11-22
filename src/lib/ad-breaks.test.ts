import { describe, expect, it } from "vitest";
import { AdBreakSchedule, adBreakFromRegion } from "./ad-breaks";

const SCTE35 = "urn:scte:scte35:2014:xml+bin";
const region = (id: string, start: number, end = start, scheme = SCTE35) => ({ schemeIdUri: scheme, id, startTime: start, endTime: end });

describe("adBreakFromRegion", () => {
  it("reads a SCTE-35 region as an ad break, with the pod length when there is one", () => {
    expect(adBreakFromRegion(region("1", 120, 150))).toEqual({ id: "1", start: 120, duration: 30 });
    expect(adBreakFromRegion(region("2", 300))).toEqual({ id: "2", start: 300, duration: null });
  });

  it("ignores intro, credits and other regions", () => {
    expect(adBreakFromRegion(region("1", 10, 70, "urn:eyzflow:signal"))).toBeNull();
  });
});

describe("AdBreakSchedule", () => {
  function schedule(...regions: ReturnType<typeof region>[]) {
    const s = new AdBreakSchedule();
    for (const r of regions) s.addRegion(r);
    return s;
  }

  it("has no breaks for a stream without ad markers", () => {
    const s = schedule(region("intro", 0, 60, "urn:eyzflow:signal"));
    expect(s.hasBreaks).toBe(false);
    expect(s.takePreroll()).toBeNull();
    expect(s.due(0, 1)).toBeNull();
  });

  it("plays a break at the start as the pre-roll, once", () => {
    const s = schedule(region("1", 0), region("2", 600));
    expect(s.takePreroll()?.id).toBe("1");
    expect(s.takePreroll()).toBeNull();
    expect(s.due(0, 0.3)).toBeNull();
  });

  it("plays a mid-roll when playback passes its marker, once", () => {
    const s = schedule(region("1", 120, 150));
    expect(s.takePreroll()).toBeNull();
    expect(s.due(119.6, 119.9)).toBeNull();
    expect(s.due(119.9, 120.2)).toEqual({ id: "1", start: 120, duration: 30 });
    expect(s.due(119.9, 120.2)).toBeNull(); // played: rewinding over it does not play it again
  });

  it("skips breaks passed by seeking", () => {
    const s = schedule(region("1", 120));
    expect(s.due(10, 500)).toBeNull();
    expect(s.due(500, 10)).toBeNull();
    // Not played yet: watching through it later still plays it.
    expect(s.due(119.8, 120.1)?.id).toBe("1");
  });

  it("plays only the last of several breaks crossed in one step", () => {
    const s = schedule(region("1", 100), region("2", 100.5));
    expect(s.due(99.8, 100.6)?.id).toBe("2");
    expect(s.due(99.8, 100.6)).toBeNull();
  });
});
