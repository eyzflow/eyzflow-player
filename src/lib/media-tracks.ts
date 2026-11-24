import type { ShakaAudioTrack, ShakaTextTrack } from "./shaka-types";
import { matchesLanguage } from "./playback-preferences";

/** An audio language the viewer can pick, from the browser's player or from the TV. */
export type AudioOption = {
  /** Stable while the stream plays: "language|label" locally, the Cast track id on the TV. */
  id: string;
  language: string;
  label: string | null;
};

const audioKey = (language: string, label: string | null) => `${language}|${label ?? ""}`;

/** Shaka's audio tracks as one option per language and label (the bitrates and channel layouts of one language collapse). */
export function audioOptionsFrom(tracks: ShakaAudioTrack[]): { options: AudioOption[]; active: AudioOption | null } {
  const options: AudioOption[] = [];
  let active: AudioOption | null = null;
  for (const track of tracks) {
    const id = audioKey(track.language, track.label);
    let option = options.find((o) => o.id === id);
    if (!option) {
      option = { id, language: track.language, label: track.label };
      options.push(option);
    }
    if (track.active) active = option;
  }
  return { options, active };
}

/** The Shaka audio track to select for an option: the active one's channel layout where the option has it. */
export function shakaAudioTrackFor(tracks: ShakaAudioTrack[], option: AudioOption): ShakaAudioTrack | null {
  const matching = tracks.filter((t) => audioKey(t.language, t.label) === option.id);
  const current = tracks.find((t) => t.active);
  return matching.find((t) => t.channelsCount === current?.channelsCount) ?? matching[0] ?? null;
}

/** A track as the Cast receiver reports it (chrome.cast.media.Track). */
export type CastTrack = {
  trackId: number;
  type: string;
  language?: string | null;
  name?: string | null;
  subtype?: string | null;
};

const isText = (t: CastTrack) => t.type === "TEXT";
const isAudio = (t: CastTrack) => t.type === "AUDIO";

/** The TV's subtitle tracks in the shape the settings menu shows, and the one on (null when subtitles are off). */
export function castTextTracks(tracks: CastTrack[], activeIds: number[]): { tracks: ShakaTextTrack[]; active: ShakaTextTrack | null } {
  const text = tracks.filter(isText).map((t) => ({
    id: t.trackId,
    active: activeIds.includes(t.trackId),
    type: "text",
    language: t.language ?? "",
    label: t.name || null,
    kind: t.subtype ?? null,
    mimeType: null,
  }));
  return { tracks: text, active: text.find((t) => t.active) ?? null };
}

/** The TV's audio tracks as options, and the one playing (the first when the receiver names none). */
export function castAudioOptions(tracks: CastTrack[], activeIds: number[]): { options: AudioOption[]; active: AudioOption | null } {
  const audio = tracks.filter(isAudio);
  const options = audio.map((t) => ({ id: String(t.trackId), language: t.language ?? "", label: t.name || null }));
  const activeTrack = audio.find((t) => activeIds.includes(t.trackId));
  const active = activeTrack ? options[audio.indexOf(activeTrack)] : (options[0] ?? null);
  return { options, active };
}

/**
 * The active track ids after switching one kind: the other kinds' ids stay, the kind's own are replaced by `trackId`
 * (none for null, which turns subtitles off).
 */
export function withActiveTrack(tracks: CastTrack[], activeIds: number[], type: "TEXT" | "AUDIO", trackId: number | null): number[] {
  const ofType = new Set(tracks.filter((t) => t.type === type).map((t) => t.trackId));
  const kept = activeIds.filter((id) => !ofType.has(id));
  return trackId === null ? kept : [...kept, trackId];
}

/**
 * The TV's track of a kind in a language, for carrying the browser's choice over: the one with the same label first
 * (a film can have stereo and 5.1 in one language), else the first in the language.
 */
export function castTrackForLanguage(
  tracks: CastTrack[],
  type: "TEXT" | "AUDIO",
  language: string | null | undefined,
  label?: string | null,
): CastTrack | null {
  if (!language) return null;
  const inLanguage = tracks.filter((t) => t.type === type && matchesLanguage(t.language, language));
  return (label && inLanguage.find((t) => t.name === label)) || inLanguage[0] || null;
}
