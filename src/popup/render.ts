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
}
