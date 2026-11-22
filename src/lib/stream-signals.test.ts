import { describe, expect, it } from "vitest";
import { SIGNAL_SCHEME, SignalSchedule, signalFromRegion, skipButtonFor, skipSignalLabel } from "./stream-signals";

const region = (id: string, start: number, end: number, messageData?: string, scheme = SIGNAL_SCHEME) => ({
  schemeIdUri: scheme,
  id,
  startTime: start,
  endTime: end,
  eventNode: messageData === undefined ? null : { attributes: { messageData } },
});

describe("signalFromRegion", () => {
  it("reads the type and the label from messageData", () => {
    expect(signalFromRegion(region("1", 5, 65, "intro"))).toEqual({ id: "intro-1", type: "intro", start: 5, end: 65, label: null });
    expect(signalFromRegion(region("2", 0, 40, "recap: Previously on"))).toEqual({
      id: "recap-2",
      type: "recap",
      start: 0,
      end: 40,
      label: "Previously on",
    });
    expect(signalFromRegion(region("3", 5400, 5600, "closing_credits:A: B"))?.label).toBe("A: B");
  });

  it("ignores ad breaks, unknown types and empty spans", () => {
    expect(signalFromRegion(region("1", 120, 150, "intro", "urn:scte:scte35:2014:xml+bin"))).toBeNull();
    expect(signalFromRegion(region("2", 5, 65, "ad_break"))).toBeNull();
    expect(signalFromRegion(region("3", 5, 65))).toBeNull();
    expect(signalFromRegion(region("4", 65, 65, "intro"))).toBeNull();
    expect(signalFromRegion(region("5", 5, Number.NaN, "intro"))).toBeNull();
  });
});

describe("SignalSchedule", () => {
  function schedule(...regions: ReturnType<typeof region>[]) {
    const s = new SignalSchedule();
    for (const r of regions) s.addRegion(r);
    return s;
  }

  it("is in a signal from its start until just before its end", () => {
    const s = schedule(region("1", 5, 65, "intro"));
    expect(s.at(4.9)).toBeNull();
    expect(s.at(5)?.type).toBe("intro");
    expect(s.at(64.7)?.type).toBe("intro");
    // A skip lands on the end: the button goes away.
    expect(s.at(65)).toBeNull();
    expect(s.at(64.8)).toBeNull();
  });

  it("picks the span that started last when two overlap", () => {
    const s = schedule(region("1", 0, 120, "opening_credits"), region("2", 30, 90, "intro"));
    expect(s.at(10)?.type).toBe("opening_credits");
    expect(s.at(40)?.type).toBe("intro");
    expect(s.at(100)?.type).toBe("opening_credits");
  });

  it("keeps one signal per region id when Shaka reports a region twice", () => {
    const s = schedule(region("1", 5, 65, "intro"), region("1", 5, 65, "intro"));
    expect(s.size).toBe(1);
  });
});

describe("skipSignalLabel", () => {
  it("speaks the viewer's language, English otherwise", () => {
    expect(skipSignalLabel("intro", "en-US")).toBe("Skip intro");
    expect(skipSignalLabel("closing_credits", "de-DE")).toBe("Abspann überspringen");
    expect(skipSignalLabel("recap", "fr")).toBe("Passer le récap");
    expect(skipSignalLabel("opening_credits", "nl-BE")).toBe("Begintiteling overslaan");
    expect(skipSignalLabel("intro", "ja")).toBe("Skip intro");
  });
});

describe("skipButtonFor", () => {
  it("defaults to intro, recap and opening credits, not closing credits", () => {
    expect(skipButtonFor("intro")).toBe(true);
    expect(skipButtonFor("recap")).toBe(true);
    expect(skipButtonFor("opening_credits")).toBe(true);
    expect(skipButtonFor("closing_credits")).toBe(false);
  });

  it("follows the config's section, the defaults for types it leaves out", () => {
    const types = { recap: false, closingCredits: true };
    expect(skipButtonFor("recap", types)).toBe(false);
    expect(skipButtonFor("closing_credits", types)).toBe(true);
    expect(skipButtonFor("intro", types)).toBe(true);
  });
});
