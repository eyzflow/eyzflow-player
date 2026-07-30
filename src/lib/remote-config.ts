import type { PlayerConfig } from "./config-types";

const CONFIG_API = (import.meta.env.VITE_CONFIG_API_ORIGIN as string | undefined)?.replace(/\/$/, "") ?? "https://api.eyzflow.com";
const cache = new Map<string, PlayerConfig>();

export async function fetchPlayerConfig(configId: string): Promise<PlayerConfig> {
  if (cache.has(configId)) return cache.get(configId)!;

  const res = await fetch(`${CONFIG_API}/v1/player-configs/${encodeURIComponent(configId)}`);
  if (!res.ok) {
    throw new Error(`Failed to load player config "${configId}": HTTP ${res.status}`);
  }

  const config = (await res.json()) as PlayerConfig;
  cache.set(configId, config);
  return config;
}
