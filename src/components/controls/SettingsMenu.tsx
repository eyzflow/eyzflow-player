import { useEffect, useRef, useState } from "react";
import type { ShakaTrack, ShakaTextTrack } from "../../lib/shaka-types";
import type { AudioOption } from "../../lib/media-tracks";
import { Icon, type IconName } from "./icons";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

type Panel = "main" | "quality" | "subtitles" | "audio" | "speed";

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  tracks: ShakaTrack[];
  activeTrack: ShakaTrack | null;
  textTracks: ShakaTextTrack[];
  activeTextTrack: ShakaTextTrack | null;
  captionsVisible: boolean;
  audioOptions: AudioOption[];
  activeAudio: AudioOption | null;
  showQuality: boolean;
  /** Playback speed applies to the video in this browser: hidden while casting. */
  showSpeed?: boolean;
  showSubtitles: boolean;
  onSelectTrack: (t: ShakaTrack) => void;
  onSelectTextTrack: (t: ShakaTextTrack) => void;
  onCaptionsOff: () => void;
  onSelectAudio: (option: AudioOption) => void;
  /** The menu opened or closed (the player keeps its controls up while it is open). */
  onOpenChange?: (open: boolean) => void;
};

function languageLabel(track: { label: string | null; language: string }, fallback: string): string {
  if (track.label) return track.label;
  if (track.language && track.language !== "und") {
    try {
      const name = new Intl.DisplayNames(undefined, { type: "language" }).of(track.language);
      if (name) return name;
    } catch {
      // Unknown/malformed language code — fall back to the raw tag.
    }
    return track.language;
  }
  return fallback;
}

function textTrackLabel(track: ShakaTextTrack, index: number): string {
  return languageLabel(track, `Subtitles ${index + 1}`);
}

function audioLabel(option: AudioOption, index: number): string {
  return languageLabel(option, `Audio ${index + 1}`);
}

function MenuOption({
  label,
  selected,
  onPick,
}: {
  label: string;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      className={`eyz-menu-item eyz-menu-option${selected ? " eyz-menu-option--selected" : ""}`}
      role="menuitemradio"
      aria-checked={selected}
      onClick={onPick}
    >
      <span className="eyz-menu-check">{selected && <Icon name="check" />}</span>
      <span className="eyz-menu-label">{label}</span>
    </button>
  );
}

function speedLabel(rate: number): string {
  return rate === 1 ? "Normal" : String(rate);
}

export function SettingsMenu({
  videoRef,
  tracks,
  activeTrack,
  textTracks,
  activeTextTrack,
  captionsVisible,
  audioOptions,
  activeAudio,
  showQuality,
  showSpeed = true,
  showSubtitles,
  onSelectTrack,
  onSelectTextTrack,
  onCaptionsOff,
  onSelectAudio,
  onOpenChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("main");
  const [rate, setRate] = useState(1);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Variants of the audio language playing now, so picking a quality keeps the language.
  const videoTracks = tracks
    .filter((t) => t.height != null && (!activeTrack || t.language === activeTrack.language))
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))
    .filter((t, i, all) => i === 0 || all[i - 1].height !== t.height);

  // Keep the menu's speed in step with the video (keyboard shortcuts, other code).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => setRate(video.playbackRate);
    sync();
    video.addEventListener("ratechange", sync);
    return () => video.removeEventListener("ratechange", sync);
  }, [videoRef]);

  const setMenuOpen = (next: boolean) => {
    setOpen(next);
    setPanel("main");
    onOpenChange?.(next);
  };

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
    // setMenuOpen is stable enough for this listener's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function pick(action: () => void) {
    action();
    setMenuOpen(false);
  }

  function setSpeed(s: number) {
    const video = videoRef.current;
    if (video) video.playbackRate = s;
  }

  const hasQuality = showQuality && videoTracks.length > 0;
  const hasSubtitles = showSubtitles && textTracks.length > 0;
  // One language is nothing to choose between.
  const hasAudio = audioOptions.length > 1;

  const qualityValue = activeTrack?.height ? `${activeTrack.height}p` : "Auto";
  const subtitleValue =
    captionsVisible && activeTextTrack
      ? textTrackLabel(activeTextTrack, textTracks.findIndex((t) => t.id === activeTextTrack.id))
      : "Off";
  const audioValue = activeAudio
    ? audioLabel(activeAudio, audioOptions.findIndex((o) => o.id === activeAudio.id))
    : "Default";

  const row = (icon: IconName, label: string, value: string, target: Panel) => (
    <button
      key={target}
      className="eyz-menu-item"
      role="menuitem"
      onClick={() => setPanel(target)}
    >
      <span className="eyz-menu-icon"><Icon name={icon} /></span>
      <span className="eyz-menu-label">{label}</span>
      <span className="eyz-menu-value">{value}</span>
      <span className="eyz-menu-chevron"><Icon name="chevronRight" /></span>
    </button>
  );

  const header = (title: string) => (
    <button className="eyz-menu-header" onClick={() => setPanel("main")}>
      <Icon name="chevronLeft" />
      <span>{title}</span>
    </button>
  );

  return (
    <div className="eyz-settings" ref={rootRef}>
      {open && (
        <div className="eyz-menu" role="menu">
          {panel === "main" && (
            <>
              {hasSubtitles && row("captions", "Subtitles/CC", subtitleValue, "subtitles")}
              {hasAudio && row("audio", "Audio", audioValue, "audio")}
              {showSpeed && row("speed", "Playback speed", speedLabel(rate), "speed")}
              {hasQuality && row("tune", "Quality", qualityValue, "quality")}
            </>
          )}
          {panel === "quality" && (
            <>
              {header("Quality")}
              <div className="eyz-menu-scroll">
                {videoTracks.map((t) => (
                  <MenuOption
                    key={t.id}
                    label={`${t.height}p`}
                    selected={activeTrack?.height === t.height}
                    onPick={() => pick(() => onSelectTrack(t))}
                  />
                ))}
              </div>
            </>
          )}
          {panel === "subtitles" && (
            <>
              {header("Subtitles/CC")}
              <div className="eyz-menu-scroll">
                <MenuOption label="Off" selected={!captionsVisible} onPick={() => pick(onCaptionsOff)} />
                {textTracks.map((t, i) => (
                  <MenuOption
                    key={t.id}
                    label={textTrackLabel(t, i)}
                    selected={captionsVisible && activeTextTrack?.id === t.id}
                    onPick={() => pick(() => onSelectTextTrack(t))}
                  />
                ))}
              </div>
            </>
          )}
          {panel === "audio" && (
            <>
              {header("Audio")}
              <div className="eyz-menu-scroll">
                {audioOptions.map((o, i) => (
                  <MenuOption
                    key={o.id}
                    label={audioLabel(o, i)}
                    selected={activeAudio?.id === o.id}
                    onPick={() => pick(() => onSelectAudio(o))}
                  />
                ))}
              </div>
            </>
          )}
          {panel === "speed" && (
            <>
              {header("Playback speed")}
              <div className="eyz-menu-scroll">
                {SPEEDS.map((s) => (
                  <MenuOption
                    key={s}
                    label={speedLabel(s)}
                    selected={rate === s}
                    onPick={() => pick(() => setSpeed(s))}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <button
        className={`eyz-btn eyz-btn--settings${open ? " eyz-btn--open" : ""}`}
        onClick={() => setMenuOpen(!open)}
        aria-label="Settings"
        aria-haspopup="menu"
        aria-expanded={open}
        data-tooltip={open ? undefined : "Settings"}
      >
        <Icon name="settings" />
      </button>
    </div>
  );
}
