import { afterEach, describe, expect, it, vi } from "vitest";
import { closePlaybackSession, heartbeatPlaybackSession, sessionHeaders } from "./playback-session";

const target = { storefrontId: "sf-1", authorization: "Bearer t", deviceId: "dev-1" };

afterEach(() => vi.unstubAllGlobals());

describe("playback session requests", () => {
  it("sends Content-Type only with a JSON body", () => {
    expect(sessionHeaders(target, { json: true })["Content-Type"]).toBe("application/json");
    expect(sessionHeaders(target)).toEqual({ Authorization: "Bearer t", "X-Device-Id": "dev-1" });
  });

  // The API answers 400 to an empty body sent as application/json, which failed every heartbeat and close.
  it("sends the heartbeat and the close without a JSON Content-Type", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "active" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await heartbeatPlaybackSession(target, "s-1");
    closePlaybackSession(target, "s-1");
    for (const [, init] of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(init.body).toBeUndefined();
      expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
