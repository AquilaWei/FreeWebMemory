# Progress

## Goal
A Chrome (Manifest V3) extension that saves memory, mainly by discarding idle tabs (`chrome.tabs.discard`) while protecting tabs the user cares about.

## State
Repository was empty (only an init commit). Planning only; no features implemented. See `feature_list.json` (F1–F10, build in order).

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
