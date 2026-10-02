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

No network calls; nothing leaves the browser. The only permission requested so far is `storage`, used to keep your settings in `chrome.storage.sync` (synced by Chrome across your devices).
