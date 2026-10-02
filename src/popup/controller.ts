import type { DiscardNowMessage, DiscardNowResponse } from "../messages";
import { loadSettings, saveSettings, whitelistSite } from "../settings";
import { loadStats, resetStats } from "../stats";
import { renderStats, type MemoryInfo } from "./render";

function byId<T extends HTMLElement>(doc: Document, id: string): T {
  const el = doc.getElementById(id);
  if (!el) throw new Error(`popup.html is missing #${id}`);
  return el as T;
}

async function readMemory(): Promise<MemoryInfo | undefined> {
  try {
    return await chrome.system.memory.getInfo();
  } catch (err) {
    console.warn("Could not read system memory", err);
    return undefined;
  }
}

/** Wires the popup controls in `doc` to settings, stats and the background worker. */
export async function initPopup(doc: Document): Promise<void> {
  const enabled = byId<HTMLInputElement>(doc, "enabled");
  const status = byId<HTMLElement>(doc, "status");
  const say = (text: string) => {
    status.textContent = text;
  };
  // User-facing actions report failures in the popup instead of dying silently.
  const guarded = (action: () => Promise<void>) => async () => {
    try {
      await action();
    } catch (err) {
      console.warn("Popup action failed", err);
      say("Something went wrong. Please try again.");
    }
  };
  const refresh = async () => renderStats(doc, await loadStats(), await readMemory());

  enabled.checked = (await loadSettings()).enabled;
  await refresh();

  enabled.addEventListener(
    "change",
    guarded(async () => {
      await saveSettings({ ...(await loadSettings()), enabled: enabled.checked });
      say(enabled.checked ? "Automatic discard is on." : "Automatic discard is off.");
    }),
  );

  byId(doc, "discard-now").addEventListener(
    "click",
    guarded(async () => {
      const message: DiscardNowMessage = { type: "discard-now" };
      const response = (await chrome.runtime.sendMessage(message)) as DiscardNowResponse;
      say(`Discarded ${response.discarded} tab${response.discarded === 1 ? "" : "s"}.`);
      await refresh();
    }),
  );

  byId(doc, "never-discard").addEventListener(
    "click",
    guarded(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const settings = await loadSettings();
      const updated = whitelistSite(settings, tab?.url);
      if (!updated) return say("This page cannot be discarded anyway.");
      await saveSettings(updated);
      say("This site will never be discarded.");
    }),
  );

  byId(doc, "reset-stats").addEventListener(
    "click",
    guarded(async () => {
      await resetStats();
      await refresh();
      say("Statistics reset.");
    }),
  );
}
