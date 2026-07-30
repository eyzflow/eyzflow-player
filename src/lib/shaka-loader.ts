import type { ShakaGlobal } from "./shaka-types";

let cached: ShakaGlobal | null = null;

function coerceShakaModule(mod: unknown): ShakaGlobal | null {
  if (!mod || typeof mod !== "object") return null;
  const m = mod as Record<string, unknown>;
  for (const root of [m.default, m]) {
    if (!root || typeof root !== "object") continue;
    const r = root as Record<string, unknown>;
    const poly = r.polyfill as { installAll?: unknown } | undefined;
    if (typeof r.Player === "function" && poly && typeof poly.installAll === "function") {
      return r as unknown as ShakaGlobal;
    }
  }
  return null;
}

export async function loadShaka(): Promise<ShakaGlobal> {
  if (typeof window === "undefined") throw new Error("loadShaka is browser-only");
  if (cached) return cached;

  const attempts: Array<() => Promise<unknown>> = [
    () => import("shaka-player/dist/shaka-player.compiled.js"),
    () => import("shaka-player"),
  ];

  for (const attempt of attempts) {
    try {
      const mod = await attempt();
      const shaka = coerceShakaModule(mod);
      if (shaka) {
        cached = shaka;
        return cached;
      }
    } catch {
      // try next
    }
  }

  const w = window as Window & { shaka?: ShakaGlobal };
  if (w.shaka?.Player) {
    cached = w.shaka;
    return cached;
  }

  throw new Error("Shaka Player failed to initialize");
}
