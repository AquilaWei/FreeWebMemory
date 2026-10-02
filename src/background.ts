import { ActivityTracker, SWEEP_ALARM } from "./tracker";

// Listeners must be registered synchronously at top level so Chrome can wake
// the service worker for them. The tracker restores itself from storage.session.
const tracker = new ActivityTracker();

/** Alarms survive worker restarts, so only create it when missing. */
async function ensureAlarm(): Promise<void> {
  if (!(await chrome.alarms.get(SWEEP_ALARM))) {
    await chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: 1 });
  }
}

chrome.runtime.onInstalled.addListener(() => void ensureAlarm());
chrome.runtime.onStartup.addListener(() => void ensureAlarm());

chrome.tabs.onActivated.addListener(({ tabId }) => void tracker.touch(tabId));
chrome.tabs.onRemoved.addListener((tabId) => void tracker.remove(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Discarding itself fires onUpdated; that must not restart the idle timer.
  if (changeInfo.discarded !== undefined) return;
  if (changeInfo.url !== undefined || changeInfo.status === "complete") void tracker.touch(tabId);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SWEEP_ALARM) void tracker.sweep();
});
