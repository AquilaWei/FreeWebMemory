import { decideDiscard } from "./policy";
import { loadSettings } from "./settings";

const STORAGE_KEY = "lastActive";
export const SWEEP_ALARM = "discard-sweep";

/**
 * Remembers when each tab was last active. MV3 service workers are killed
 * often, so every change is written through to chrome.storage.session and a
 * new instance restores from it. Mutations are chained on one promise so
 * concurrent events cannot overwrite each other's writes.
 */
export class ActivityTracker {
  private times = new Map<number, number>();
  private queue: Promise<unknown>;

  constructor(private readonly now: () => number = Date.now) {
    // A failed restore must not leave a rejected promise in the chain.
    this.queue = this.restore().catch((err) => {
      console.warn("Could not restore tab activity; starting with an empty map", err);
    });
  }

  private async restore(): Promise<void> {
    const stored = await chrome.storage.session.get(STORAGE_KEY);
    const raw = stored[STORAGE_KEY] as Record<string, number> | undefined;
    for (const [id, ms] of Object.entries(raw ?? {})) {
      if (typeof ms === "number" && Number.isFinite(ms)) this.times.set(Number(id), ms);
    }
  }

  /** Runs `change` after all earlier work, then persists. Rejects if storage fails. */
  private mutate(change: () => void): Promise<void> {
    const run = this.queue.then(async () => {
      change();
      await chrome.storage.session.set({ [STORAGE_KEY]: Object.fromEntries(this.times) });
    });
    this.queue = run.catch(() => undefined); // keep the chain alive after a failure
    return run;
  }

  /** Marks the tab as active right now, restarting its idle timer. */
  touch(tabId: number): Promise<void> {
    return this.mutate(() => this.times.set(tabId, this.now()));
  }

  /** Stops tracking a closed tab. */
  remove(tabId: number): Promise<void> {
    return this.mutate(() => this.times.delete(tabId));
  }

  /** Last-active time per tab, after pending writes finish. */
  async snapshot(): Promise<Map<number, number>> {
    await this.queue;
    return new Map(this.times);
  }

  /**
   * Discards every tab the policy approves, and returns the discarded tab ids.
   * Active tabs count as active now; tabs never seen before (opened while the
   * worker was not tracking) start their idle timer now rather than being
   * discarded immediately. Tabs that no longer exist are dropped.
   * A failing discard (e.g. the tab just closed) is logged and does not stop the sweep.
   */
  async sweep(): Promise<number[]> {
    const [settings, tabs] = await Promise.all([loadSettings(), chrome.tabs.query({})]);
    const known = await this.snapshot();
    const now = this.now();
    const discarded: number[] = [];

    await this.mutate(() => {
      const open = new Set<number>();
      for (const tab of tabs) {
        if (tab.id === undefined) continue;
        open.add(tab.id);
        if (tab.active || !known.has(tab.id)) this.times.set(tab.id, now);
      }
      for (const id of [...this.times.keys()]) if (!open.has(id)) this.times.delete(id);
    });

    // Read after the update step so a touch that landed meanwhile is honoured.
    const current = await this.snapshot();
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      const lastActive = current.get(tab.id);
      if (lastActive === undefined) continue; // removed while sweeping
      if (!decideDiscard({ ...tab, audible: tab.audible ?? false }, lastActive, settings, now).discard) continue;
      try {
        await chrome.tabs.discard(tab.id);
        discarded.push(tab.id);
      } catch (err) {
        console.warn(`Could not discard tab ${tab.id}`, err);
      }
    }
    return discarded;
  }
}
