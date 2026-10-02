import { decideManualDiscard } from "../policy";
import type { Stats } from "../stats";

/** Memory figures from `chrome.system.memory.getInfo()`. */
export interface MemoryInfo {
  capacity: number;
  availableCapacity: number;
}

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

/** Human-readable size, e.g. "300 MB" or "1.5 GB" (binary units, whole MB). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 MB";
  if (bytes >= GIB) return `${(bytes / GIB).toFixed(1)} GB`;
  return `${Math.round(bytes / MIB)} MB`;
}

function setText(doc: Document, id: string, text: string): void {
  const el = doc.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * Shows the cumulative stats and, when known, the system memory. The saved figure
 * is always shown as an estimate because Chrome does not report per-tab memory.
 */
export function renderStats(doc: Document, stats: Stats, memory?: MemoryInfo): void {
  setText(doc, "discarded-count", String(stats.discardedCount));
  setText(doc, "saved-estimate", `~${formatBytes(stats.estimatedBytesSaved)}`);
  setText(
    doc,
    "system-memory",
    memory ? `${formatBytes(memory.availableCapacity)} of ${formatBytes(memory.capacity)}` : "unknown",
  );
  const meter = doc.getElementById("memory-meter") as HTMLMeterElement | null;
  if (meter) {
    meter.hidden = !memory || memory.capacity <= 0;
    meter.value = memory && memory.capacity > 0 ? memory.availableCapacity / memory.capacity : 0;
  }
}

const FROZEN_LABELS = { active: "In use", discarded: "Frozen", unsupported_url: "Not supported" } as const;

/**
 * Fills #tab-list with one row per tab and a Freeze button; rows the user cannot freeze
 * (active, already frozen, not an http(s) page) get a disabled button saying why.
 * `onFreeze` runs with the tab id when a Freeze button is clicked.
 */
export function renderTabs(doc: Document, tabs: chrome.tabs.Tab[], onFreeze: (tabId: number) => void): void {
  const list = doc.getElementById("tab-list");
  if (!list) return;
  list.replaceChildren(
    ...tabs.flatMap((tab) => {
      if (tab.id === undefined) return [];
      const tabId = tab.id;
      const name = tab.title || tab.url || "Untitled tab";
      const decision = decideManualDiscard({ url: tab.url, active: tab.active, discarded: tab.discarded });

      const title = doc.createElement("span");
      title.className = "tab-title";
      title.textContent = name;
      const button = doc.createElement("button");
      button.type = "button";
      button.textContent = decision.discard ? "Freeze" : FROZEN_LABELS[decision.reason as keyof typeof FROZEN_LABELS];
      button.disabled = !decision.discard;
      button.setAttribute("aria-label", `${button.textContent}: ${name}`);
      button.addEventListener("click", () => onFreeze(tabId));
      const item = doc.createElement("li");
      item.append(title, button);
      return [item];
    }),
  );
}
