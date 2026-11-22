import { EyzflowPlayer } from "../components/EyzflowPlayer";
import { DEFAULT_FEATURES, type PlayerConfig } from "../lib/config-types";

export function PlayerPage() {
  const params = new URLSearchParams(window.location.search);
  const streamId = params.get("streamId");
  const configId = params.get("configId") ?? undefined;
  const drmKey = params.get("drmKey") ?? undefined;
  const storefrontId = params.get("storefrontId") ?? undefined;
  const playerKey = params.get("playerKey") ?? undefined;
  const analytics = params.get("analytics") !== "false";
  const autoPlay = params.get("autoPlay") !== "false";
  // For trying an ad tag without a remote config: turns ads on with this tag (replaces the config's features).
  const adTag = params.get("adTag");
  const config: Partial<PlayerConfig> | undefined = adTag
    ? { features: { ...DEFAULT_FEATURES, ads: true }, ads: { adTagUrl: adTag } }
    : undefined;

  if (!streamId) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#0a0a0a",
          color: "#737373",
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
        }}
      >
        Missing <code style={{ marginLeft: 6, color: "#8b87ff" }}>?streamId=</code>
      </div>
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
      <EyzflowPlayer
        streamId={streamId}
        playerKey={playerKey}
        analytics={analytics}
        configId={configId}
        config={config}
        drmAuthorizationKey={drmKey}
        storefrontId={storefrontId}
        autoPlay={autoPlay}
        fill
      />
    </div>
  );
}
