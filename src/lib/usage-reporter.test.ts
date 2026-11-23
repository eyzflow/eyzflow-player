import { describe, expect, it, vi } from "vitest";
import { AnalyticsCollector, type MediaLike } from "./analytics/collector";
import { UsageReporter, type PlaybackEventBody, type UsageSendResult, type UsageTarget } from "./usage-reporter";

const target: UsageTarget = {
  storefrontId: "sf1",
  authorization: "Bearer viewer",
  offerId: "0b6c7c55-2a8e-4b1f-9d6e-1c2f3a4b5c6d",
  catalogueId: "6f1e2d3c-4b5a-4968-8776-655443322110",
};

function setup(results: UsageSendResult[] = []) {
  let played = 0;
  const media = new EventTarget();
  const sent: Array<{ body: PlaybackEventBody; final: boolean }> = [];
  const send = vi.fn(async (_t: UsageTarget, body: PlaybackEventBody, opts: { final: boolean }) => {
    sent.push({ body, final: opts.final });
    return results.shift() ?? "ok";
  });
  const reporter = new UsageReporter({ playedMs: () => played, target, media, send, sessionId: "sess-0001" });
  return { reporter, media, sent, play: (ms: number) => (played += ms) };
}

describe("UsageReporter", () => {
  it("reports the whole seconds played since the last report, with one session id", async () => {
    const { reporter, sent, play } = setup();
    play(30_400);
    await reporter.flush(false);
    play(29_800);
    await reporter.flush(false);
    expect(sent.map((s) => s.body.watched_seconds)).toEqual([30, 30]);
    expect(sent[0].body).toEqual({
      offer_id: target.offerId,
      catalogue_id: target.catalogueId,
      session_id: "sess-0001",
      watched_seconds: 30,
      is_trailer: false,
    });
  });

  it("sends nothing for less than a second", async () => {
    const { reporter, sent, play } = setup();
    play(900);
    await reporter.flush(false);
    expect(sent).toEqual([]);
  });

  it("sends at most 120 s at once and the rest with the next report", async () => {
    const { reporter, sent, play } = setup();
    play(200_000);
    await reporter.flush(false);
    await reporter.flush(false);
    expect(sent.map((s) => s.body.watched_seconds)).toEqual([120, 80]);
  });

  it("sends seconds again after a failed report, but not after a refused one", async () => {
    const { reporter, sent, play } = setup(["retry", "ok", "drop"]);
    play(10_000);
    await reporter.flush(false);
    play(5_000);
    await reporter.flush(false);
    play(7_000);
    await reporter.flush(false);
    play(3_000);
    await reporter.flush(false);
    expect(sent.map((s) => s.body.watched_seconds)).toEqual([10, 15, 7, 3]);
  });

  it("reports at once on pause and at the end", async () => {
    const { reporter, media, sent, play } = setup();
    reporter.start();
    play(12_000);
    media.dispatchEvent(new Event("pause"));
    await Promise.resolve();
    play(4_000);
    media.dispatchEvent(new Event("ended"));
    await Promise.resolve();
    reporter.stop();
    expect(sent.map((s) => s.body.watched_seconds)).toEqual([12, 4]);
  });

  it("sends one final report when stopped, and nothing after", async () => {
    const { reporter, sent, play } = setup();
    reporter.start();
    play(8_000);
    reporter.stop();
    reporter.stop();
    play(8_000);
    await reporter.flush(false);
    expect(sent.map((s) => [s.body.watched_seconds, s.final])).toEqual([[8, true]]);
  });

  it("leaves out a catalogue id that is not a UUID", async () => {
    const sent: PlaybackEventBody[] = [];
    const reporter = new UsageReporter({
      playedMs: () => 5_000,
      target: { ...target, catalogueId: "film-42" },
      send: async (_t, body) => (sent.push(body), "ok"),
    });
    await reporter.flush(false);
    expect(sent[0]).not.toHaveProperty("catalogue_id");
    expect(sent[0].session_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("counts no time for an ad break or a seek ahead", async () => {
    let now = 0;
    const video = Object.assign(new EventTarget(), { currentTime: 0, duration: 7200, paused: false }) as MediaLike;
    const collector = new AnalyticsCollector(video, null, { autoplay: true, now: () => now });
    const sent: PlaybackEventBody[] = [];
    const reporter = new UsageReporter({ playedMs: () => collector.metrics().played_ms, target, send: async (_t, b) => (sent.push(b), "ok") });

    video.dispatchEvent(new Event("playing"));
    now += 20_000; // 20 s of film
    collector.beginAd();
    now += 30_000; // a 30 s ad
    collector.endAd();
    now += 10_000; // 10 s more of film
    video.dispatchEvent(new Event("seeking"));
    video.currentTime = 1800; // jump 30 minutes ahead
    now += 1_000;
    video.dispatchEvent(new Event("seeked"));
    now += 5_000; // 5 s more of film
    await reporter.flush(false);
    expect(sent.map((b) => b.watched_seconds)).toEqual([35]);
  });
});
