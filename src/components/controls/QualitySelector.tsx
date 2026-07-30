import type { ShakaTrack } from "../../lib/shaka-types";

type Props = {
  tracks: ShakaTrack[];
  activeTrack: ShakaTrack | null;
  onSelect: (track: ShakaTrack) => void;
};

export function QualitySelector({ tracks, activeTrack, onSelect }: Props) {
  const videoTracks = tracks
    .filter((t) => t.height != null)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));

  if (videoTracks.length === 0) return null;

  return (
    <select
      className="eyz-quality"
      value={activeTrack?.id ?? ""}
      onChange={(e) => {
        const track = videoTracks.find((t) => String(t.id) === e.target.value);
        if (track) onSelect(track);
      }}
      aria-label="Quality"
    >
      {videoTracks.map((t) => (
        <option key={t.id} value={t.id}>
          {t.height}p
        </option>
      ))}
    </select>
  );
}
