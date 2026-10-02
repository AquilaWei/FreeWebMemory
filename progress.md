# Progress

## Goal
A Chrome (Manifest V3) extension that saves memory, mainly by discarding idle tabs (`chrome.tabs.discard`) while protecting tabs the user cares about.

## State
F1 done (scaffold: esbuild build to `dist/`, eslint, vitest, stub background/popup/options, version injected from `package.json` into manifest at build time). F2 done (`src/settings.ts`: typed `Settings`, defaults, `sanitizeSettings` clamps idle minutes to 1–1440, `loadSettings`/`saveSettings`/`onSettingsChanged` over `chrome.storage.sync`; manifest now declares `storage`; tests mock `chrome` via `vi.stubGlobal`). F3 done (`src/policy.ts`: pure `decideDiscard` returning `{discard:true}` or a `RefusalReason`; idle boundary inclusive; only http(s) URLs eligible; `dirty` reason is left for F5). F4 done (`src/tracker.ts` `ActivityTracker`: last-active times written through to `chrome.storage.session`, `sweep()` discards policy-approved tabs, unseen tabs start their timer at first sweep, active tabs count as active now; `src/background.ts` wires tab events and a 1-minute `chrome.alarms` sweep; manifest adds `tabs`, `alarms`). F5 done (`src/content/`: `trackDirty` reports a boolean on input/submit/reset; content script built as an iife `content.js` and declared in the manifest for http(s); background stores dirty tab ids in `storage.session` via `ActivityTracker.setDirty`, content script owns the flag (reports false at start, re-reports on bfcache `pageshow`; background no longer clears on `loading`), contenteditable counted; dirty state is recomputed from the edited elements on input and when the page is hidden, so apps that clear fields in code become clean again; policy reason `dirty` honours `protectFormDirty`; jsdom added as devDependency). F6–F10 not started; see `feature_list.json` (build in order).

Needs manual acceptance: (F5 known limits, documented in README) tabs already open at install/update have no content script until reloaded; iframes are not covered (`all_frames` unset on purpose: a clean iframe report would clobber the top frame's flag, since the background keys by tab id). (F5) type in a contenteditable editor and a SPA, confirm not discarded; go back via bfcache and confirm still protected. (F5) type into a form on a real page, wait past the idle threshold, confirm the tab is not discarded; submit/reload and confirm it becomes discardable. (F4) with idle minutes set low, an idle http(s) tab actually becomes discarded after the threshold, and the 1-minute alarm keeps firing after the worker is killed (not tested, no browser).

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
- F4 review fixes: `ensureAlarm()` also runs on every worker start (alarms may be cleared, re-enabling fires no event); `tests/background.test.ts` exercises the real listeners (alarm, activated, updated, removed, alarm creation); tracker catches a failed restore and `sweep` reads last-active times after its update step.
- F5 review fix: the content script reads the real input target from `event.composedPath()[0]`, so fields inside shadow DOM are tracked (test in `tests/dirty.test.ts`).
- F6 done: popup (`src/popup/{popup.html,render.ts,controller.ts}`), `discard-now` message handled in `background.ts` (sender must be our extension and have no tab), `tracker.discardNow()` (idleMinutes 0, enabled forced on, protections kept), `src/stats.ts` + `src/estimate.ts` (flat 100 MiB per discarded tab, stored in `chrome.storage.local`), whitelist normalization in `settings.ts`. Manual acceptance needed: popup looks right in a real Chrome, buttons work.
- F7 done: tests for estimator and stats (persist, concurrent records, reset), popup labels the figure as an estimate, README documents the 100 MiB heuristic, manifest gains `system.memory`.
