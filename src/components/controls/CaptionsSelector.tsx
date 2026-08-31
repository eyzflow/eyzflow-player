import type { ShakaTextTrack } from "../../lib/shaka-types";

type Props = {
  textTracks: ShakaTextTrack[];
  activeTextTrack: ShakaTextTrack | null;
  captionsVisible: boolean;
  onSelect: (track: ShakaTextTrack) => void;
  onOff: () => void;
};

function trackLabel(track: ShakaTextTrack, index: number): string {
  if (track.label) return track.label;
  if (track.language) {
    try {
      const name = new Intl.DisplayNames(undefined, { type: "language" }).of(
        track.language,
      );
      if (name) return name;
    } catch {
      // Unknown/malformed language code — fall back to the raw tag.
    }
    return track.language;
  }
  return `Subtitles ${index + 1}`;
}

export function CaptionsSelector({
  textTracks,
  activeTextTrack,
  captionsVisible,
  onSelect,
  onOff,
}: Props) {
  if (textTracks.length === 0) return null;

  return (
    <select
      className="eyz-quality eyz-captions"
      value={captionsVisible && activeTextTrack ? String(activeTextTrack.id) : "off"}
      onChange={(e) => {
        if (e.target.value === "off") {
          onOff();
          return;
        }
        const track = textTracks.find((t) => String(t.id) === e.target.value);
        if (track) onSelect(track);
      }}
      aria-label="Subtitles"
    >
      <option value="off">Subtitles off</option>
      {textTracks.map((t, i) => (
        <option key={t.id} value={t.id}>
          {trackLabel(t, i)}
        </option>
      ))}
    </select>
  );
}
