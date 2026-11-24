import { describe, expect, it } from "vitest";
import { playbackErrorMessage } from "./error-message";

describe("playbackErrorMessage", () => {
  it("shows our name and the code for a Shaka error", () => {
    expect(playbackErrorMessage({ code: 1001, message: "Shaka Error 1001", category: 1 })).toBe("EYZFlow Player error 1001");
  });

  it("keeps our own messages for errors without a code", () => {
    expect(playbackErrorMessage(new Error("Stream not found"))).toBe("Stream not found");
  });

  it("never passes on a message that names Shaka", () => {
    expect(playbackErrorMessage(new Error("Shaka Error 6001"))).toBe("Playback failed.");
    expect(playbackErrorMessage({ message: "shaka.util.Error" })).toBe("Playback failed.");
  });

  it("falls back to a generic message", () => {
    expect(playbackErrorMessage(undefined)).toBe("Playback failed.");
    expect(playbackErrorMessage({ code: 0 })).toBe("Playback failed.");
    expect(playbackErrorMessage("boom")).toBe("Playback failed.");
  });
});
