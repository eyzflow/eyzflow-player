# EYZFlow Player (web)

React video player for EYZFlow streams, built on [Shaka Player](https://github.com/shaka-project/shaka-player). It plays DASH streams with Widevine, PlayReady and FairPlay DRM, and takes its look and features from an EYZFlow player config.

## Install

The package ships its TypeScript sources, so it installs straight from GitHub:

```bash
npm install github:eyzflow/eyzflow-player#v0.8.2
```

React 18 or later is a peer dependency. Releases are tagged; see the [CHANGELOG](CHANGELOG.md).

## Use

```tsx
import { EYZFlowPlayer } from "eyzflow-player";
import "eyzflow-player/style";

export function Watch() {
  return (
    <EYZFlowPlayer
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
| `offerId` | `string` | The offer (film or episode) `streamId` plays. With `drmAuthorizationKey` and `storefrontId`, the player reports the seconds watched for licensor royalties. See [Royalties](#royalties). |
| `isProtected` | `boolean` | Overrides the config's DRM setting. |
| `autoPlay` | `boolean` | Overrides the config's autoplay setting. |
| `controls` | `boolean` | Overrides whether the control bar is shown. |
| `fill` | `boolean` | Fill the parent element instead of keeping a 16:9 box. |
| `onReady` | `() => void` | Called when the stream is ready to play. |
| `onError` | `(msg: string) => void` | Called when loading or playback fails. |
| `onLicenseError` | `(error: PlayerLicenseError) => void` | The player key check refused this site or key. |
| `onLimitReached` | `(limit: PlaybackLimitError) => void` | A stream or device limit was reached, or the viewer was signed out on this device. |
| `onSignal` | `(signal: StreamSignal \| null) => void` | Playback entered an intro, recap or credits signal, or left one (`null`). See [Skip intro, recap and credits](#skip-intro-recap-and-credits). |
| `endScreen` | `EndScreenOptions` | A Netflix-style end screen with "Up next" and a row of films you pass. See [End screen](#end-screen). |
| `renderOverlay` | `(context: SignalOverlayContext) => ReactNode` | Your own UI over the player at a signal or after the end, e.g. similar films at the closing credits. See [Overlay](#overlay-at-the-credits). |
| `startTime` | `number` | Where `streamId` starts, in seconds, e.g. to resume. A film the end screen picks starts at the beginning. |
| `preferredAudioLanguage` | `string` | Audio language to start in when the stream has it (`"de"`, `"fr-BE"`, `"deu"` all match German). |
| `preferredSubtitleLanguage` | `string` | Subtitles shown from the start when the stream has them in this language; otherwise none. |
| `maxBitrate` | `number` | Highest bitrate the player picks, in bits per second (video and audio together). Wins over the config's `maxBitrate`. |
| `seekSteps` | `{ arrowKeySeconds?, buttonSeconds? }` | How far ← / → (default 5) and the back and forward buttons, `j` and `l` (default 10) jump, in whole seconds (1–600). Wins over the config's `seek`. |
| `thumbnails` | `boolean \| string` | Seek bar thumbnails. `true` (default): the stream's own track; a string: the URL of a WebVTT sprite track; `false`: off. |
| `onTimeUpdate` | `(time: number, duration: number) => void` | About four times a second while the content plays, and after a seek. Not during an ad. |
| `onPause` | `(time: number) => void` | The viewer paused (not an ad break or the end). |
| `onSeeked` | `(time: number) => void` | A seek finished at `time`. |
| `onEnded` | `() => void` | The stream played to its end. |

See [`sample-config.json`](sample-config.json) for the shape of a player config.

## Controls

The control bar follows the layout viewers know from YouTube: a thin seek bar in the theme's `accentColor` with a time tooltip (or the thumbnail) on hover, then play, volume (the slider slides out on hover) and time on the left, and subtitles, settings, picture in picture, AirPlay, cast and fullscreen on the right. The settings menu holds Subtitles/CC, Playback speed (0.25–2×) and Quality; `features.captions` and `features.qualitySelector` hide their entries.

Back, play/pause and forward buttons sit in the middle of the player, as on iOS, and show and hide with the control bar; `features.seekButtons: false` turns them off.

Clicking the video plays or pauses it and double-clicking goes fullscreen. With the player focused:

| Key | Action |
| --- | --- |
| `k` or space | Play / pause |
| `j` / `l` | Back / forward 10 s (`seek.buttonSeconds`) |
| ← / → | Back / forward 5 s (`seek.arrowKeySeconds`), also on the seek bar |
| ↑ / ↓ | Volume up / down |
| `m` | Mute |
| `f` | Fullscreen |
| `c` | Subtitles on / off |
| `0`–`9` | Jump to 0–90 % |

Quick presses add up: each starts from where the last seek is heading. The remote config's `seek.arrowKeySeconds` and `seek.buttonSeconds` (1–600, defaults 5 and 10) set the steps, and the `seekSteps` prop wins over them.

Clicks and keys don't act during an ad, the end screen or the app's overlay.

## Languages, quality and thumbnails

- **Languages:** the language props are read when a stream loads, so changing them doesn't restart playback. The viewer can still switch subtitles with the CC button or under Settings → Subtitles/CC.
- **Quality:** `maxBitrate` (or the config's `maxBitrate`) caps the renditions the player picks, e.g. `5000000` for 5 Mbps. Renditions above it are not offered under Settings → Quality either.
- **Thumbnails:** hovering or dragging the seek bar shows the frame at that point, from the stream's `thumbnails/thumbnail.vtt` (WebVTT sprites with `#xywh`). A stream without one shows no preview, and no error. `features.thumbnails: false` in the config turns them off.

## Ads

With `features.ads` on and an `ads.adTagUrl` in the player config, the player plays the tag through Google IMA.

- **Where:** at the stream's ad break markers (SCTE-35): a marker at the start is a pre-roll, the others are mid-rolls, each played once, none when passed by seeking. Streams without markers follow the tag (a VAST pre-roll, or a VMAP schedule).
- **Who:** for a storefront viewer (`storefrontId` and `drmAuthorizationKey`), the playback session says whether their plan includes ads; with a plan without ads, no ad request is made. Its targeting values (`plan`, `access`) go into the tag's `cust_params`.
- **Countdown:** "Ad in 5" … "Ad in 1" before each mid-roll, in English, German, French or Dutch. `features.adCountdown: false` turns it off; `ads.countdownSeconds` (1–30, default 5) sets its length.
- Ads don't play while casting or on AirPlay, and a tag that fails or returns no ad plays the content without an error.

## Skip intro, recap and credits

The intro, recap, opening and closing credits marked on a stream in the dashboard (Stream → Signals) come in the stream's manifest. While playback is in one, the player shows "Skip intro", "Skip recap" or "Skip credits" over the video; it seeks to the signal's end. The button takes the config's theme (bar colour, text colour, accent on hover, radius), and its text is in English, German, French or Dutch.

- `features.skipButtons: false` hides the button. The signal is still reported to `onSignal`.
- `skipButtonTypes` picks the types with a button: `{ intro, recap, openingCredits, closingCredits }`, by default all but `closingCredits` (skipping the closing credits only ends the film; the end screen belongs there). Missing types keep the default.
- `onSignal` gets `{ id, type, start, end, label }` when playback enters a signal (`type` is `intro`, `recap`, `opening_credits` or `closing_credits`), and `null` when it leaves.

## Royalties

Licensor royalties are counted from the seconds viewers watch. Give the player the viewer's authorization, the
storefront and the offer, and it reports them itself:

```tsx
<EYZFlowPlayer
  streamId={stream.id}
  drmAuthorizationKey={`Bearer ${accessToken}`}
  storefrontId={storefrontId}
  offerId={stream.offer_id}
/>
```

It sends `POST /v1/content/storefront/{storefrontId}/playback-events` every 30 s while the film plays, at once on a
pause, at the end and when the page is hidden, and a last time when playback stops or the page closes. Only time spent
playing the film counts: not ads, pauses, seeks or stalls. Each report carries the seconds since the previous one (at
most 120) and one session id per playback; seconds a report could not deliver go with the next one. With
`drm.parameters.catalogue_id` in the config, it is sent as well.

Leave `offerId` out for trailers. A film the end screen picks reports nothing, since its offer is not known. An app
that reports these events itself should stop doing so once it passes `offerId`, or the seconds are counted twice.

## End screen

Pass the films and the player does the rest: at the closing credits "Up next" shows over the video, which plays on full size behind it, counts down and plays the next stream at 0, and a row of films can be picked. A picked film plays in place.

```tsx
<EYZFlowPlayer
  streamId={episode.streamId}
  endScreen={{
    nextUp: { streamId: next.streamId, title: next.title, poster: next.poster, badge: "S1 E2" },
    items: similar.map((f) => ({ streamId: f.streamId, title: f.title, poster: f.poster, duration: f.seconds })),
    onSelect: (item, { autoplay, preventDefault }) => {
      router.replace(`/watch/${item.streamId}`); // keep the app in step; or preventDefault() and handle it yourself
    },
  }}
/>
```

- **Items:** `{ streamId, title, poster?, description?, duration? (seconds), badge?, data? }`. `nextUp` is one item, optionally with its own `autoplaySeconds`.
- **When:** from the closing credits signal. A stream without one gets it `secondsBeforeEnd` seconds before the end (default 20; 0: only when the film ends), as at the credits. `showAt: "end"`: only when the film ends. The last second of the film counts as the end.
- **Up next:** "Next in 10" … "Next in 1", then it plays; Cancel stops the countdown. It counts only while the credits play (or after the end).
- **Picking:** plays the item in place and calls `onSelect(item, { autoplay, preventDefault })`. With `preventDefault()` the player leaves it to you. When you then change `streamId`, your value wins.
- **Back:** "Back to credits", a click on the small video, or Esc, until the film ends.
- **Customize:** it takes the player config's theme. Every part has an `eyz-end-screen…` class (`__next`, `__play`, `__cancel`, `__row`, `__heading`, `__items`, `__card`, `__card-poster`, `__card-title`, `__badge`, …), `className` adds your own, `title` renames the row, and `renderItem(item, { select })` draws a card your way. For a layout of your own, use `renderOverlay`, which wins when it returns something.
- **Remote config:** `features.endScreen: false` turns it off; `endScreen.autoplaySeconds` (0–30, 0 = no countdown, default 10), `endScreen.showAt` (`credits` or `end`), `endScreen.shrinkVideo` (shrinks the video into the top-right corner, default off) and `endScreen.secondsBeforeEnd` (0–120, default 20) tune it. The prop's values win.
- Texts in English, German, French and Dutch. Nothing shows during an ad. Try it on the dev page with `?endScreenDemo=1`.

## Overlay at the credits

`renderOverlay` draws your own UI inside the player while playback is in a signal or after the film ended: similar films, a "Next episode" card, an end screen. The player calls it with the moment and controls, and shows what it returns; return `null` to show nothing.

```tsx
<EYZFlowPlayer
  streamId={id}
  renderOverlay={({ signal, ended, controls }) =>
    signal?.type === "closing_credits" || ended ? (
      <SimilarFilms films={similar} onPick={openFilm} onClose={controls.dismiss} />
    ) : null
  }
/>
```

- It is drawn inside the player's element, so it stays in fullscreen: over the video and subtitles, under the control bar, which stays usable. Position your content in the player's box (the layer takes no clicks; your content does).
- `controls` has `skip()`, `seek(seconds)`, `play()`, `pause()` and `dismiss()`. `dismiss()` hides it until playback enters another signal or the film ends.
- While it shows, the skip button hides. Nothing shows during an ad.
- Choosing the films is up to your app. Try it on the dev page with `?overlayDemo=1`.

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
