# EYZFlow Player (web)

React video player for EYZFlow streams, built on [Shaka Player](https://github.com/shaka-project/shaka-player). It plays DASH streams with Widevine, PlayReady and FairPlay DRM, and takes its look and features from an EYZFlow player config.

## Install

The package ships its TypeScript sources, so it installs straight from GitHub:

```bash
npm install github:eyzflow/eyzflow-player
```

React 18 or later is a peer dependency.

## Use

```tsx
import { EyzflowPlayer } from "eyzflow-player";
import "eyzflow-player/style";

export function Watch() {
  return (
    <EyzflowPlayer
      streamId="your-stream-id"
      configId="your-player-config-id"
      drmAuthorizationKey={drmKey}
    />
  );
}
```

| Prop | Type | Description |
| --- | --- | --- |
| `streamId` | `string` | The stream to play. Required. |
| `configId` | `string` | Player config to load from the EYZFlow API (theme and features). |
| `config` | `Partial<PlayerConfig>` | Config values that override the loaded or default config. |
| `drmAuthorizationKey` | `string` | Authorization for DRM licence requests on protected streams. |
| `isProtected` | `boolean` | Overrides the config's DRM setting. |
| `autoPlay` | `boolean` | Overrides the config's autoplay setting. |
| `controls` | `boolean` | Overrides whether the control bar is shown. |
| `fill` | `boolean` | Fill the parent element instead of keeping a 16:9 box. |
| `onReady` | `() => void` | Called when the stream is ready to play. |
| `onError` | `(msg: string) => void` | Called when loading or playback fails. |

See [`sample-config.json`](sample-config.json) for the shape of a player config.

## Endpoints

The player talks to the public EYZFlow endpoints by default. With Vite, they can be pointed elsewhere at build time:

| Variable | Default |
| --- | --- |
| `VITE_DRM_API_ORIGIN` | `https://api.eyzflow.com` |
| `VITE_CONFIG_API_ORIGIN` | `https://api.eyzflow.com` |
| `VITE_STREAM_CDN_ORIGIN` | `https://stream.eyzflow.com` |

## Embed page

The repository also contains a standalone player page, used for iframe embeds:

```bash
npm install
npm run dev
```

Then open `http://localhost:5173/?streamId=<id>&configId=<id>&drmKey=<key>`. Add `autoPlay=false` to start paused. `npm run build` writes the page to `dist-app/`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the embed page with hot reload. |
| `npm run build` | Type-check and build the embed page into `dist-app/`. |
| `npm run build:lib` | Build the library into `dist/`. |
| `npm run lint` | Run ESLint. |
