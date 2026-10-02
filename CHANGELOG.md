# Changelog

## Unreleased

- Project scaffold: Manifest V3 build, lint and test tooling.
- Settings stored in `chrome.storage.sync` with defaults and validation; whitelist entries are trimmed and lowercased. The extension now requests the `storage` permission.
- Discard policy: decides per tab whether it may be discarded, with a reason for every refusal (not yet wired to the browser).
- Background auto-discard: tracks tab activity (persisted in `chrome.storage.session`) and discards idle tabs every minute. Requests the `tabs` and `alarms` permissions.
- Tabs with unsaved form input are no longer discarded: a content script on http(s) pages tells the extension only whether a form was edited (never what was typed). Controlled by the existing "protect form-dirty tabs" setting. A tab becomes discardable again once the edited fields are cleared, removed or reverted.
- Unsaved-input protection now also covers rich-text (contenteditable) editors, survives single-page-app navigation and back/forward-cache restores, and never throws into a page after the extension reloads. Known limits: tabs open before install/update need a reload, and forms inside iframes are not covered.
- Unsaved-input protection now also covers fields inside shadow DOM (web-component forms).
