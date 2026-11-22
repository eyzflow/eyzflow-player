# EYZFlow Player (web)

React video player for EYZFlow streams, built on [Shaka Player](https://github.com/shaka-project/shaka-player). It plays DASH streams with Widevine, PlayReady and FairPlay DRM, and takes its look and features from an EYZFlow player config.

## Install

The package ships its TypeScript sources, so it installs straight from GitHub:

```bash
npm install github:eyzflow/eyzflow-player#v0.2.0
```

React 18 or later is a peer dependency. Releases are tagged; see the [CHANGELOG](CHANGELOG.md).

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
| `playerKey` | `string` | The organisation's player key (`pk_…`, dashboard: Player → Keys). The player checks it for this site before playing; it also turns on playback quality analytics when the key has them on. |
| `analytics` | `boolean \| { cmcd?: boolean }` | Playback quality analytics with a player key. `false` turns them off. Default on. |
| `drmAuthorizationKey` | `string` | The viewer's authorization (`Bearer …`): DRM licences on protected streams, and the playback session with `storefrontId`. |
| `storefrontId` | `string` | The storefront the viewer watches on. With it the player opens a playback session: the plan's stream and device limits apply, and the plan decides whether ads play. |
| `deviceName` | `string` | Shown in the viewer's device list, e.g. "Living room". |
| `isProtected` | `boolean` | Overrides the config's DRM setting. |
| `autoPlay` | `boolean` | Overrides the config's autoplay setting. |
| `controls` | `boolean` | Overrides whether the control bar is shown. |
| `fill` | `boolean` | Fill the parent element instead of keeping a 16:9 box. |
| `onReady` | `() => void` | Called when the stream is ready to play. |
| `onError` | `(msg: string) => void` | Called when loading or playback fails. |
| `onLicenseError` | `(error: PlayerLicenseError) => void` | The player key check refused this site or key. |
| `onLimitReached` | `(limit: PlaybackLimitError) => void` | A stream or device limit was reached, or the viewer was signed out on this device. |

See [`sample-config.json`](sample-config.json) for the shape of a player config.

## Ads

With `features.ads` on and an `ads.adTagUrl` in the player config, the player plays the tag through Google IMA.

- **Where:** at the stream's ad break markers (SCTE-35): a marker at the start is a pre-roll, the others are mid-rolls, each played once, none when passed by seeking. Streams without markers follow the tag (a VAST pre-roll, or a VMAP schedule).
- **Who:** for a storefront viewer (`storefrontId` and `drmAuthorizationKey`), the playback session says whether their plan includes ads; with a plan without ads, no ad request is made. Its targeting values (`plan`, `access`) go into the tag's `cust_params`.
- **Countdown:** "Ad in 5" … "Ad in 1" before each mid-roll, in English, German, French or Dutch. `features.adCountdown: false` turns it off; `ads.countdownSeconds` (1–30, default 5) sets its length.
- Ads don't play while casting or on AirPlay, and a tag that fails or returns no ad plays the content without an error.

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
