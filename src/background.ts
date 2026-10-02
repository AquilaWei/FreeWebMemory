import { isDirtyMessage } from "./content/messages";
import { isDiscardNowMessage, isFreezeTabMessage, type DiscardNowResponse, type FreezeTabResponse } from "./messages";
import { StatsRecorder } from "./stats";
import { ActivityTracker, SWEEP_ALARM } from "./tracker";

// Listeners must be registered synchronously at top level so Chrome can wake
// the service worker for them. The tracker restores itself from storage.session.
const tracker = new ActivityTracker();
const stats = new StatsRecorder();

/** Counts the discards in the cumulative stats; a failed write is logged, not thrown. */
async function recordDiscards(tabIds: number[]): Promise<void> {
  if (tabIds.length === 0) return;
  try {
    await stats.record(tabIds.length);
  } catch (err) {
    console.warn("Could not record discard stats", err);
  }
}

/** Alarms survive worker restarts, so only create it when missing. */
async function ensureAlarm(): Promise<void> {
  if (!(await chrome.alarms.get(SWEEP_ALARM))) {
    await chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: 1 });
  }
}

// Alarms may be cleared on browser restart, and re-enabling the extension fires
// neither event below, so check on every worker start too.
void ensureAlarm();
chrome.runtime.onInstalled.addListener(() => void ensureAlarm());
chrome.runtime.onStartup.addListener(() => void ensureAlarm());

chrome.tabs.onActivated.addListener(({ tabId }) => void tracker.touch(tabId));
chrome.tabs.onRemoved.addListener((tabId) => void tracker.remove(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Discarding itself fires onUpdated; that must not restart the idle timer.
  if (changeInfo.discarded !== undefined) return;
  // The dirty flag is owned by the content script (it reports false on each new
  // document); "loading" also fires for same-document navigations, so don't clear here.
  if (changeInfo.url !== undefined || changeInfo.status === "complete") void tracker.touch(tabId);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SWEEP_ALARM) void tracker.sweep().then(recordDiscards);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse: (response: DiscardNowResponse | FreezeTabResponse) => void) => {
  if (sender.id !== chrome.runtime.id) return;
  // The popup is an extension page, so unlike a content script it has no tab.
  if (sender.tab === undefined && isDiscardNowMessage(message)) {
    tracker
      .discardNow()
      .then(async (ids) => {
        await recordDiscards(ids);
        sendResponse({ discarded: ids.length });
      })
      .catch((err) => {
        console.warn("Discard now failed", err);
        sendResponse({ discarded: 0 });
      });
    return true; // keep the channel open for the async response
  }
  if (sender.tab === undefined && isFreezeTabMessage(message)) {
    tracker
      .freezeTab(message.tabId)
      .then(async (frozen) => {
        if (frozen) await recordDiscards([message.tabId]);
        sendResponse({ frozen });
      })
      .catch((err) => {
        console.warn("Freeze tab failed", err);
        sendResponse({ frozen: false });
      });
    return true;
  }
  // Dirty reports come only from our content scripts, which always run inside a tab.
  if (sender.tab?.id !== undefined && isDirtyMessage(message)) void tracker.setDirty(sender.tab.id, message.dirty);
});
