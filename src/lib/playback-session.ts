import { API_ORIGIN as API } from "./api";

/** Refusals the backend gives when a plan's stream or device limit is reached, or the viewer was signed out. */
export type PlaybackLimitCode =
  | "STREAM_LIMIT"
  | "DEVICE_LIMIT"
  | "DEVICE_REVOKED"
  | "SESSION_REVOKED"
  | "PLAYBACK_SESSION_ENDED";

const LIMIT_CODES: ReadonlySet<string> = new Set<PlaybackLimitCode>([
  "STREAM_LIMIT",
  "DEVICE_LIMIT",
  "DEVICE_REVOKED",
  "SESSION_REVOKED",
  "PLAYBACK_SESSION_ENDED",
]);

export type PlaybackLimitError = {
  code: PlaybackLimitCode;
  message: string;
  /** The response body: `sessions` for STREAM_LIMIT, `devices` for DEVICE_LIMIT. */
  details: Record<string, unknown>;
};

export class PlaybackLimitException extends Error {
  readonly limit: PlaybackLimitError;
  constructor(limit: PlaybackLimitError) {
    super(limit.message);
    this.limit = limit;
  }
}

export type PlaybackSession = {
  /** Null while the storefront's limits are off: nothing to heartbeat. */
  id: string | null;
  heartbeatIntervalSeconds: number;
  /**
   * Whether the viewer's plan plays ads for this title (its plan asks for ads, or it is a free AVOD product). Null
   * when the backend did not say: the player config decides.
   */
  ads: boolean | null;
  /** Key-values for the ad request's `cust_params`, e.g. `{ plan: "basic-ads", access: "svod" }`. */
  adTargeting: Record<string, string>;
};

function stringRecord(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, value] of Object.entries(v as Record<string, unknown>)) {
    if (typeof value === "string" && value) out[k] = value;
  }
  return out;
}

type SessionTarget = {
  storefrontId: string;
  /** The viewer's `Authorization` value, e.g. "Bearer <token>". */
  authorization: string;
  deviceId: string;
};

function sessionsUrl(storefrontId: string, path = ""): string {
  return `${API}/v1/content/storefront/${encodeURIComponent(storefrontId)}/playback-sessions${path}`;
}

/**
 * The session request headers. Content-Type only with a JSON body: the API refuses an empty body sent as
 * application/json (400), which failed every heartbeat and close.
 */
export function sessionHeaders(t: SessionTarget, { json = false }: { json?: boolean } = {}): Record<string, string> {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    Authorization: t.authorization,
    "X-Device-Id": t.deviceId,
  };
}

/** Reads a limit refusal from a response, if it is one. */
export async function readLimitError(res: Response): Promise<PlaybackLimitError | null> {
  const body = (await res
    .clone()
    .json()
    .catch(() => null)) as Record<string, unknown> | null;
  if (!body) return null;
  const code = typeof body.code === "string" ? body.code : null;
  if (!code || !LIMIT_CODES.has(code)) return null;
  return {
    code: code as PlaybackLimitCode,
    message: typeof body.message === "string" ? body.message : code,
    details: body,
  };
}

/** Starts watching: checks the plan's limits and returns the session to heartbeat. Throws PlaybackLimitException. */
export async function openPlaybackSession(
  t: SessionTarget & { streamId: string; deviceName?: string },
): Promise<PlaybackSession> {
  const res = await fetch(sessionsUrl(t.storefrontId), {
    method: "POST",
    headers: sessionHeaders(t, { json: true }),
    body: JSON.stringify({ stream_id: t.streamId, platform: "web", device_name: t.deviceName }),
  });
  if (!res.ok) {
    const limit = await readLimitError(res);
    if (limit) throw new PlaybackLimitException(limit);
    throw new Error(`Could not start playback (${res.status}).`);
  }
  const body = (await res.json()) as {
    id?: string | null;
    heartbeat_interval_seconds?: number;
    ads?: unknown;
    ad_targeting?: unknown;
  };
  return {
    id: body.id ?? null,
    heartbeatIntervalSeconds: body.heartbeat_interval_seconds ?? 30,
    ads: typeof body.ads === "boolean" ? body.ads : null,
    adTargeting: stringRecord(body.ad_targeting),
  };
}

/** Keeps the session open. Returns false when it was ended elsewhere (device removed, signed out everywhere). */
export async function heartbeatPlaybackSession(t: SessionTarget, sessionId: string): Promise<boolean> {
  const res = await fetch(sessionsUrl(t.storefrontId, `/${encodeURIComponent(sessionId)}/heartbeat`), {
    method: "POST",
    headers: sessionHeaders(t),
  });
  if (res.status === 401 || res.status === 404) return false;
  if (!res.ok) return true; // a passing network or server error: try again at the next beat
  const body = (await res.json()) as { status?: string };
  return body.status !== "ended";
}

/** Stops watching so the stream is free at once. `keepalive` lets it finish while the page closes. */
export function closePlaybackSession(t: SessionTarget, sessionId: string): void {
  void fetch(sessionsUrl(t.storefrontId, `/${encodeURIComponent(sessionId)}`), {
    method: "DELETE",
    headers: sessionHeaders(t),
    keepalive: true,
  }).catch(() => {});
}

export function limitMessage(code: PlaybackLimitCode): string {
  switch (code) {
    case "STREAM_LIMIT":
      return "You're watching on too many screens. Stop playback on another device to watch here.";
    case "DEVICE_LIMIT":
      return "Your plan's device limit is reached. Remove a device in your account to watch here.";
    case "DEVICE_REVOKED":
    case "SESSION_REVOKED":
      return "You were signed out on this device. Sign in again to watch.";
    case "PLAYBACK_SESSION_ENDED":
      return "Playback was stopped from another device.";
  }
}
