import { useEffect, useState } from "react";
import {
  endScreenLabels,
  formatRuntime,
  type EndScreenItem,
  type EndScreenOptions,
  type EndScreenPhase,
  type EndScreenSettings,
} from "../lib/end-screen";

type Props = {
  options: EndScreenOptions;
  settings: EndScreenSettings;
  phase: Exclude<EndScreenPhase, null>;
  /** The countdown runs only while this is true (playing the credits, or the film ended). */
  counting: boolean;
  onSelect: (item: EndScreenItem, autoplay: boolean) => void;
  /** Back to the credits (and the full-size video): hides the end screen for this moment. */
  onDismiss: () => void;
};

/**
 * The end screen over the closing credits or after the film: "Up next" with a countdown that plays it at 0, and a row
 * of films. Every part has an `eyz-end-screen…` class for the app's own styles.
 */
export function EndScreen({ options, settings, phase, counting, onSelect, onDismiss }: Props) {
  const labels = endScreenLabels();
  const { nextUp, items = [] } = options;
  const autoplay = nextUp ? settings.autoplaySeconds : 0;
  const [left, setLeft] = useState<number | null>(autoplay > 0 ? autoplay : null);
  // One pick per showing: a second click (or the countdown) after the first does nothing.
  const [picked, setPicked] = useState(false);

  const select = (item: EndScreenItem, byCountdown = false) => {
    if (picked) return;
    setPicked(true);
    onSelect(item, byCountdown);
  };

  useEffect(() => {
    if (left === null || !counting || !nextUp || picked) return;
    // A second at a time, only while counting; the last one plays the next stream.
    const timer = setTimeout(() => {
      if (left <= 1) {
        setLeft(0);
        select(nextUp, true);
      } else {
        setLeft(left - 1);
      }
    }, 1000);
    return () => clearTimeout(timer);
    // `select` reads only this render's props and state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, counting, nextUp, picked]);

  return (
    <div
      className={`eyz-end-screen eyz-end-screen--${phase}${settings.shrinkVideo && phase === "credits" ? " eyz-end-screen--shrunk" : ""}${options.className ? ` ${options.className}` : ""}`}
      role="region"
      aria-label={nextUp ? labels.upNext : options.title ?? labels.moreLikeThis}
    >
      <div className="eyz-end-screen__content">
        {phase === "credits" && (
          <button type="button" className="eyz-end-screen__back" onClick={onDismiss}>
            {labels.backToCredits}
          </button>
        )}
        {nextUp && (
          <section className="eyz-end-screen__next">
            <Poster item={nextUp} className="eyz-end-screen__next-poster" />
            <div className="eyz-end-screen__next-body">
              <div className="eyz-end-screen__eyebrow">{labels.upNext}</div>
              <div className="eyz-end-screen__next-title">{nextUp.title}</div>
              {nextUp.description && <p className="eyz-end-screen__next-description">{nextUp.description}</p>}
              <div className="eyz-end-screen__actions">
                <button
                  type="button"
                  className="eyz-end-screen__play"
                  onClick={() => select(nextUp)}
                  style={left !== null ? ({ "--eyz-end-progress": `${((autoplay - left) / autoplay) * 100}%` } as React.CSSProperties) : undefined}
                  autoFocus
                >
                  <span className="eyz-end-screen__play-label">
                    {left !== null ? labels.nextIn(Math.max(left, 0)) : labels.play}
                  </span>
                </button>
                {left !== null && (
                  <button type="button" className="eyz-end-screen__cancel" onClick={() => setLeft(null)}>
                    {labels.cancel}
                  </button>
                )}
              </div>
            </div>
          </section>
        )}
        {items.length > 0 && (
          <section className="eyz-end-screen__row">
            <h3 className="eyz-end-screen__heading">{options.title ?? labels.moreLikeThis}</h3>
            <ul className="eyz-end-screen__items">
              {items.map((item) => (
                <li key={item.streamId} className="eyz-end-screen__item">
                  {options.renderItem ? (
                    options.renderItem(item, { select: () => select(item) })
                  ) : (
                    <button type="button" className="eyz-end-screen__card" onClick={() => select(item)}>
                      <Poster item={item} className="eyz-end-screen__card-poster" />
                      <span className="eyz-end-screen__card-title">{item.title}</span>
                      {formatRuntime(item.duration) && (
                        <span className="eyz-end-screen__card-meta">{formatRuntime(item.duration)}</span>
                      )}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Poster({ item, className }: { item: EndScreenItem; className: string }) {
  return (
    <span className={className} style={item.poster ? { backgroundImage: `url("${item.poster.replace(/"/g, "%22")}")` } : undefined}>
      {item.badge && <span className="eyz-end-screen__badge">{item.badge}</span>}
    </span>
  );
}
