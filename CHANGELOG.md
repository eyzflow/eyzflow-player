# Changelog

## Unreleased

- Skip intro, recap and credits (EYF-213): while playback is in one of the stream's signals (Stream → Signals in the
  dashboard), a "Skip intro", "Skip recap" or "Skip credits" button over the video seeks to its end. It takes the
  config's theme; text in en, de, fr and nl. `features.skipButtons: false` hides it. `onSignal` reports entering and
  leaving a signal.
- `renderOverlay` (EYF-218): the app's own UI inside the player at a signal or after the end, e.g. similar films at
  the closing credits. It stays in fullscreen, sits under the control bar, hides during ads, and gets `skip`, `seek`,
  `play`, `pause` and `dismiss`.

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
