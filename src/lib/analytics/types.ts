/** The impression's counters so far, as the player sends them (cumulative: a lost or repeated beat changes nothing). */
export type BeatMetrics = {
  /** From the player starting to load to the video being ready. */
  player_startup_ms: number | null;
  /** From asking to play (autoplay: from loading) to the first frame. Null until a frame showed. */
  video_startup_ms: number | null;
  played_ms: number;
  paused_ms: number;
  rebuffer_ms: number;
  rebuffer_count: number;
  seek_count: number;
  /** Bits per second of the variant played, weighted by time played. */
  avg_bitrate: number | null;
  min_bitrate: number | null;
  max_bitrate: number | null;
  quality_switches: number;
  dropped_frames: number;
  max_position_s: number;
  duration_s: number | null;
};

export type BeatError = { n: number; code: string; category: string | null; message: string | null; position_s: number | null };

export type Beat = {
  token: string;
  sid: string;
  seq: number;
  started_at: number;
  final: boolean;
  stream_id: string;
  is_live: boolean;
  autoplay: boolean;
  drm: string | null;
  player_version: string;
  m: BeatMetrics;
  errors: BeatError[];
};

export type PlaybackState = "startup" | "playing" | "paused" | "buffering" | "seeking" | "ended" | "error";
