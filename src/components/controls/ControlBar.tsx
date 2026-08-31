import type { ShakaTrack, ShakaTextTrack } from "../../lib/shaka-types";
import type { PlayerCastConfig, PlayerFeatures } from "../../lib/config-types";
import { PlayPauseButton } from "./PlayPauseButton";
import { SeekBar } from "./SeekBar";
import { TimeDisplay } from "./TimeDisplay";
import { VolumeControl } from "./VolumeControl";
import { QualitySelector } from "./QualitySelector";
import { CaptionsSelector } from "./CaptionsSelector";
import { CastButton } from "./CastButton";
import { AirPlayButton } from "./AirPlayButton";
import { PipButton } from "./PipButton";
import { FullscreenButton } from "./FullscreenButton";

type Props = {
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  muted: boolean;
  tracks: ShakaTrack[];
  activeTrack: ShakaTrack | null;
  textTracks: ShakaTextTrack[];
  activeTextTrack: ShakaTextTrack | null;
  captionsVisible: boolean;
  features: PlayerFeatures;
  castConfig?: PlayerCastConfig;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (s: number) => void;
  onVolume: (v: number) => void;
  onMute: (m: boolean) => void;
  onSelectTrack: (t: ShakaTrack) => void;
  onSelectTextTrack: (t: ShakaTextTrack) => void;
  onCaptionsOff: () => void;
};

export function ControlBar({
  playing, currentTime, duration, buffered,
  volume, muted,
  tracks, activeTrack, textTracks, activeTextTrack, captionsVisible,
  features, castConfig,
  videoRef, containerRef,
  onPlay, onPause, onSeek,
  onVolume, onMute,
  onSelectTrack, onSelectTextTrack, onCaptionsOff,
}: Props) {
  return (
    <div className="eyz-controls">
      <SeekBar currentTime={currentTime} duration={duration} buffered={buffered} onSeek={onSeek} />
      <div className="eyz-controls-row">
        <div className="eyz-controls-left">
          <PlayPauseButton playing={playing} onClick={playing ? onPause : onPlay} />
          <VolumeControl volume={volume} muted={muted} onMute={onMute} onVolume={onVolume} />
          <TimeDisplay currentTime={currentTime} duration={duration} />
        </div>
        <div className="eyz-controls-right">
          {features.qualitySelector && (
            <QualitySelector tracks={tracks} activeTrack={activeTrack} onSelect={onSelectTrack} />
          )}
          {features.captions && (
            <CaptionsSelector
              textTracks={textTracks}
              activeTextTrack={activeTextTrack}
              captionsVisible={captionsVisible}
              onSelect={onSelectTextTrack}
              onOff={onCaptionsOff}
            />
          )}
          {features.airplay && <AirPlayButton videoRef={videoRef} />}
          {features.chromecast && <CastButton videoRef={videoRef} castConfig={castConfig} />}
          {features.pip && <PipButton videoRef={videoRef} />}
          <FullscreenButton containerRef={containerRef} />
        </div>
      </div>
    </div>
  );
}
