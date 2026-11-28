import type { ShakaTrack, ShakaTextTrack, ShakaThumbnail } from "../../lib/shaka-types";
import type { PlayerFeatures } from "../../lib/config-types";
import type { AudioOption } from "../../lib/media-tracks";
import { PlayPauseButton } from "./PlayPauseButton";
import { SeekBar } from "./SeekBar";
import { TimeDisplay } from "./TimeDisplay";
import { VolumeControl } from "./VolumeControl";
import { CaptionsButton } from "./CaptionsButton";
import { SettingsMenu } from "./SettingsMenu";
import { CastButton } from "./CastButton";
import { AirPlayButton } from "./AirPlayButton";
import { PipButton } from "./PipButton";
import { FullscreenButton } from "./FullscreenButton";
import { RecapButton } from "../RecapSlideshow";

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
  audioOptions: AudioOption[];
  activeAudio: AudioOption | null;
  features: PlayerFeatures;
  /** The Cast button: shown once a Cast device can be picked. */
  cast?: { available: boolean; casting: boolean; deviceName: string | null; onToggle: () => void };
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
  onSelectAudio: (option: AudioOption) => void;
  onToggleCaptions: () => void;
  onMenuOpenChange?: (open: boolean) => void;
  /** The seek bar preview at a time; absent without a thumbnails track. */
  getThumbnail?: (time: number) => Promise<ShakaThumbnail | null>;
  /** Opens the recap; absent while there is none to offer here. */
  onRecap?: () => void;
};

export function ControlBar({
  playing, currentTime, duration, buffered,
  volume, muted,
  tracks, activeTrack, textTracks, activeTextTrack, captionsVisible,
  audioOptions, activeAudio,
  features, cast,
  videoRef, containerRef,
  onPlay, onPause, onSeek,
  onVolume, onMute,
  onSelectTrack, onSelectTextTrack, onCaptionsOff, onSelectAudio, onToggleCaptions,
  onMenuOpenChange,
  getThumbnail,
  onRecap,
}: Props) {
  return (
    <div className="eyz-controls">
      <SeekBar currentTime={currentTime} duration={duration} buffered={buffered} onSeek={onSeek} getThumbnail={getThumbnail} />
      <div className="eyz-controls-row">
        <div className="eyz-controls-left">
          <PlayPauseButton playing={playing} onClick={playing ? onPause : onPlay} />
          <VolumeControl volume={volume} muted={muted} onMute={onMute} onVolume={onVolume} />
          <TimeDisplay currentTime={currentTime} duration={duration} />
        </div>
        <div className="eyz-controls-right">
          {onRecap && <RecapButton onClick={onRecap} />}
          {features.captions && textTracks.length > 0 && (
            <CaptionsButton visible={captionsVisible} onToggle={onToggleCaptions} />
          )}
          <SettingsMenu
            videoRef={videoRef}
            tracks={tracks}
            activeTrack={activeTrack}
            textTracks={textTracks}
            activeTextTrack={activeTextTrack}
            captionsVisible={captionsVisible}
            audioOptions={audioOptions}
            activeAudio={activeAudio}
            // Quality and speed belong to the video in this browser; the TV picks its own.
            showQuality={features.qualitySelector && !cast?.casting}
            showSpeed={!cast?.casting}
            showSubtitles={features.captions}
            onSelectTrack={onSelectTrack}
            onSelectTextTrack={onSelectTextTrack}
            onCaptionsOff={onCaptionsOff}
            onSelectAudio={onSelectAudio}
            onOpenChange={onMenuOpenChange}
          />
          {features.pip && <PipButton videoRef={videoRef} />}
          {features.airplay && <AirPlayButton videoRef={videoRef} />}
          {features.chromecast && cast?.available && (
            <CastButton casting={cast.casting} deviceName={cast.deviceName} onClick={cast.onToggle} />
          )}
          <FullscreenButton containerRef={containerRef} />
        </div>
      </div>
    </div>
  );
}
