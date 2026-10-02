import { decideDiscard, decideManualDiscard } from "./policy";
import { isUnderPressure } from "./memory";
import { loadSettings, type Settings } from "./settings";

const STORAGE_KEY = "lastActive";
const DIRTY_KEY = "dirtyTabs";
export const SWEEP_ALARM = "discard-sweep";
/** Chrome frees a discarded tab's memory a moment later, so wait before measuring again. */
const PRESSURE_SETTLE_MS = 1000;
/** Upper bound per sweep, so a stuck reading cannot discard every tab at once. */
const MAX_PRESSURE_DISCARDS = 10;

/**
 * Remembers when each tab was last active. MV3 service workers are killed
 * often, so every change is written through to chrome.storage.session and a
 * new instance restores from it. Mutations are chained on one promise so
 * concurrent events cannot overwrite each other's writes.
 */
export class ActivityTracker {
  private times = new Map<number, number>();
  private dirty = new Set<number>();
  private queue: Promise<unknown>;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
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
    const storedDirty = await chrome.storage.session.get(DIRTY_KEY);
    const dirty = storedDirty[DIRTY_KEY] as number[] | undefined;
    for (const id of dirty ?? []) if (typeof id === "number") this.dirty.add(id);
  }

  /** Runs `change` after all earlier work, then persists. Rejects if storage fails. */
  private mutate(change: () => void): Promise<void> {
    const run = this.queue.then(async () => {
      change();
      await chrome.storage.session.set({
        [STORAGE_KEY]: Object.fromEntries(this.times),
        [DIRTY_KEY]: [...this.dirty],
      });
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
    return this.mutate(() => {
      this.times.delete(tabId);
      this.dirty.delete(tabId);
    });
  }

  /**
   * Records whether the page in a tab has unsaved form input. The flag is
   * owned by the content script, which reports false for each new document and
   * whenever the edited fields are clean again; the background never clears it
   * on its own.
   */
  setDirty(tabId: number, dirty: boolean): Promise<void> {
    return this.mutate(() => {
      if (dirty) this.dirty.add(tabId);
      else this.dirty.delete(tabId);
    });
  }

  /** Last-active time per tab, after pending writes finish. */
  async snapshot(): Promise<Map<number, number>> {
    await this.queue;
    return new Map(this.times);
  }

  /**
   * Ids of the tabs the policy approves right now, least recently used first.
   * A tab with no recorded time counts as active now, so it sorts last.
   */
  private eligibleIds(tabs: chrome.tabs.Tab[], times: Map<number, number>, settings: Settings, now: number): number[] {
    const eligible: { id: number; lastActive: number }[] = [];
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      const lastActive = times.get(tab.id) ?? now;
      const info = { ...tab, audible: tab.audible ?? false, dirty: this.dirty.has(tab.id) };
      if (decideDiscard(info, lastActive, settings, now).discard) eligible.push({ id: tab.id, lastActive });
    }
    return eligible.sort((a, b) => a.lastActive - b.lastActive).map((t) => t.id);
  }

  /** Discards one tab; a failure (e.g. the tab just closed) is logged, not thrown. */
  private async tryDiscard(tabId: number): Promise<boolean> {
    try {
      await chrome.tabs.discard(tabId);
      return true;
    } catch (err) {
      console.warn(`Could not discard tab ${tabId}`, err);
      return false;
    }
  }

  /**
   * Discards every tab the policy approves, and returns the discarded tab ids.
   * Active tabs count as active now; tabs never seen before (opened while the
   * worker was not tracking) start their idle timer now rather than being
   * discarded immediately. Tabs that no longer exist are dropped.
   * A failing discard is logged and does not stop the sweep.
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
      for (const id of [...this.dirty]) if (!open.has(id)) this.dirty.delete(id);
    });

    // Read after the update step so a touch that landed meanwhile is honoured.
    const current = await this.snapshot();
    for (const id of this.eligibleIds(tabs, current, settings, now)) {
      if (await this.tryDiscard(id)) discarded.push(id);
    }
    discarded.push(...(await this.relievePressure(tabs, current, settings, now, discarded)));
    return discarded;
  }

  /**
   * Memory-pressure mode: while available memory is below the configured percentage,
   * discards the least recently used eligible tab, one at a time, ignoring the idle
   * threshold but not the protections. Stops when pressure eases, when no eligible tab
   * is left, or after MAX_PRESSURE_DISCARDS. A failed memory reading is logged and ends
   * pressure handling for this sweep.
   */
  private async relievePressure(
    tabs: chrome.tabs.Tab[],
    times: Map<number, number>,
    settings: Settings,
    now: number,
    alreadyDiscarded: number[],
  ): Promise<number[]> {
    const discarded: number[] = [];
    if (!settings.enabled || settings.pressureThresholdPercent <= 0) return discarded;
    const candidates = this.eligibleIds(
      tabs.filter((tab) => tab.id === undefined || !alreadyDiscarded.includes(tab.id)),
      times,
      { ...settings, idleMinutes: 0 },
      now,
    );
    try {
      for (const id of candidates.slice(0, MAX_PRESSURE_DISCARDS)) {
        if (!(await isUnderPressure(settings.pressureThresholdPercent))) break;
        if (!(await this.tryDiscard(id))) continue;
        discarded.push(id);
        await this.sleep(PRESSURE_SETTLE_MS);
      }
    } catch (err) {
      console.warn("Could not read system memory; skipping pressure mode", err);
    }
    return discarded;
  }

  /**
   * Discards every eligible tab right away, ignoring the idle threshold and the
   * "enabled" switch (the user asked explicitly), but still honouring every
   * protection: active, pinned, audible, unsaved input, whitelist and non-http(s).
   * Returns the discarded tab ids.
   */
  async discardNow(): Promise<number[]> {
    const [settings, tabs] = await Promise.all([loadSettings(), chrome.tabs.query({})]);
    const times = await this.snapshot();
    const discarded: number[] = [];
    for (const id of this.eligibleIds(tabs, times, { ...settings, enabled: true, idleMinutes: 0 }, this.now())) {
      if (await this.tryDiscard(id)) discarded.push(id);
    }
    return discarded;
  }

  /**
   * Discards one tab the user picked, ignoring the idle threshold and the protections
   * the user may override (see `decideManualDiscard`). Returns false when the tab is
   * not discardable or no longer exists; a failing `chrome.tabs.get` is treated the same.
   */
  async freezeTab(tabId: number): Promise<boolean> {
    let tab: chrome.tabs.Tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch (err) {
      console.warn(`Could not read tab ${tabId}`, err);
      return false;
    }
    if (!decideManualDiscard(tab).discard) return false;
    return this.tryDiscard(tabId);
  }
}
