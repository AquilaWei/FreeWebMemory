import type { DirtyMessage } from "./messages";
import { trackDirty } from "./dirty";

trackDirty(document, (dirty) => {
  const message: DirtyMessage = { type: "form-dirty", dirty };
  // Rejects if the worker could not be reached; losing one report only means
  // the tab is treated as clean, so log instead of throwing in the page.
  chrome.runtime.sendMessage(message).catch((err) => console.warn("Memory Saver: report failed", err));
});
