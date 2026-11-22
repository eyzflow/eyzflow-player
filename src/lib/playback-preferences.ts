/** The primary language subtag, lower case: "de-DE" → "de", "pt_BR" → "pt". */
function primaryLanguage(tag: string): string {
  return tag.trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

/** Three-letter codes manifests also use for the languages the storefronts play in. */
const ISO_639_2: Record<string, string> = {
  deu: "de",
  ger: "de",
  eng: "en",
  fra: "fr",
  fre: "fr",
  nld: "nl",
  dut: "nl",
  ita: "it",
  spa: "es",
  ara: "ar",
};

function normalize(tag: string): string {
  const primary = primaryLanguage(tag);
  return ISO_639_2[primary] ?? primary;
}

/** Whether a track's language is the wanted one, ignoring region and two/three-letter spelling. */
export function matchesLanguage(trackLanguage: string | null | undefined, wanted: string | null | undefined): boolean {
  if (!trackLanguage || !wanted) return false;
  const a = normalize(trackLanguage);
  return a !== "" && a !== "und" && a === normalize(wanted);
}

/** Shaka's preferred audio entry for a language, or null for none. */
export function audioPreference(language: string | null | undefined) {
  const tag = language?.trim();
  if (!tag) return null;
  return { language: tag, role: "", label: "", channelCount: 2, codec: "" };
}

/** Shaka restrictions that cap the bitrate, or null when there is no (valid) cap. */
export function bitrateRestrictions(maxBitrate: number | null | undefined) {
  if (typeof maxBitrate !== "number" || !Number.isFinite(maxBitrate) || maxBitrate <= 0) return null;
  return { maxBandwidth: Math.round(maxBitrate) };
}

/** The thumbnails track EYZFlow writes next to a stream's manifest. */
export function defaultThumbnailsUrl(cdnOrigin: string, streamId: string): string {
  return `${cdnOrigin}/${encodeURIComponent(streamId)}/thumbnails/thumbnail.vtt`;
}
