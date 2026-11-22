import { describe, expect, it } from "vitest";
import { AnalyticsCollector, type MediaLike, type PlayerLike } from "./collector";

function setup(opts: { autoplay?: boolean; bandwidth?: number } = {}) {
  let t = 0;
  const video = Object.assign(new EventTarget(), { currentTime: 0, duration: 120, paused: true }) as MediaLike;
  const tracks = [{ active: true, bandwidth: opts.bandwidth ?? 1_000_000 }];
  const playerTarget = new EventTarget();
  const player: PlayerLike = {
    addEventListener: (e, fn) => playerTarget.addEventListener(e, fn),
    removeEventListener: (e, fn) => playerTarget.removeEventListener(e, fn),
    getVariantTracks: () => tracks,
  };
  const collector = new AnalyticsCollector(video, player, { autoplay: opts.autoplay ?? true, now: () => t });
  const fire = (name: string) => video.dispatchEvent(new Event(name));
  const firePlayer = (name: string, extra: Record<string, unknown> = {}) => playerTarget.dispatchEvent(Object.assign(new Event(name), extra));
  return {
    collector,
    video: video as MediaLike & { paused: boolean; currentTime: number },
    tracks,
    fire,
    firePlayer,
    at: (ms: number) => {
      t = ms;
    },
  };
}

describe("AnalyticsCollector", () => {
  it("counts startup from load (autoplay) and time played", () => {
    const { collector, fire, at } = setup();
    at(400);
    collector.markReady();
    at(900);
    fire("playing");
    at(10_900);
    expect(collector.metrics()).toMatchObject({ player_startup_ms: 400, video_startup_ms: 900, played_ms: 10_000, rebuffer_ms: 0 });
  });

  it("counts startup from pressing play without autoplay", () => {
    const { collector, fire, at } = setup({ autoplay: false });
    at(5_000);
    fire("play");
    at(5_700);
    fire("playing");
    expect(collector.metrics().video_startup_ms).toBe(700);
  });

  it("counts stalls after the first frame, not the initial load", () => {
    const { collector, fire, firePlayer, video, at } = setup();
    fire("waiting"); // before the first frame: startup, not a stall
    at(1_000);
    fire("playing");
    at(3_000);
    fire("waiting");
    at(4_500);
    fire("playing");
    at(5_000);
    firePlayer("buffering", { buffering: true });
    at(5_500);
    video.paused = false;
    firePlayer("buffering", { buffering: false });
    at(6_000);
    expect(collector.metrics()).toMatchObject({ rebuffer_count: 2, rebuffer_ms: 2_000, played_ms: 3_000 });
  });

  it("counts seeks and pauses, and keeps the furthest position", () => {
    const { collector, fire, video, at } = setup();
    fire("playing");
    at(2_000);
    video.currentTime = 2;
    fire("timeupdate");
    video.paused = true;
    fire("pause");
    at(5_000);
    fire("seeking");
    video.currentTime = 90;
    at(5_200);
    fire("seeked");
    fire("timeupdate");
    expect(collector.metrics()).toMatchObject({ seek_count: 1, paused_ms: 3_000, played_ms: 2_000, max_position_s: 90, duration_s: 120 });
    expect(collector.currentState).toBe("paused");
  });

  it("weights the average bitrate by time played and counts switches", () => {
    const { collector, fire, firePlayer, tracks, at } = setup({ bandwidth: 1_000_000 });
    collector.markReady();
    fire("playing");
    at(1_000);
    tracks[0].bandwidth = 4_000_000;
    firePlayer("adaptation");
    at(4_000);
    expect(collector.metrics()).toMatchObject({ avg_bitrate: 3_250_000, min_bitrate: 1_000_000, max_bitrate: 4_000_000, quality_switches: 1 });
  });

  it("keeps errors once each, at most 20, and returns unsent ones", () => {
    const { collector } = setup();
    let milestones = 0;
    collector.onMilestone = () => milestones++;
    for (let i = 0; i < 25; i++) collector.recordError({ code: 6007, category: 6, message: "license", fatal: false });
    const first = collector.takeErrors();
    expect(first).toHaveLength(20);
    expect(first[0]).toMatchObject({ n: 0, code: "6007", category: "6" });
    expect(collector.takeErrors()).toEqual([]);
    collector.returnErrors(first.slice(0, 2));
    expect(collector.takeErrors().map((e) => e.n)).toEqual([0, 1]);
    expect(milestones).toBe(25);
    collector.recordError({ code: 1001 });
    expect(collector.currentState).toBe("error");
  });

  it("leaves a pre-roll out of video startup and the time counters", () => {
    const { collector, fire, video, at } = setup({ autoplay: false });
    collector.markReady();
    at(1_000);
    fire("play"); // viewer presses play: the ad manager starts the pre-roll
    at(1_200);
    collector.beginAd();
    video.paused = true;
    fire("pause"); // the ad manager pauses the content
    at(16_200);
    expect(collector.metrics()).toMatchObject({ video_startup_ms: null, played_ms: 0, paused_ms: 0 });
    collector.endAd();
    video.paused = false;
    fire("play");
    at(16_500);
    fire("playing");
    at(26_500);
    expect(collector.metrics()).toMatchObject({ video_startup_ms: 500, played_ms: 10_000, paused_ms: 0 });
  });

  it("leaves a mid-roll out of the time played", () => {
    const { collector, fire, at } = setup();
    fire("playing");
    at(10_000);
    collector.beginAd();
    fire("pause");
    at(40_000);
    fire("playing"); // not counted: still in the ad break
    collector.endAd();
    at(45_000);
    expect(collector.metrics()).toMatchObject({ played_ms: 15_000, paused_ms: 0 });
    expect(collector.currentState).toBe("playing");
  });

  it("stops listening when destroyed", () => {
    const { collector, fire, at } = setup();
    collector.destroy();
    at(500);
    fire("playing");
    expect(collector.metrics().video_startup_ms).toBeNull();
  });
});
