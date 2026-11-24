/** The name viewers see in the player's own messages. */
export const PLAYER_NAME = "EYZFlow Player";

const GENERIC = "Playback failed.";

/**
 * Text for the error screen and `onError`. Shaka's compiled build sets every
 * error's message to "Shaka Error <code>", so a coded error shows only our name
 * and the code, and a message that names Shaka is never passed on.
 */
export function playbackErrorMessage(err: unknown): string {
  const e = err as { code?: unknown; message?: unknown } | null | undefined;
  if ((typeof e?.code === "number" || typeof e?.code === "string") && e.code) {
    return `${PLAYER_NAME} error ${e.code}`;
  }
  const message = typeof e?.message === "string" ? e.message.trim() : "";
  if (!message || /shaka/i.test(message)) return GENERIC;
  return message;
}
