import { EyzflowPlayer } from "../components/EyzflowPlayer";

export function PlayerPage() {
  const params = new URLSearchParams(window.location.search);
  const streamId = params.get("streamId");
  const configId = params.get("configId") ?? undefined;
  const drmKey = params.get("drmKey") ?? undefined;
  const storefrontId = params.get("storefrontId") ?? undefined;
  const autoPlay = params.get("autoPlay") !== "false";

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
        configId={configId}
        drmAuthorizationKey={drmKey}
        storefrontId={storefrontId}
        autoPlay={autoPlay}
        fill
      />
    </div>
  );
}
