import { formatTime } from "../../lib/format-time";

type Props = { currentTime: number; duration: number };

export function TimeDisplay({ currentTime, duration }: Props) {
  return (
    <span className="eyz-time">
      <span>{formatTime(currentTime)}</span>
      <span className="eyz-time-sep"> / </span>
      <span className="eyz-time-duration">{formatTime(duration)}</span>
    </span>
  );
}
