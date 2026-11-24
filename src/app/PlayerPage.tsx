import { EYZFlowPlayer } from "../components/EYZFlowPlayer";
import { DEFAULT_FEATURES, type PlayerConfig } from "../lib/config-types";
import type { SignalOverlayContext } from "../lib/signal-overlay";
import type { EndScreenOptions } from "../lib/end-screen";

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
  // Shows three placeholder films at the closing credits and after the end, as a renderOverlay example.
  const overlayDemo = params.get("overlayDemo") === "1";
  // The built-in end screen with placeholder films: "Up next" is `streamId`-2, the row `streamId`-a, -b, -c.
  const endScreenDemo = params.get("endScreenDemo") === "1";
  // The Cast receiver to try without a remote config (e.g. A534F914, the EYZFlow receiver, for protected streams).
  const castAppId = params.get("castAppId");
  const config: Partial<PlayerConfig> | undefined =
    adTag || castAppId
      ? {
          ...(adTag && { features: { ...DEFAULT_FEATURES, ads: true }, ads: { adTagUrl: adTag } }),
          ...(castAppId && { cast: { receiverAppId: castAppId } }),
        }
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
      <EYZFlowPlayer
        streamId={streamId}
        playerKey={playerKey}
        analytics={analytics}
        configId={configId}
        config={config}
        drmAuthorizationKey={drmKey}
        storefrontId={storefrontId}
        autoPlay={autoPlay}
        renderOverlay={overlayDemo ? similarFilms : undefined}
        endScreen={endScreenDemo ? demoEndScreen(streamId) : undefined}
        fill
      />
    </div>
  );
}

/** The overlay example: three cards at the closing credits or after the film ended. */
function similarFilms({ signal, ended, controls }: SignalOverlayContext) {
  if (signal?.type !== "closing_credits" && !ended) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 24,
        bottom: 24,
        maxWidth: "calc(100% - 48px)",
        padding: 16,
        borderRadius: 12,
        background: "rgba(10, 10, 10, 0.82)",
        color: "#fafafa",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 12, fontSize: 14 }}>
        <strong>Similar films</strong>
        {!ended && (
          <button type="button" onClick={controls.dismiss} style={{ background: "none", border: 0, color: "#a3a3a3", cursor: "pointer" }}>
            Watch the credits
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: 12, overflowX: "auto" }}>
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => console.info(`[demo] picked similar film ${n}`)}
            style={{
              width: 140,
              aspectRatio: "16 / 9",
              flexShrink: 0,
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8,
              background: `linear-gradient(135deg, hsl(${n * 70}, 45%, 35%), hsl(${n * 70 + 40}, 45%, 20%))`,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Film {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A 16:9 placeholder poster, as a data URL. */
function demoPoster(hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,42%)"/><stop offset="1" stop-color="hsl(${hue + 50},55%,18%)"/></linearGradient></defs><rect width="16" height="9" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function demoEndScreen(streamId: string): EndScreenOptions {
  return {
    nextUp: {
      streamId: `${streamId}-2`,
      title: "Episode 2: The Return",
      description: "The crew follows a signal to the edge of charted space, where nothing is what it seems.",
      poster: demoPoster(200),
      badge: "S1 E2",
    },
    items: ["a", "b", "c"].map((id, i) => ({
      streamId: `${streamId}-${id}`,
      title: ["Northern Lights", "The Long Shore", "City of Glass"][i],
      poster: demoPoster(20 + i * 90),
      duration: [5520, 6300, 4980][i],
      badge: i === 0 ? "New" : undefined,
    })),
    onSelect: (item, { autoplay }) => console.info(`[demo] end screen picked ${item.streamId}${autoplay ? " (autoplay)" : ""}`),
  };
}
