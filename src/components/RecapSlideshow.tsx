import { useEffect, useReducer, useRef, useState } from "react";
import { recapLabels, type Recap } from "../lib/recap";
import { slideStep } from "../lib/recap-slide-step";
import { Icon } from "./controls/icons";

type Props = {
  recap: Recap;
  /** The slides to show (those up to the film position), in order. */
  slides: Recap["slides"];
  /** Back to the film; the player resumes playback. */
  onClose: () => void;
};

/** Seconds a slide shows when its cue has no usable length. */
const FALLBACK_SECONDS = 7;

/**
 * The recap: one slide at a time over the video, the image beside its title and text. It moves on by itself on the
 * recap's own clock (each cue's length); ← / → step, Space pauses, Esc closes. Every part has an `eyz-recap…` class.
 */
export function RecapSlideshow({ recap, slides, onClose }: Props) {
  const labels = recapLabels();
  const count = slides.length;
  // `done`: finished, the last slide stays with "Continue watching". `run` changes on every step, so a slide shown
  // again starts its clock (and progress) over.
  const [{ index, done, run, from, dir }, dispatch] = useReducer(slideStep, { index: 0, done: false, run: 0, from: null, dir: 1 });
  const [paused, setPaused] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const slide = slides[index];
  const last = index === count - 1;
  const seconds = slide && slide.end > slide.start ? slide.end - slide.start : FALLBACK_SECONDS;
  const go = (to: number) => dispatch({ type: "go", to, count });
  const forward = () => dispatch(last ? { type: "finish" } : { type: "go", to: index + 1, count });

  // Auto-advance on the slide's own length. A pause keeps what is left of it, as the progress bar does.
  const remaining = useRef(seconds * 1000);
  useEffect(() => {
    remaining.current = seconds * 1000;
  }, [index, run, seconds]);
  useEffect(() => {
    if (paused || done) return;
    const started = Date.now();
    const timer = setTimeout(
      () => dispatch(last ? { type: "finish" } : { type: "go", to: index + 1, count }),
      Math.max(0, remaining.current),
    );
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [index, run, paused, done, last, count]);

  // The next image loads while this slide shows.
  useEffect(() => {
    const next = slides[index + 1];
    if (next) new Image().src = next.imageUrl;
  }, [index, slides]);

  // Focus moves into the slideshow on open.
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const onButton = (e.target as HTMLElement | null)?.tagName === "BUTTON";
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          dispatch({ type: "go", to: index - 1, count });
          break;
        case "ArrowRight":
          dispatch(last ? { type: "finish" } : { type: "go", to: index + 1, count });
          break;
        case " ":
        case "k":
          if (onButton && e.key === " ") return;
          if (done) {
            dispatch({ type: "go", to: 0, count });
            setPaused(false);
          } else setPaused((p) => !p);
          break;
        default:
          return;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, last, done, count, onClose]);

  if (!slide) return null;

  return (
    <div
      ref={rootRef}
      className="eyz-recap"
      role="dialog"
      aria-label={recap.title ? `${labels.recap}: ${recap.title}` : labels.recap}
      tabIndex={-1}
    >
      <div className="eyz-recap__progress" aria-hidden="true">
        {slides.map((s, i) => (
          <span key={`${s.start}-${i}`} className="eyz-recap__segment">
            <span
              key={i === index ? `on-${index}-${run}` : "off"}
              className={`eyz-recap__segment-fill${i < index || (i === index && done) ? " eyz-recap__segment-fill--full" : ""}${i === index && !done ? " eyz-recap__segment-fill--running" : ""}`}
              style={
                i === index && !done
                  ? ({ "--eyz-recap-seconds": `${seconds}s`, animationPlayState: paused ? "paused" : "running" } as React.CSSProperties)
                  : undefined
              }
            />
          </span>
        ))}
      </div>

      <header className="eyz-recap__header">
        <div className="eyz-recap__heading">
          <span className="eyz-recap__eyebrow">{labels.recap}</span>
          {recap.title && <span className="eyz-recap__title">{recap.title}</span>}
        </div>
        <button type="button" className="eyz-recap__icon-btn eyz-recap__close" onClick={onClose} aria-label={labels.close} title={labels.close}>
          <Icon name="close" size={22} />
        </button>
      </header>

      <div
        className={`eyz-recap__stage eyz-recap__stage--${dir > 0 ? "next" : "prev"}`}
        style={{ "--eyz-recap-seconds": `${seconds}s`, "--eyz-recap-play": paused ? "paused" : "running" } as React.CSSProperties}
      >
        {/* Keyed by run: the slide that was in front keeps its element (and its slow zoom) while it leaves. */}
        {from !== null && slides[from] && (
          <SlideLayer
            key={`slide-${run - 1}`}
            slide={slides[from]}
            n={from}
            total={count}
            labels={labels}
            leaving
            onLeft={() => dispatch({ type: "settle", run })}
          />
        )}
        <SlideLayer key={`slide-${run}`} slide={slide} n={index} total={count} labels={labels} />
      </div>

      <footer className="eyz-recap__nav">
        <button
          type="button"
          className="eyz-recap__icon-btn"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          aria-label={labels.previous}
          title={labels.previous}
        >
          <Icon name="chevronLeft" />
        </button>
        <button
          type="button"
          className="eyz-recap__icon-btn"
          onClick={() => {
            if (done) {
              go(0);
              setPaused(false);
            } else setPaused((p) => !p);
          }}
          aria-label={done ? labels.play : paused ? labels.play : labels.pause}
          title={done ? labels.play : paused ? labels.play : labels.pause}
        >
          <Icon name={paused || done ? "play" : "pause"} />
        </button>
        <button
          type="button"
          className="eyz-recap__icon-btn"
          onClick={forward}
          disabled={last && done}
          aria-label={labels.next}
          title={labels.next}
        >
          <Icon name="chevronRight" />
        </button>
        <button type="button" className={`eyz-recap__continue${done ? " eyz-recap__continue--done" : ""}`} onClick={onClose} aria-label={labels.continueWatching}>
          <Icon name="play" size={20} />
          <span>{labels.continueWatching}</span>
        </button>
      </footer>
    </div>
  );
}

type LayerProps = {
  slide: Recap["slides"][number];
  n: number;
  total: number;
  labels: ReturnType<typeof recapLabels>;
  leaving?: boolean;
  onLeft?: () => void;
};

/** One slide: its picture (slowly zooming, panned four ways in turn) beside its count, title and text. */
function SlideLayer({ slide, n, total, labels, leaving, onLeft }: LayerProps) {
  return (
    <div
      className={`eyz-recap__layer eyz-recap__layer--${leaving ? "leaving" : "entering"}`}
      data-pan={n % 4}
      aria-hidden={leaving || undefined}
      aria-live={leaving ? undefined : "polite"}
      aria-atomic={leaving ? undefined : true}
      onAnimationEnd={leaving ? (e) => { if (e.target === e.currentTarget) onLeft?.(); } : undefined}
    >
      <figure className="eyz-recap__figure">
        <span className="eyz-recap__frame">
          <img className="eyz-recap__image" src={slide.imageUrl} alt="" draggable={false} />
        </span>
      </figure>
      <div className="eyz-recap__text">
        <span className="eyz-recap__count">{labels.slideOf(n + 1, total)}</span>
        {slide.title && <h2 className="eyz-recap__slide-title">{slide.title}</h2>}
        {slide.body && <p className="eyz-recap__body">{slide.body}</p>}
      </div>
    </div>
  );
}

/** The control bar's Recap button. */
export function RecapButton({ onClick }: { onClick: () => void }) {
  const labels = recapLabels();
  return (
    <button type="button" className="eyz-btn eyz-btn--recap" onClick={onClick} aria-label={labels.openRecap} data-tooltip={labels.openRecap}>
      <Icon name="recap" />
    </button>
  );
}
