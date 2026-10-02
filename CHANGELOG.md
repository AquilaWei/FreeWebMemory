# Changelog

## Unreleased

- The extension now has its own icon in the toolbar and on the extensions page.
- Licensed under GPL-3.0 (added `LICENSE`).
- Renamed the project to FreeWebMemory (extension name, package name and release zip name).

- Project scaffold: Manifest V3 build, lint and test tooling.
- Settings stored in `chrome.storage.sync` with defaults and validation; whitelist entries are trimmed and lowercased. The extension now requests the `storage` permission.
- Discard policy: decides per tab whether it may be discarded, with a reason for every refusal (not yet wired to the browser).
- Background auto-discard: tracks tab activity (persisted in `chrome.storage.session`) and discards idle tabs every minute. Requests the `tabs` and `alarms` permissions.
- Tabs with unsaved form input are no longer discarded: a content script on http(s) pages tells the extension only whether a form was edited (never what was typed). Controlled by the existing "protect form-dirty tabs" setting. A tab becomes discardable again once the edited fields are cleared, removed or reverted.
- Unsaved-input protection now also covers rich-text (contenteditable) editors, survives single-page-app navigation and back/forward-cache restores, and never throws into a page after the extension reloads. Known limits: tabs open before install/update need a reload, and forms inside iframes are not covered.
- Unsaved-input protection now also covers fields inside shadow DOM (web-component forms).
- Popup: an on/off switch for automatic discarding, the number of tabs discarded and an estimated memory saved (estimate only, Chrome does not report per-tab memory), a "Discard other tabs now" button that skips the idle threshold but still never touches active, pinned, playing, whitelisted or unsaved tabs, and a "Never discard this site" button.
- Whitelist entries are now stored as bare lowercase hostnames (scheme, path, port and `*.` are stripped, duplicates removed).
- Savings statistics persist across restarts and can be reset from the popup; the popup also shows the system's available memory (new `system.memory` permission). The README explains how the estimate is calculated and its limits.
- Memory-pressure mode: when available system memory drops below a configurable percentage (default 10%, 0 turns it off, at most 50%), the least recently used eligible tabs are discarded one at a time, regardless of idle time, until memory recovers (at most 10 per minute). All protections still apply.
- Options page: edit every setting (including the memory-pressure threshold) and the site whitelist, with clear messages for invalid input (nothing is saved until it is fixed), plus export and import of settings as JSON.
- Packaging: `npm run package` builds a reproducible zip plus SHA256 checksum, and a GitHub Actions workflow runs lint, tests, build and package on every push. Tests guard against new permissions, remote code and network calls. The README lists each permission with its reason and what still needs a real-browser check.
- Popup: set how many idle minutes pass before a tab is discarded, and open the full options page with "More settings".
- Popup: a tab list with a Freeze button to discard one specific tab right away. Pinned, playing, unsaved and whitelisted tabs can be frozen this way since you chose them; the tab in use, frozen tabs and non-web pages cannot.
