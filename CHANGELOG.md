# Changelog

## Unreleased

- Project scaffold: Manifest V3 build, lint and test tooling.
- Settings stored in `chrome.storage.sync` with defaults and validation; whitelist entries are trimmed and lowercased. The extension now requests the `storage` permission.
- Discard policy: decides per tab whether it may be discarded, with a reason for every refusal (not yet wired to the browser).
- Background auto-discard: tracks tab activity (persisted in `chrome.storage.session`) and discards idle tabs every minute. Requests the `tabs` and `alarms` permissions.
