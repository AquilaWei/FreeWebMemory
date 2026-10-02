import type { DirtyMessage } from "./messages";
import { trackDirty } from "./dirty";

trackDirty(document, window, (dirty) => {
  const message: DirtyMessage = { type: "form-dirty", dirty };
  // After the extension reloads or updates this orphaned script's sendMessage
  // throws synchronously ("Extension context invalidated"); a lost report only
  // means the tab is treated as clean, so never let it reach the page.
  try {
    chrome.runtime.sendMessage(message).catch((err) => console.warn("FreeWebMemory: report failed", err));
  } catch (err) {
    console.warn("FreeWebMemory: report failed", err);
  }
});
