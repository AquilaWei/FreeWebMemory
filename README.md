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

## Privacy

No network calls; nothing leaves the browser. Permissions: `storage` keeps your settings in `chrome.storage.sync` (synced by Chrome across your devices) and tab activity times in `chrome.storage.session` (memory only); `tabs` reads tab URLs and state so protected tabs are skipped and idle ones discarded; `alarms` wakes the background worker once a minute to check for idle tabs. A content script runs on http(s) pages (no host permissions) and sends the background only a yes/no "form was edited" flag, so tabs with unsaved input are skipped; no page content is read or sent.
