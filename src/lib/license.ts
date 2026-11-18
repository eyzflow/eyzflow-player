import { API_ORIGIN, PLAYER_VERSION } from "./api";

/** Refusals of the player key check (POST /v1/player/license), and of DRM licences by the site check. */
export type PlayerLicenseCode =
  | "PLAYER_KEY_INVALID"
  | "ORIGIN_REQUIRED"
  | "PLAYER_KEY_STREAM_MISMATCH"
  | "DOMAIN_NOT_ALLOWED"
  | "PLAYER_TOKEN_REQUIRED"
  | "PLAYER_TOKEN_INVALID"
  | "PLAYER_TOKEN_ORIGIN_MISMATCH";

export const LICENSE_CODES: ReadonlySet<string> = new Set<PlayerLicenseCode>([
  "PLAYER_KEY_INVALID",
  "ORIGIN_REQUIRED",
  "PLAYER_KEY_STREAM_MISMATCH",
  "DOMAIN_NOT_ALLOWED",
  "PLAYER_TOKEN_REQUIRED",
  "PLAYER_TOKEN_INVALID",
  "PLAYER_TOKEN_ORIGIN_MISMATCH",
]);

export type PlayerLicenseError = { code: PlayerLicenseCode; message: string };

export class PlayerLicenseException extends Error {
  readonly license: PlayerLicenseError;
  constructor(license: PlayerLicenseError) {
    super(license.message);
    this.license = license;
  }
}

export type PlayerLicense = {
  token: string;
  expiresIn: number;
  refreshAfter: number;
  mode: "off" | "log" | "enforce";
  /** Set when the site is not allowed but the organisation only logs: what enforce would answer. */
  wouldRefuse: PlayerLicenseCode | null;
  analytics: { enabled: boolean; heartbeatIntervalSeconds: number };
};

export function licenseMessage(code: PlayerLicenseCode): string {
  switch (code) {
    case "PLAYER_KEY_INVALID":
      return "This player is not set up correctly (invalid player key).";
    case "PLAYER_KEY_STREAM_MISMATCH":
      return "This video cannot be played with this player key.";
    case "ORIGIN_REQUIRED":
    case "DOMAIN_NOT_ALLOWED":
    case "PLAYER_TOKEN_ORIGIN_MISMATCH":
      return "This video cannot be played on this site.";
    case "PLAYER_TOKEN_REQUIRED":
    case "PLAYER_TOKEN_INVALID":
      return "The player's licence check expired. Reload the page to keep watching.";
  }
}

/**
 * Where the player runs, for our own iframe player: the pages that embed it, nearest first, or that it is the page
 * itself. A page's own script may lie, but the server only trusts these from our iframe player's origin, and the
 * browser's Origin header names that origin truthfully.
 */
export function embedding(win: Window | undefined = typeof window !== "undefined" ? window : undefined): { embedder_origins?: string[]; top_level: boolean } {
  if (!win) return { top_level: true };
  let topLevel: boolean;
  try {
    topLevel = win.self === win.top;
  } catch {
    // Reading a cross-origin top throws in some browsers: then it is framed.
    topLevel = false;
  }
  if (topLevel) return { top_level: true };
  const ancestors = (win.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
  if (ancestors && ancestors.length) return { embedder_origins: Array.from({ length: ancestors.length }, (_, i) => ancestors.item(i) ?? ""), top_level: false };
  // Firefox has no ancestorOrigins: the referrer names the embedding page (when its referrer policy allows).
  try {
    const referrer = win.document.referrer ? new URL(win.document.referrer).origin : null;
    return { embedder_origins: referrer ? [referrer] : [], top_level: false };
  } catch {
    return { embedder_origins: [], top_level: false };
  }
}

/** Checks the player key for this page's site. Throws PlayerLicenseException on a refusal, Error on a network failure. */
export async function acquirePlayerLicense(input: { key: string; streamId: string; configId?: string }, fetchImpl: typeof fetch = fetch): Promise<PlayerLicense> {
  const res = await fetchImpl(`${API_ORIGIN}/v1/player/license`, {
    method: "POST",
    // text/plain keeps this a simple request: no CORS preflight before playback starts.
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ key: input.key, stream_id: input.streamId, config_id: input.configId, player_version: PLAYER_VERSION, ...embedding() }),
    credentials: "omit",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
    if (body?.code && LICENSE_CODES.has(body.code)) {
      const code = body.code as PlayerLicenseCode;
      throw new PlayerLicenseException({ code, message: licenseMessage(code) });
    }
    throw new Error(`Player licence check failed (${res.status}).`);
  }
  const body = (await res.json()) as {
    token: string;
    expires_in?: number;
    refresh_after?: number;
    mode?: PlayerLicense["mode"];
    would_refuse?: PlayerLicenseCode | null;
    analytics?: { enabled?: boolean; heartbeat_interval_seconds?: number };
  };
  return {
    token: body.token,
    expiresIn: body.expires_in ?? 900,
    refreshAfter: body.refresh_after ?? 600,
    mode: body.mode ?? "off",
    wouldRefuse: body.would_refuse ?? null,
    analytics: { enabled: body.analytics?.enabled === true, heartbeatIntervalSeconds: body.analytics?.heartbeat_interval_seconds ?? 60 },
  };
}

/**
 * The current player token, renewed before it expires while the player is open. A failed renewal keeps the old token
 * and tries again a minute later; a refusal (the key was switched off, the site removed) is reported once.
 */
export class LicenseSession {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  current: PlayerLicense;

  private readonly input: { key: string; streamId: string; configId?: string };
  private readonly onRefused: (error: PlayerLicenseError) => void;
  private readonly acquire: typeof acquirePlayerLicense;

  private constructor(
    input: { key: string; streamId: string; configId?: string },
    first: PlayerLicense,
    onRefused: (error: PlayerLicenseError) => void,
    acquire: typeof acquirePlayerLicense,
  ) {
    this.input = input;
    this.onRefused = onRefused;
    this.acquire = acquire;
    this.current = first;
    this.schedule(first.refreshAfter);
  }

  static async start(
    input: { key: string; streamId: string; configId?: string },
    onRefused: (error: PlayerLicenseError) => void,
    acquire: typeof acquirePlayerLicense = acquirePlayerLicense,
  ): Promise<LicenseSession> {
    return new LicenseSession(input, await acquire(input), onRefused, acquire);
  }

  get token(): string {
    return this.current.token;
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(seconds: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.refresh(), Math.max(seconds, 10) * 1000);
  }

  private async refresh(): Promise<void> {
    try {
      this.current = await this.acquire(this.input);
      this.schedule(this.current.refreshAfter);
    } catch (error) {
      if (this.stopped) return;
      if (error instanceof PlayerLicenseException) {
        this.stop();
        this.onRefused(error.license);
        return;
      }
      this.schedule(60);
    }
  }
}
