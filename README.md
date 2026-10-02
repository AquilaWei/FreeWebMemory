# Memory Saver

A **Chrome (Manifest V3)** extension that saves memory by discarding idle tabs, while protecting the tabs you care about.

> Status: scaffold only (v0.1.0). Discard logic is built in later features; see `feature_list.json`.

## Build

```bash
npm ci
npm run lint
npm test
npm run build
```

The build writes the extension to `dist/`.

## Load in Chrome (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder

## Limits of unsaved-input protection

- **Tabs open before install/update** have no content script until reloaded, so typing in them is not protected.
- **Forms inside iframes** are not covered; only the top-level page is watched.

## How the memory estimate works

Chrome does not report per-tab memory on the stable channel (`chrome.processes` exists only on the dev channel), so the popup shows an **estimate**: every discarded tab counts as **100 MiB** (a typical page's renderer uses roughly 50-150 MiB). Heavy pages (video, web apps) free more and trivial pages less, so treat the total as an order of magnitude, not a measurement. The totals live in `chrome.storage.local` on this device and can be cleared with **Reset statistics** in the popup. The popup also shows the system's currently available memory, read with `chrome.system.memory`, which is a real figure.

## Privacy

No network calls; nothing leaves the browser. Permissions: `storage` keeps your settings in `chrome.storage.sync` (synced by Chrome across your devices) and tab activity times in `chrome.storage.session` (memory only); `tabs` reads tab URLs and state so protected tabs are skipped and idle ones discarded; `alarms` wakes the background worker once a minute to check for idle tabs; `system.memory` reads how much system memory is available (a number only). A content script runs on http(s) pages (no host permissions) and sends the background only a yes/no "form was edited" flag, so tabs with unsaved input are skipped; no page content is read or sent.
