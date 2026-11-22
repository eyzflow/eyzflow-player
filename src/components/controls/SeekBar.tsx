import { useCallback, useRef, useState } from "react";
import type { ShakaThumbnail } from "../../lib/shaka-types";
import { formatTime } from "../../lib/format-time";

type Props = {
  currentTime: number;
  duration: number;
  buffered: number;
  onSeek: (s: number) => void;
  /** The preview at a time; without it the bar shows no preview. */
  getThumbnail?: (time: number) => Promise<ShakaThumbnail | null>;
};

/** Width a preview tile is drawn at when the sprite's size is known; otherwise tiles keep their own size. */
const PREVIEW_WIDTH = 176;

type Preview = { time: number; x: number; thumbnail: ShakaThumbnail | null };

export function SeekBar({ currentTime, duration, buffered, onSeek, getThumbnail }: Props) {
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  // Pointer position over the bar, in percent, for the hover fill and time tooltip.
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  // Only the latest pointer position's thumbnail is drawn.
  const requestRef = useRef(0);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSeek(Number(e.target.value));
    },
    [onSeek],
  );

  const showPreview = useCallback(
    (clientX: number) => {
      const wrap = wrapRef.current;
      if (!wrap || duration <= 0) return;
      const rect = wrap.getBoundingClientRect();
      if (rect.width === 0) return;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      setHoverPct(ratio * 100);
      if (!getThumbnail) return;
      const time = ratio * duration;
      // Kept inside the bar so the tile never leaves the player.
      const half = PREVIEW_WIDTH / 2;
      const x = Math.min(rect.width - half, Math.max(half, ratio * rect.width));
      const request = ++requestRef.current;
      setPreview((p) => ({ time, x, thumbnail: p?.thumbnail ?? null }));
      void getThumbnail(time).then((thumbnail) => {
        if (request === requestRef.current) setPreview((p) => (p ? { ...p, thumbnail } : p));
      });
    },
    [getThumbnail, duration],
  );

  const hidePreview = useCallback(() => {
    requestRef.current++;
    setPreview(null);
    setHoverPct(null);
  }, []);

  // Without thumbnails (a new stream has none yet) nothing is drawn.
  const tile = getThumbnail ? preview?.thumbnail : null;
  // Scaling a sprite needs its full size, which WebVTT thumbnails don't give.
  const scale = tile && tile.width > 0 && tile.imageWidth > 0 ? PREVIEW_WIDTH / tile.width : 1;

  return (
    <div
      className="eyz-seekbar-wrap"
      ref={wrapRef}
      onPointerMove={(e) => showPreview(e.clientX)}
      onPointerDown={(e) => showPreview(e.clientX)}
      onPointerLeave={hidePreview}
      onPointerUp={(e) => {
        if (e.pointerType !== "mouse") hidePreview();
      }}
    >
      <div className="eyz-seekbar-track">
        <div className="eyz-seekbar-buffered" style={{ width: `${bufPct}%` }} />
        {hoverPct !== null && <div className="eyz-seekbar-hover" style={{ width: `${hoverPct}%` }} />}
        <div className="eyz-seekbar-filled" style={{ width: `${pct}%` }} />
      </div>
      <div className="eyz-seekbar-scrubber" style={{ left: `${pct}%` }} />
      <input
        className="eyz-seekbar-input"
        type="range"
        min={0}
        max={duration || 100}
        step={0.1}
        value={currentTime}
        onChange={onChange}
        onBlur={hidePreview}
        aria-label="Seek slider"
        aria-valuetext={`${formatTime(currentTime)} / ${formatTime(duration)}`}
      />
      {hoverPct !== null && !tile && duration > 0 && (
        <div
          className="eyz-seekbar-tooltip"
          style={{ left: `clamp(24px, ${hoverPct}%, calc(100% - 24px))` }}
          aria-hidden="true"
        >
          {formatTime((hoverPct / 100) * duration)}
        </div>
      )}
      {preview && tile && (
        <div className="eyz-seek-preview" style={{ left: preview.x }} aria-hidden="true">
          <div
            className="eyz-seek-preview__image"
            style={{
              width: tile.width * scale,
              height: tile.height * scale,
              backgroundImage: `url("${tile.uris[0]}")`,
              backgroundPosition: `${-tile.positionX * scale}px ${-tile.positionY * scale}px`,
              backgroundSize: tile.imageWidth > 0 ? `${tile.imageWidth * scale}px ${tile.imageHeight * scale}px` : undefined,
            }}
          />
          <span className="eyz-seek-preview__time">{formatTime(preview.time)}</span>
        </div>
      )}
    </div>
  );
}
