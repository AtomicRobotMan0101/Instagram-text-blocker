---
id: 4368f2a9-eb39-4009-aecf-afa8c3bbd45c
title: README
tags: []
pinned: false
created: 2026-10-31T03:52:09.762253358+00:00
modified: 2026-10-31T04:36:05.330380495+00:00
---
# README

# Instagram-text-blocker

Places a black bar over the top of the wretched text overlays on Instagram.

A minimal, open-source Firefox extension for Linux that masks burned-in words or subtitles on Instagram Reels. Everything runs locally in the browser. There are no analytics, network requests, cloud APIs, or Google services.

## How it works

When a playing Reel becomes visible, the extension waits three seconds while sampling scaled-down video frames. It looks for a persistent, high-contrast horizontal region typical of subtitles, then leaves one black mask in place until the visible Reel changes. The delay and padding are configurable.

The detector does not use OCR. It neither reads nor stores the words. Avoiding OCR keeps the extension small, fast, and private.

## What it looks like

<!-- -->![5.png|size=small](.helixnotes/attachments/d3d4db66-a702-4140-aff0-ab86f0fea0e5_5.png)

## Where it fails

## Install temporarily (development)

1. Open `about:debugging` in Firefox.
2. Choose **This Firefox**.
3. Choose **Load Temporary Add-on…** and select `manifest.json` in this directory.
4. Open Instagram and play a Reel.

Temporary extensions disappear when Firefox restarts.

This is only temporary until I get the XPI signed by Firefox. Soon enough!

## Controls

- `Alt+Shift+B`: toggle masking.
- `Alt+Shift+M`: create/edit a manual mask. Drag the bar and resize it from its lower-right corner; press the shortcut again to lock it.
- The toolbar popup exposes both actions and the settings page.
- Settings: analysis delay (default 3 seconds), padding (default 12 px), and enabled state.

Firefox shortcuts can be changed at **Add-ons and themes → Extensions → Manage Extension Shortcuts**.

## Frame-capture and cross-origin restrictions

The extension uses `canvas.drawImage(video, …)` followed by `getImageData()`. Drawing a cross-origin video is possible, but reading its pixels is forbidden unless the media is *origin-clean*. A forbidden read throws a `SecurityError`; the extension catches that and offers manual placement.

Instagram commonly feeds video elements from same-origin `blob:`/MediaSource URLs, which may be readable, but this is an implementation detail Instagram or Firefox can change. The included runtime probe is the only reliable test for a particular Reel. Host permissions do not bypass the browser's canvas origin protections.

`captureVisibleTab` was deliberately not used: Firefox ties it to user activation/permissions and it would capture the page UI as well as the video, making continuous automatic analysis intrusive and brittle.

**TESING**: To test on a real Reel, load the extension temporarily, open Firefox developer tools, play a Reel, and watch for eith er a mask or the explicit origin-blocked notice. This cannot be fully validated in an offline unit test because it depends on Instagram's current media delivery and the signed-in Firefox session.

## Limitations

- Detection is heuristic. Logos, busy graphics, or strong horizontal detail can be mistaken for subtitles; low-contrast or unusually placed text can be missed.
- One rectangular bar is used. Multiple separated captions or moving text may need the manual fallback.
- The mask follows the active video element but not every transient layout animation. Scrolling to the next Reel resets analysis and the mask.
- Instagram DOM and media-delivery changes can break detection.
- The extension masks pixels on screen; it does not remove text from the underlying video.
- Manual position is intentionally per-Reel and is not uploaded or persisted.

## Tests

Requires Node.js 18 or newer:

```sh
npm test
npm run lint
```

The tests cover the pixel detector with synthetic subtitle and blank frames. Real-site capture must be tested interactively because of authentication, media URLs, and browser security policy.

## Privacy and licence

No captured frame leaves memory or is written to disk. The extension requests only Instagram host access and local extension storage.

Released under the [MIT License](LICENSE).
