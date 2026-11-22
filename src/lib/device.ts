const STORAGE_KEY = "eyzflow.deviceId";

let memoryId: string | null = null;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * A stable id for this browser, sent with playback so the plan's device limit counts it once. Kept in local storage;
 * when storage is blocked it lasts for the page.
 */
export function getDeviceId(): string {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    const id = newId();
    window.localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    memoryId ??= newId();
    return memoryId;
  }
}
