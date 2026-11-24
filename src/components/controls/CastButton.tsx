import { Icon } from "./icons";

type Props = {
  casting: boolean;
  deviceName: string | null;
  onClick: () => void;
};

/** Opens Chrome's Cast device picker, or stops casting. */
export function CastButton({ casting, deviceName, onClick }: Props) {
  const label = casting ? `Stop casting${deviceName ? ` to ${deviceName}` : ""}` : "Cast";
  return (
    <button
      type="button"
      className={`eyz-btn${casting ? " eyz-btn--active" : ""}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={casting}
      data-tooltip={label}
    >
      <Icon name={casting ? "castConnected" : "cast"} />
    </button>
  );
}
