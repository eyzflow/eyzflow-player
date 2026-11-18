import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquirePlayerLicense, embedding, LicenseSession, PlayerLicenseException, type PlayerLicense } from "./license";

const ok = (over: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ token: "plk1.a.b", expires_in: 900, refresh_after: 600, mode: "enforce", would_refuse: null, analytics: { enabled: true, heartbeat_interval_seconds: 60 }, ...over }), { status: 200 });

describe("acquirePlayerLicense", () => {
  it("posts the key as a simple text/plain request and reads the licence", async () => {
    const fetchImpl = vi.fn(async () => ok());
    const out = await acquirePlayerLicense({ key: "pk_x", streamId: "s1" }, fetchImpl as unknown as typeof fetch);
    expect(out).toEqual({ token: "plk1.a.b", expiresIn: 900, refreshAfter: 600, mode: "enforce", wouldRefuse: null, analytics: { enabled: true, heartbeatIntervalSeconds: 60 } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/v1\/player\/license$/);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("text/plain;charset=UTF-8");
    expect(JSON.parse(init.body as string)).toMatchObject({ key: "pk_x", stream_id: "s1", top_level: true });
  });

  it("throws a PlayerLicenseException with a viewer message on a refusal", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: "DOMAIN_NOT_ALLOWED", message: "x" }), { status: 403 }));
    const error = await acquirePlayerLicense({ key: "pk_x", streamId: "s1" }, fetchImpl as unknown as typeof fetch).catch((e) => e);
    expect(error).toBeInstanceOf(PlayerLicenseException);
    expect(error.license).toEqual({ code: "DOMAIN_NOT_ALLOWED", message: "This video cannot be played on this site." });
  });

  it("throws a plain Error when the check cannot be reached", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad gateway", { status: 502 }));
    const error = await acquirePlayerLicense({ key: "pk_x", streamId: "s1" }, fetchImpl as unknown as typeof fetch).catch((e) => e);
    expect(error).not.toBeInstanceOf(PlayerLicenseException);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("embedding", () => {
  const frame = (ancestors: string[] | null, referrer = "") =>
    ({
      self: 1,
      top: 2,
      location: ancestors ? { ancestorOrigins: { length: ancestors.length, item: (i: number) => ancestors[i] } } : {},
      document: { referrer },
    }) as unknown as Window;

  it("names every embedding page, nearest first", () => {
    expect(embedding(frame(["https://a.com", "https://b.com"]))).toEqual({ embedder_origins: ["https://a.com", "https://b.com"], top_level: false });
  });

  it("falls back to the referrer's origin (Firefox)", () => {
    expect(embedding(frame(null, "https://a.com/page?x=1"))).toEqual({ embedder_origins: ["https://a.com"], top_level: false });
  });

  it("says when it is the page itself", () => {
    const win: Record<string, unknown> = { location: {}, document: {} };
    win.self = win;
    win.top = win;
    expect(embedding(win as unknown as Window)).toEqual({ top_level: true });
  });
});

describe("LicenseSession", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const licence = (token: string): PlayerLicense => ({ token, expiresIn: 900, refreshAfter: 600, mode: "enforce", wouldRefuse: null, analytics: { enabled: true, heartbeatIntervalSeconds: 60 } });

  it("renews the token after refresh_after and retries a failed renewal a minute later", async () => {
    const acquire = vi
      .fn()
      .mockResolvedValueOnce(licence("t1"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(licence("t2"));
    const session = await LicenseSession.start({ key: "pk", streamId: "s" }, vi.fn(), acquire);
    expect(session.token).toBe("t1");
    await vi.advanceTimersByTimeAsync(600_000);
    expect(session.token).toBe("t1");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(session.token).toBe("t2");
    session.stop();
  });

  it("reports a refusal once and stops", async () => {
    const refused = vi.fn();
    const acquire = vi
      .fn()
      .mockResolvedValueOnce(licence("t1"))
      .mockRejectedValue(new PlayerLicenseException({ code: "PLAYER_KEY_INVALID", message: "x" }));
    await LicenseSession.start({ key: "pk", streamId: "s" }, refused, acquire);
    await vi.advanceTimersByTimeAsync(600_000 * 3);
    expect(refused).toHaveBeenCalledTimes(1);
    expect(acquire).toHaveBeenCalledTimes(2);
  });
});
