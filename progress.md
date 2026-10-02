# Progress

## Goal
A Chrome (Manifest V3) extension that saves memory, mainly by discarding idle tabs (`chrome.tabs.discard`) while protecting tabs the user cares about.

## State
F1 done (scaffold: esbuild build to `dist/`, eslint, vitest, stub background/popup/options, version injected from `package.json` into manifest at build time). F2 done (`src/settings.ts`: typed `Settings`, defaults, `sanitizeSettings` clamps idle minutes to 1–1440, `loadSettings`/`saveSettings`/`onSettingsChanged` over `chrome.storage.sync`; manifest now declares `storage`; tests mock `chrome` via `vi.stubGlobal`). F3 done (`src/policy.ts`: pure `decideDiscard` returning `{discard:true}` or a `RefusalReason`; idle boundary inclusive; only http(s) URLs eligible; `dirty` reason is left for F5). F4 done (`src/tracker.ts` `ActivityTracker`: last-active times written through to `chrome.storage.session`, `sweep()` discards policy-approved tabs, unseen tabs start their timer at first sweep, active tabs count as active now; `src/background.ts` wires tab events and a 1-minute `chrome.alarms` sweep; manifest adds `tabs`, `alarms`). F5–F10 not started; see `feature_list.json` (build in order).

Needs manual acceptance: (F4) with idle minutes set low, an idle http(s) tab actually becomes discarded after the threshold, and the 1-minute alarm keeps firing after the worker is killed (not tested, no browser).

Also: load `dist/` unpacked in chrome://extensions and confirm it loads without errors (not tested here, no browser).

Review fixes: `npm run lint` now also runs `tsc --noEmit` (covers src, tests, scripts); popup/options HTML load bundles with `type="module"`; manifest merge lives in `scripts/manifest.mjs` (`buildManifest`) and is unit-tested.

Note: `npm ci` warns that esbuild's postinstall is not approved; the build still works (verified), so no action taken.

## Plan overview
1. F1 scaffold → F2 settings → F3 pure discard policy → F4 background auto-discard → F5 dirty-form protection
2. F6 popup → F7 savings estimate → F8 memory-pressure mode → F9 options page → F10 packaging/CI

## Assumptions (pending the user's answers to `questions`)
- TypeScript + esbuild + eslint + vitest, Chrome only, tab discarding only, 30 min default, no store publishing.
- `verify` = `npm ci && npm run lint && npm test && npm run build`; F1 must create these scripts.

## Notes for next sessions
- Per-tab memory is not available on stable Chrome (`chrome.processes` is dev-channel), so savings are an estimate and must be labeled so.
- MV3 service workers are killed often: no in-memory-only state; persist in `chrome.storage.session`/`sync`; use `chrome.alarms`, not `setInterval`.
- Keep logic in pure functions (policy, estimator) and mock the `chrome` API in tests. Real-browser behavior (tab actually discarded, popup looks right, zip loads) cannot be automated here: list it for manual acceptance, do not claim it was tested.
- Version lives only in `package.json`; manifest gets it at build time. Commits: English one line `<type>: <description>`. Do not commit `CLAUDE.md`, `.claude/`, `dist/`, `node_modules/`.
- Privacy: no network calls, no page content leaves the browser; request minimal permissions.
- F2 review fixes: whitelist entries are trimmed and lowercased before storing (F3 can match hostnames exactly); CHANGELOG and README now mention the settings module and the `storage` permission.
