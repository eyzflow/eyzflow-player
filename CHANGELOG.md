# Changelog

## 0.10.0

- Watch progress (EYF-493): with `catalogueId`, the player saves where the viewer is for "Continue watching". With
  `drmAuthorizationKey` and `storefrontId` it sends `PUT /watch-history` itself: at most every 10 s while playing, at
  once on a pause or a seek, when the page is hidden or closes, and as completed at the end (or from the last 5 %).
  While casting, the TV's position is saved. Ads save nothing, and nothing is saved before playback reaches
  `startTime`. `watchProgressStore` sends it to the app's own store instead, as on iOS and Flutter; `null` turns it
  off. Apps that save progress themselves should stop once they pass `catalogueId`.

## 0.9.2

- Chromecast (EYF-478): stopping casting now keeps the subtitle (or subtitles off) and audio language last on on the
  TV, whether the viewer picked them in the browser's menus or on the TV's own menu. Audio prefers the same label, so
  German 5.1 stays German 5.1 where the film also has German stereo. A language the browser's stream lacks leaves the
  browser's track as it was. Before, the browser went back to the tracks it had before casting.

## 0.9.1

- Chromecast (EYF-477): a player config with no Cast receiver id now casts through the EYZFlow receiver (`A534F914`)
  instead of Google's default receiver, which can't send the DRM `access-token`, so protected films didn't play on the
  TV. A config that names its own receiver keeps it.

## 0.9.0

- Chromecast (EYF-475): the Cast button now plays the film on the TV. It sends the EYZFlow receiver the stream's DASH
  manifest, the Widevine licence URL and the browser's `access-token`, from where the viewer is, with the subtitle and
  audio language on in the browser. While casting, play, pause, seek, volume and the time drive the TV, and the
  Subtitles/CC and Audio menus list the TV's tracks and switch them there. Stopping casting resumes in the browser at
  the TV's position. Before, the button only opened a Cast session, so nothing played and the menus kept switching
  the browser's video. The new `title` and `poster` props name the film on the TV and in the Cast media controls (a
  film picked from the end screen uses its own).
- Audio menu: the settings menu has an Audio entry when the film has more than one audio language. Picking a quality
  keeps the audio language.
- Error messages (EYF-472): the error screen and `onError` name EYZFlow Player and the error code
  (`EYZFlow Player error 1001`) instead of passing on Shaka's own text (`Playback error 1001: Shaka Error 1001`). If
  the player library can't load, viewers see `EYZFlow Player couldn't start.` Analytics still record the full error.

## 0.8.3

- Safari resume (EYF-464): a FairPlay film with a saved position opens there (`master.m3u8#t=<s>`) instead of
  seeking once the keys arrive, which froze Safari's HLS playback.
- Playback sessions: the heartbeat and the close no longer send `Content-Type: application/json` without a body. The
  API refused them (400), so sessions went stale and a closed player kept counting against the plan's stream limit.

## 0.8.2

- Safari DRM (EYF-464): protected streams on Safari play through Safari's own HLS playback, so the FairPlay licence
  request carries the playlist's `skd://` asset id. Through MediaSource the licence server refused it (Shaka error
  6007). On Safari, protected streams don't apply `maxBitrate` there.

## 0.8.1

- Safari DRM (EYF-464): protected streams play on Safari (macOS and iOS). Where FairPlay is the browser's only DRM, the
  player loads the stream's HLS playlist (`master.m3u8`), which carries the FairPlay key; every other browser keeps
  DASH (`manifest.mpd`), and clear streams always do.

## 0.8.0

- Royalty usage (EYF-231): with `offerId`, `drmAuthorizationKey` and `storefrontId`, the player reports the seconds
  the viewer watched to `playback-events` for licensor royalties: every 30 s while playing, on pause, at the end, when
  the page is hidden and when playback stops. Ads, pauses, seeks and stalls don't count, and it works whether playback
  analytics are on or not. Apps that send these events themselves should stop once they pass `offerId`.

## 0.7.0

- Back and forward buttons (EYF-229): back, play/pause and forward in the middle of the player, as on iOS. They show
  and hide with the control bar; `features.seekButtons: false` in the config turns them off.
- Seek steps (EYF-229): `seek.arrowKeySeconds` (← / →, default 5) and `seek.buttonSeconds` (the buttons and `j`/`l`,
  default 10) in the player config, 1–600 s. The `seekSteps` prop wins over the config.
- Quick ← / → presses add up (EYF-229): each press starts from where the last seek is heading, and ← / → also jump
  when the seek bar has focus (it used to move a tenth of a second there). The flash shows the total, e.g. "30 seconds",
  on the side it seeks to.
- End screen (EYF-230): at the closing credits the video now plays on full size behind the end screen; `shrinkVideo`
  (prop or config) is off by default. With it on, the corner video is sized to the picture (about 42% of the player's
  width, at most 44% of its height) instead of a third of the player with its black bars, and "Up next" stays beside it.

## 0.6.0

- YouTube-style controls (EYF-228): a thin seek bar in the accent color with a scrubber and a time tooltip on hover
  (the thumbnail when the stream has them), larger white icons with tooltips, and a volume slider that slides out on
  hover. A CC button turns subtitles on and off.
- Settings menu (EYF-228): the gear holds Subtitles/CC, Playback speed (0.25–2×, new) and Quality, in place of the two
  dropdowns. The controls stay up while it is open.
- Click the video to play or pause, double-click for fullscreen; a play button in the middle before the first play,
  and a short icon in the middle on play, pause, seek and volume.
- Keyboard shortcuts with the player focused: `k`/space, `j`/`l` (10 s), ←/→ (5 s), ↑/↓ (volume), `m`, `f`, `c` and
  `0`–`9`. None act during an ad, the end screen or the app's overlay.

## 0.5.0

- Start position (EYF-227): `startTime` starts the stream at a point, e.g. to resume where the viewer left off.
- Languages (EYF-227): `preferredAudioLanguage` picks the audio and `preferredSubtitleLanguage` shows subtitles from
  the start when the stream has them. Region and two- or three-letter codes don't matter (`de`, `de-DE`, `deu`).
- Quality cap (EYF-227): `maxBitrate`, or `maxBitrate` in the player config, caps the bitrate the player picks.
- Seek bar thumbnails (EYF-227): hovering or dragging the seek bar shows the frame there, from the stream's
  `thumbnails/thumbnail.vtt` or a track the app names with `thumbnails`. `features.thumbnails: false` turns them off.
- Playback callbacks (EYF-227): `onTimeUpdate`, `onPause`, `onSeeked` and `onEnded`, for watch progress and
  "Continue watching" in the app. None fire during an ad.
- Fix: with a `configId`, the stream never loaded (the player waited for the config without a video element and did not
  try again once it had one). It now loads once the config is in.
- Phone width: below 520px the volume slider, quality menu and picture-in-picture button make way, so subtitles, cast
  and fullscreen stay on screen (they ran off the edge).
- Removed the deprecated `EyzflowPlayer`, `EyzflowPlayerProps` and `EyzflowPlayerAnalyticsOptions` names (renamed in
  0.4.0); use `EYZFlowPlayer`, `EYZFlowPlayerProps` and `EYZFlowPlayerAnalyticsOptions`.

## 0.4.0

- Renamed (EYF-225): `EyzflowPlayer`, `EyzflowPlayerProps` and `EyzflowPlayerAnalyticsOptions` are now
  `EYZFlowPlayer`, `EYZFlowPlayerProps` and `EYZFlowPlayerAnalyticsOptions`, matching the product name. The old names
  still work and are marked deprecated; they are removed in 0.5.0. The package name and `eyzflow-player/style` are
  unchanged.

## 0.3.0

- Skip intro, recap and credits (EYF-213): while playback is in one of the stream's signals (Stream → Signals in the
  dashboard), a "Skip intro", "Skip recap" or "Skip credits" button over the video seeks to its end. It takes the
  config's theme; text in en, de, fr and nl. `features.skipButtons: false` hides it. `onSignal` reports entering and
  leaving a signal.
- `skipButtonTypes` (EYF-223): the skip button per signal type, from the player config or inline. By default intro,
  recap and opening credits; no "Skip credits" over the closing credits unless `closingCredits: true`.
- `renderOverlay` (EYF-218): the app's own UI inside the player at a signal or after the end, e.g. similar films at
  the closing credits. It stays in fullscreen, sits under the control bar, hides during ads, and gets `skip`, `seek`,
  `play`, `pause` and `dismiss`.
- `endScreen` (EYF-220): a Netflix-style end screen from the films the app passes. At the closing credits the video
  shrinks into a corner, "Up next" counts down and plays the next stream, and a picked film plays in place
  (`onSelect`, which can prevent it). Customizable through the theme, `eyz-end-screen…` classes, `className`, `title`
  and `renderItem`. The player config's `features.endScreen` and `endScreen` settings apply. Texts in en, de, fr, nl.
  A stream without a closing credits signal gets it `secondsBeforeEnd` seconds before the end (default 20).
- A new `streamId` now waits for the previous Shaka player's teardown before loading; switching streams could hang
  before.

## 0.2.0

- Playback sessions for a plan's stream and device limits: with `storefrontId`
  and the viewer's `drmAuthorizationKey`, the player opens a session before
  loading, heartbeats it while playing and closes it on leaving. Refusals come
  to `onLimitReached` (`STREAM_LIMIT`, `DEVICE_LIMIT`, `DEVICE_REVOKED`,
  `SESSION_REVOKED`, `PLAYBACK_SESSION_ENDED`). `deviceName` names the device.
- The player key check: `playerKey` (`pk_…`) is checked for this site before
  playing; a refusal comes to `onLicenseError`. With the key's analytics on,
  the player reports startup time, buffering, quality and errors (`analytics`,
  optional CMCD).
- Ads from the player config (`features.ads`, `ads.adTagUrl`) through Google
  IMA: at the stream's SCTE-35 ad break markers (a pre-roll at the start,
  mid-rolls when playback reaches them, each once, none when passed by
  seeking), otherwise as the tag schedules them. No ads while casting or on
  AirPlay; a failed or empty tag plays the content. Controls are hidden during
  an ad, and analytics leave ad time out.
- Ads follow the viewer's plan: for a storefront viewer, the playback session
  says whether the plan includes ads (no ad request when it doesn't) and adds
  its targeting (`plan`, `access`) to the tag's `cust_params`. The session is
  now opened for clear streams too, so the plan's stream limits count them.
- A countdown before each mid-roll, "Ad in 5" … "Ad in 1" (en, de, fr, nl, by
  the browser's language), at the markers or a VMAP's mid-roll cue points.
  `features.adCountdown: false` turns it off; `ads.countdownSeconds` (1–30,
  default 5) sets its length.
- The package version (`0.2.0`) is sent with licence checks and analytics.

## 0.1.0

Not tagged: the player before this changelog. A Shaka-based React player for
EYZFlow streams with Widevine, PlayReady and FairPlay DRM, its look and
features from an EYZFlow player config, subtitles and quality selection,
Chromecast and AirPlay, and the embed page.
