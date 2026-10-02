import { estimateSavedBytes } from "./estimate";

/** Cumulative discard statistics; the byte figure is an estimate (see estimate.ts). */
export interface Stats {
  discardedCount: number;
  estimatedBytesSaved: number;
}

export const EMPTY_STATS: Readonly<Stats> = { discardedCount: 0, estimatedBytesSaved: 0 };

const STORAGE_KEY = "stats";

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Turns untrusted storage contents into valid Stats; anything unusable counts as zero. */
export function sanitizeStats(raw: unknown): Stats {
  const input = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return { discardedCount: count(input.discardedCount), estimatedBytesSaved: count(input.estimatedBytesSaved) };
}

/** Loads the stored stats (kept in chrome.storage.local: per device, survives restarts). */
export async function loadStats(): Promise<Stats> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return sanitizeStats(stored[STORAGE_KEY]);
}

/** Sets the cumulative stats back to zero. */
export async function resetStats(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: { ...EMPTY_STATS } });
}

/**
 * Adds discards to the stored totals. Updates are chained on one promise so a
 * sweep and a manual "discard now" cannot overwrite each other's read-modify-write.
 */
export class StatsRecorder {
  private queue: Promise<unknown> = Promise.resolve();

  /** Records `tabCount` discards and returns the new totals. Rejects if storage fails. */
  record(tabCount: number): Promise<Stats> {
    const run = this.queue.then(async () => {
      const current = await loadStats();
      const next: Stats = {
        discardedCount: current.discardedCount + count(tabCount),
        estimatedBytesSaved: current.estimatedBytesSaved + estimateSavedBytes(tabCount),
      };
      await chrome.storage.local.set({ [STORAGE_KEY]: next });
      return next;
    });
    this.queue = run.catch(() => undefined); // keep the chain alive after a failure
    return run;
  }
}
