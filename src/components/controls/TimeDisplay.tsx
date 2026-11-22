import { formatTime } from "../../lib/format-time";

type Props = { currentTime: number; duration: number };

export function TimeDisplay({ currentTime, duration }: Props) {
  return (
    <span className="eyz-time">
      {formatTime(currentTime)} / {formatTime(duration)}
    </span>
  );
}
