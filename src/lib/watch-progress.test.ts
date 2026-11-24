import { afterEach, describe, expect, it, vi } from "vitest";
import { eyzflowWatchHistoryStore, WatchProgressRecorder, type WatchProgress, type WatchProgressStore } from "./watch-progress";

const CATALOGUE = "6f1e2d3c-4b5a-4968-8776-655443322110";

function setup(opts: { startTime?: number; fail?: boolean; store?: WatchProgressStore | null } = {}) {
  const saved: Array<WatchProgress & { final: boolean }> = [];
  const store: WatchProgressStore = {
    save: vi.fn(async (progress: WatchProgress, { final }: { final: boolean }) => {
      if (opts.fail) throw new Error("offline");
      saved.push({ ...progress, final });
    }),
  };
  const log = vi.fn();
  const recorder = new WatchProgressRecorder({
    catalogueId: CATALOGUE,
    offerId: "offer-1",
    store: () => (opts.store !== undefined ? opts.store : store),
    startTime: opts.startTime,
    log,
  });
  return { recorder, saved, store, log };
}

describe("WatchProgressRecorder", () => {
  it("saves at most every 10 s while playing, in whole seconds", async () => {
    const { recorder, saved } = setup();
    for (let t = 0.25; t <= 25; t += 0.25) recorder.report(t, 6000);
    await recorder.idle();
    expect(saved.map((s) => s.progressSeconds)).toEqual([1, 11, 21]);
    expect(saved[0]).toEqual({ catalogueId: CATALOGUE, offerId: "offer-1", progressSeconds: 1, completed: false, final: false });
  });

  it("doesn't save a film left at 0 s", async () => {
    const { recorder, saved } = setup();
    recorder.report(0.2, 6000);
    recorder.checkpoint(0.4, true);
    recorder.stop();
    await recorder.idle();
    expect(saved).toEqual([]);
  });

  it("ignores positions before the resume point again after a reload", async () => {
    const { recorder, saved } = setup({ startTime: 1800 });
    recorder.report(1850, 6000);
    recorder.reload();
    recorder.report(0, 6000);
    recorder.report(0.5, 6000);
    recorder.report(1800, 6000);
    await recorder.idle();
    expect(saved.map((s) => s.progressSeconds)).toEqual([1850, 1800]);
  });

  it("saves at once on a pause and does not repeat the same position", async () => {
    const { recorder, saved } = setup();
    recorder.report(42.4, 6000);
    recorder.checkpoint(42.6);
    recorder.checkpoint(47.1);
    await recorder.idle();
    expect(saved.map((s) => s.progressSeconds)).toEqual([42, 47]);
  });

  it("saves nothing before playback reaches the resume point", async () => {
    const { recorder, saved } = setup({ startTime: 1800 });
    recorder.report(0, 6000);
    recorder.checkpoint(0);
    recorder.report(1799.5, 6000);
    await recorder.idle();
    expect(saved.map((s) => s.progressSeconds)).toEqual([1799]);
  });

  it("follows a viewer who seeks back before the resume point", async () => {
    const { recorder, saved } = setup({ startTime: 1800 });
    recorder.seeked(60);
    recorder.report(61, 6000);
    await recorder.idle();
    expect(saved.map((s) => s.progressSeconds)).toEqual([60]);
  });

  it("saves the end as completed, once, and ignores later positions", async () => {
    const { recorder, saved } = setup();
    recorder.report(5990, 6000);
    recorder.finish();
    recorder.finish();
    recorder.report(10, 6000);
    recorder.stop();
    await recorder.idle();
    expect(saved.map((s) => [s.progressSeconds, s.completed])).toEqual([
      [5990, true],
      [6000, true],
    ]);
  });

  it("counts the last 5 % as watched", async () => {
    const { recorder, saved } = setup();
    recorder.report(5600, 6000);
    recorder.checkpoint(5750);
    await recorder.idle();
    expect(saved.map((s) => s.completed)).toEqual([false, true]);
  });

  it("sends the last position as final when it stops", async () => {
    const { recorder, saved } = setup();
    recorder.report(100, 6000);
    await recorder.idle();
    recorder.report(104, 6000);
    recorder.stop();
    recorder.stop();
    await recorder.idle();
    expect(saved.map((s) => [s.progressSeconds, s.final])).toEqual([
      [100, false],
      [104, true],
    ]);
  });

  it("drops waiting saves when the final one goes out, so an older position can't land after it", async () => {
    let release: () => void = () => {};
    let started: () => void = () => {};
    const onItsWay = new Promise<void>((r) => (started = r));
    const order: number[] = [];
    const store: WatchProgressStore = {
      save: async (p) => {
        if (p.progressSeconds === 10) {
          started();
          await new Promise<void>((r) => (release = r));
        }
        order.push(p.progressSeconds);
      },
    };
    const recorder = new WatchProgressRecorder({ catalogueId: CATALOGUE, store: () => store });
    recorder.report(10, 6000);
    await onItsWay;
    recorder.checkpoint(20); // waiting
    recorder.checkpoint(30, true); // the page closes
    release();
    await recorder.idle();
    expect(order).toEqual([30, 10]);
  });

  it("saves nothing when stopped before playback reached the resume point", async () => {
    const { recorder, saved } = setup({ startTime: 1800 });
    recorder.report(0, 6000);
    recorder.stop();
    await recorder.idle();
    expect(saved).toEqual([]);
  });

  it("keeps going after a failed save, and logs it", async () => {
    const { recorder, log } = setup({ fail: true });
    recorder.report(10, 6000);
    recorder.checkpoint(20);
    await recorder.idle();
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("saves nothing without a store", async () => {
    const { recorder, store } = setup({ store: null });
    recorder.report(10, 6000);
    await recorder.idle();
    expect(store.save).not.toHaveBeenCalled();
  });
});

describe("eyzflowWatchHistoryStore", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("PUTs the progress to the storefront's watch history with the viewer's authorization", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await eyzflowWatchHistoryStore({ storefrontId: "sf 1", authorization: "Bearer viewer" }).save(
      { catalogueId: CATALOGUE, progressSeconds: 1234, completed: false, offerId: "offer-1" },
      { final: true },
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.eyzflow.com/v1/content/storefront/sf%201/watch-history");
    expect(init.method).toBe("PUT");
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer viewer");
    expect(JSON.parse(init.body as string)).toEqual({
      catalogue_id: CATALOGUE,
      progress_seconds: 1234,
      completed: false,
      offer_id: "offer-1",
    });
  });

  it("throws when the API refuses it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    await expect(
      eyzflowWatchHistoryStore({ storefrontId: "sf1", authorization: "Bearer x" }).save(
        { catalogueId: CATALOGUE, progressSeconds: 1, completed: false },
        { final: false },
      ),
    ).rejects.toThrow("401");
  });
});
