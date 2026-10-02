# Memory Saver

A **Chrome (Manifest V3)** extension that saves memory by discarding idle tabs, while protecting the tabs you care about.

> Status: all planned features are implemented (v0.1.0, not yet accepted on a real browser, see **Needs manual acceptance**).

**What it does**

- **Discards idle tabs** (default 30 min) so Chrome frees their memory; a discarded tab reloads when you click it.
- **Never touches** the active tab, pinned tabs, tabs playing sound, tabs with unsaved form input, your whitelisted sites, or non-web pages.
- **Memory-pressure mode:** when free system memory drops under a threshold (default 10%), discards the least recently used eligible tabs first.
- **Popup:** on/off switch, tabs discarded, estimated memory saved, "Discard other tabs now", "Never discard this site".
- **Options page:** every setting, the whitelist, and JSON export/import.

## Build

```bash
npm ci
npm run lint
npm test
npm run build
```

The build writes the extension to `dist/`.

## Package

```bash
npm run build
npm run package
```

This writes `release/memory-saver-<version>.zip` and a `.sha256` file (check it with `cd release && sha256sum -c *.sha256`). The zip is reproducible: the same `dist/` always gives the same checksum. CI (`.github/workflows/ci.yml`) runs lint, test, build and package on every push and uploads the zip as an artifact.

## Load in Chrome (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder

## Limits of unsaved-input protection

- **Tabs open before install/update** have no content script until reloaded, so typing in them is not protected.
- **Forms inside iframes** are not covered; only the top-level page is watched.

## How the memory estimate works

Chrome does not report per-tab memory on the stable channel (`chrome.processes` exists only on the dev channel), so the popup shows an **estimate**: every discarded tab counts as **100 MiB** (a typical page's renderer uses roughly 50-150 MiB). Heavy pages (video, web apps) free more and trivial pages less, so treat the total as an order of magnitude, not a measurement. The totals live in `chrome.storage.local` on this device and can be cleared with **Reset statistics** in the popup. The popup also shows the system's currently available memory, read with `chrome.system.memory`, which is a real figure.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Settings in `chrome.storage.sync`, tab activity in `chrome.storage.session`, statistics in `chrome.storage.local` |
| `tabs` | Read tab URL, pinned/audible/active state and discard idle tabs |
| `alarms` | Wake the background worker once a minute (service workers cannot keep timers) |
| `system.memory` | Read available memory for memory-pressure mode and the popup |

No host permissions. The content script runs on http(s) pages only to report a yes/no "form was edited" flag. A test (`tests/release-safety.test.ts`) fails if the manifest gains permissions, remote code, or if `src/` uses `fetch`, `XMLHttpRequest`, `WebSocket` and similar.

## Needs manual acceptance

Automated tests use mocks, so these must be checked once in a real Chrome (load `dist/` unpacked or the zip's contents):

- The popup and options pages look right and every button works.
- An idle tab is really discarded after the idle time (try 1 minute) and reloads when clicked.
- "Discard other tabs now" discards background tabs but not the active, pinned or audible ones.
- Typing in a form (also a web-component form with shadow DOM) keeps that tab from being discarded.
- Memory-pressure mode triggers on a loaded machine (set the threshold to 50 to force it).
- The built zip installs and starts without errors on `chrome://extensions`.

## Privacy

No network calls; nothing leaves the browser. Permissions: `storage` keeps your settings in `chrome.storage.sync` (synced by Chrome across your devices) and tab activity times in `chrome.storage.session` (memory only); `tabs` reads tab URLs and state so protected tabs are skipped and idle ones discarded; `alarms` wakes the background worker once a minute to check for idle tabs; `system.memory` reads how much system memory is available (a number only). A content script runs on http(s) pages (no host permissions) and sends the background only a yes/no "form was edited" flag, so tabs with unsaved input are skipped; no page content is read or sent.
