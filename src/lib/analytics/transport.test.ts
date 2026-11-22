import { describe, expect, it, vi } from "vitest";
import { AnalyticsCollector, type MediaLike } from "./collector";
import { BeatTransport } from "./transport";
import type { Beat } from "./types";

function setup(send: (body: string, opts: { final: boolean }) => Promise<boolean> = async () => true) {
  const video = Object.assign(new EventTarget(), { currentTime: 0, duration: 60, paused: true }) as MediaLike;
  const collector = new AnalyticsCollector(video, null, { autoplay: true, now: () => 0 });
  const sent: Array<{ beat: Beat; final: boolean }> = [];
  const sender = vi.fn(async (body: string, opts: { final: boolean }) => {
    sent.push({ beat: JSON.parse(body) as Beat, final: opts.final });
    return send(body, opts);
  });
  let token: string | null = "plk1.t1";
  const transport = new BeatTransport(collector, {
    getToken: () => token,
    streamId: "s1",
    intervalSeconds: 60,
    isLive: () => false,
    autoplay: true,
    drm: () => "widevine",
    send: sender,
    impressionId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  });
  return { transport, collector, video, sent, setToken: (t: string | null) => (token = t) };
}

describe("BeatTransport", () => {
  it("sends a beat at once on the first frame, with a growing seq and the current token", async () => {
    const { transport, video, sent, setToken } = setup();
    video.dispatchEvent(new Event("playing"));
    await Promise.resolve();
    setToken("plk1.t2");
    await transport.beat(false);
    expect(sent.map((s) => [s.beat.seq, s.beat.token])).toEqual([[1, "plk1.t1"], [2, "plk1.t2"]]);
    expect(sent[0].beat).toMatchObject({ sid: "3f2504e0-4f89-41d3-9a0c-0305e82c3301", stream_id: "s1", final: false, drm: "widevine", is_live: false, autoplay: true });
    expect(sent[0].beat.m.video_startup_ms).toBe(0);
  });

  it("sends errors once, and again with the next beat when sending failed", async () => {
    let ok = false;
    const { transport, collector, sent } = setup(async () => ok);
    collector.recordError({ code: 3016, fatal: false });
    await new Promise((resolve) => setTimeout(resolve, 0)); // the failed first beat has handed its errors back
    ok = true;
    await transport.beat(false);
    await transport.beat(false);
    expect(sent.map((s) => s.beat.errors.map((e) => e.n))).toEqual([[0], [0], []]);
  });

  it("sends nothing without a token", async () => {
    const { transport, sent, setToken } = setup();
    setToken(null);
    await transport.beat(false);
    expect(sent).toEqual([]);
  });

  it("sends one final beat when stopped, and nothing after", async () => {
    const { transport, sent } = setup();
    transport.start();
    transport.stop();
    transport.stop();
    await Promise.resolve();
    await transport.beat(false);
    expect(sent.map((s) => [s.beat.seq, s.final])).toEqual([[1, true]]);
  });
});
