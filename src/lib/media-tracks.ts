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
  /** The manifest's roles; a forced subtitle track has `forced-subtitle`. */
  roles?: string[] | null;
};

const isText = (t: CastTrack) => t.type === "TEXT";
const FORCED_ROLES = new Set(["forced-subtitle", "forced_subtitle", "forced"]);
/** A forced subtitle track on the TV: never offered, it plays while subtitles are off. */
export const isForcedCastTrack = (t: CastTrack) => isText(t) && (t.roles ?? []).some((r) => FORCED_ROLES.has(r));
/** A subtitle track the menu offers: any but a forced one. */
const isOfferedText = (t: CastTrack) => isText(t) && !isForcedCastTrack(t);
const isAudio = (t: CastTrack) => t.type === "AUDIO";

/**
 * The TV's subtitle tracks in the shape the settings menu shows, and the one on (null when subtitles are off). Forced
 * tracks are left out: one playing means subtitles are off.
 */
export function castTextTracks(tracks: CastTrack[], activeIds: number[]): { tracks: ShakaTextTrack[]; active: ShakaTextTrack | null } {
  const text = tracks.filter(isOfferedText).map((t) => ({
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

/** The TV's forced subtitle track in the language of the audio among `activeIds`, or null. */
export function castForcedTrackFor(tracks: CastTrack[], activeIds: number[]): number | null {
  const audio = tracks.find((t) => isAudio(t) && activeIds.includes(t.trackId));
  if (!audio?.language) return null;
  return tracks.find((t) => isForcedCastTrack(t) && matchesLanguage(t.language, audio.language!))?.trackId ?? null;
}

/** The active ids with full subtitles off: the forced track in the audio's language plays, if the TV has one. */
export function withSubtitlesOff(tracks: CastTrack[], activeIds: number[]): number[] {
  return withActiveTrack(tracks, activeIds, "TEXT", castForcedTrackFor(tracks, activeIds));
}

/** Whether full subtitles are on among `activeIds` (a forced track alone is off). */
export function castSubtitlesOn(tracks: CastTrack[], activeIds: number[]): boolean {
  return tracks.some((t) => isOfferedText(t) && activeIds.includes(t.trackId));
}

/** The browser's forced subtitle track for audio in `audioLanguage`, or null. */
export function forcedTextTrackFor(textTracks: ShakaTextTrack[], audioLanguage: string | null | undefined): ShakaTextTrack | null {
  if (!audioLanguage) return null;
  return textTracks.find((t) => t.forced && matchesLanguage(t.language, audioLanguage)) ?? null;
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
  const inLanguage = tracks.filter(
    (t) => t.type === type && !isForcedCastTrack(t) && matchesLanguage(t.language, language),
  );
  return (label && inLanguage.find((t) => t.name === label)) || inLanguage[0] || null;
}

/** A subtitle or audio track by its language and label, as the TV last played it. */
export type TrackChoice = { language: string; label: string | null };

/**
 * The TV's subtitle and audio when casting ends, for the browser to take over. `text` is null when the TV had
 * subtitles off; `audio` is null when the TV named no audio track (the browser keeps its own).
 */
export type CastHandback = { text: TrackChoice | null; audio: TrackChoice | null };

/**
 * The TV's active subtitle and audio from its last status, or null when it reported no tracks (nothing to hand back).
 * A subtitle track on without a language can't be matched, so the browser keeps its own then.
 */
export function castHandback(tracks: CastTrack[], activeIds: number[]): CastHandback | null {
  if (!tracks.some((t) => isText(t) || isAudio(t))) return null;
  const choice = (t: CastTrack | undefined): TrackChoice | null =>
    t?.language ? { language: t.language, label: t.name || null } : null;
  const text = tracks.find((t) => isOfferedText(t) && activeIds.includes(t.trackId));
  if (text && !text.language) return null;
  return { text: choice(text), audio: choice(tracks.find((t) => isAudio(t) && activeIds.includes(t.trackId))) };
}

/**
 * The browser's track (a Shaka subtitle track or an audio option) for the TV's choice: the one with the same label
 * first (a film can have stereo and 5.1 in one language), else the first in the language, else null.
 */
export function matchingTrack<T extends { language: string; label: string | null }>(tracks: T[], choice: TrackChoice): T | null {
  const inLanguage = tracks.filter((t) => matchesLanguage(t.language, choice.language));
  return (choice.label && inLanguage.find((t) => t.label === choice.label)) || inLanguage[0] || null;
}
