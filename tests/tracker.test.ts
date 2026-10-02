import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityTracker } from "../src/tracker";
import { DEFAULT_SETTINGS } from "../src/settings";

const MIN = 60_000;
const NOW = 10_000 * MIN;

let sync: Record<string, unknown>;
let session: Record<string, unknown>;
let tabs: Partial<chrome.tabs.Tab>[];
let discard: ReturnType<typeof vi.fn>;
let getMemoryInfo: ReturnType<typeof vi.fn>;

function tab(id: number, extra: Partial<chrome.tabs.Tab> = {}): Partial<chrome.tabs.Tab> {
  return {
    id,
    url: `https://site${id}.example/`,
    active: false,
    pinned: false,
    audible: false,
    discarded: false,
    ...extra,
  };
}

function area(store: Record<string, unknown>) {
  return {
    get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
    set: async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    },
  };
}

beforeEach(() => {
  sync = {};
  session = {};
  tabs = [];
  discard = vi.fn(async () => ({}));
  getMemoryInfo = vi.fn(async () => ({ capacity: 100, availableCapacity: 90 })); // plenty free
  vi.stubGlobal("chrome", {
    storage: { sync: area(sync), session: area(session) },
    tabs: { query: async () => tabs, discard },
    system: { memory: { getInfo: getMemoryInfo } },
  });
});

describe("ActivityTracker.sweep", () => {
  it("discards only tabs the policy approves", async () => {
    session.lastActive = { 1: NOW - 31 * MIN, 2: NOW - 5 * MIN, 3: NOW - 90 * MIN };
    tabs = [tab(1), tab(2), tab(3, { pinned: true })];
    const tracker = new ActivityTracker(() => NOW);

    const result = await tracker.sweep();

    expect(result).toEqual([1]);
    expect(discard).toHaveBeenCalledTimes(1);
    expect(discard).toHaveBeenCalledWith(1);
  });

  it("never calls discard when the setting is disabled", async () => {
    sync.settings = { ...DEFAULT_SETTINGS, enabled: false };
    session.lastActive = { 1: NOW - 600 * MIN };
    tabs = [tab(1)];

    await new ActivityTracker(() => NOW).sweep();

    expect(discard).not.toHaveBeenCalled();
  });

  it("starts the idle timer for a tab it has never seen instead of discarding it", async () => {
    tabs = [tab(7)];
    const tracker = new ActivityTracker(() => NOW);

    await tracker.sweep();

    expect(discard).not.toHaveBeenCalled();
    expect((await tracker.snapshot()).get(7)).toBe(NOW);
  });

  it("keeps sweeping after one discard fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    session.lastActive = { 1: NOW - 60 * MIN, 2: NOW - 60 * MIN };
    tabs = [tab(1), tab(2)];
    discard.mockRejectedValueOnce(new Error("No tab with id"));

    const result = await new ActivityTracker(() => NOW).sweep();

    expect(result).toEqual([2]);
  });

  it("drops tabs that no longer exist", async () => {
    session.lastActive = { 1: NOW, 99: NOW };
    tabs = [tab(1)];
    const tracker = new ActivityTracker(() => NOW);

    await tracker.sweep();

    expect([...(await tracker.snapshot()).keys()]).toEqual([1]);
  });
});

describe("ActivityTracker tracking", () => {
  it("resets the idle timer when a tab is touched", async () => {
    session.lastActive = { 1: NOW - 60 * MIN };
    tabs = [tab(1)];
    const tracker = new ActivityTracker(() => NOW);

    await tracker.touch(1);
    await tracker.sweep();

    expect(discard).not.toHaveBeenCalled();
  });

  it("restores timestamps from storage.session after a worker restart", async () => {
    const before = new ActivityTracker(() => NOW);
    await before.touch(5);

    const after = new ActivityTracker(() => NOW + 1);

    expect((await after.snapshot()).get(5)).toBe(NOW);
  });

  it("drops a removed tab from tracking and from storage", async () => {
    const tracker = new ActivityTracker(() => NOW);
    await tracker.touch(5);

    await tracker.remove(5);

    expect((await tracker.snapshot()).has(5)).toBe(false);
    expect(session.lastActive).toEqual({});
  });

  it("keeps every write when touches happen concurrently", async () => {
    const tracker = new ActivityTracker(() => NOW);

    await Promise.all([tracker.touch(1), tracker.touch(2), tracker.touch(3)]);

    expect(Object.keys(session.lastActive as object).sort()).toEqual(["1", "2", "3"]);
  });
});

describe("ActivityTracker dirty tabs", () => {
  it("does not discard an idle tab reported dirty", async () => {
    session.lastActive = { 1: NOW - 60 * MIN, 2: NOW - 60 * MIN };
    tabs = [tab(1), tab(2)];
    const tracker = new ActivityTracker(() => NOW);
    await tracker.setDirty(1, true);

    await tracker.sweep();

    expect(discard.mock.calls).toEqual([[2]]);
  });

  it("discards the tab again once it is reported clean", async () => {
    session.lastActive = { 1: NOW - 60 * MIN };
    tabs = [tab(1)];
    const tracker = new ActivityTracker(() => NOW);
    await tracker.setDirty(1, true);
    await tracker.setDirty(1, false);

    await tracker.sweep();

    expect(discard).toHaveBeenCalledWith(1);
  });

  it("restores dirty flags after a worker restart", async () => {
    session.lastActive = { 1: NOW - 60 * MIN };
    session.dirtyTabs = [1];
    tabs = [tab(1)];

    await new ActivityTracker(() => NOW).sweep();

    expect(discard).not.toHaveBeenCalled();
  });

  it("forgets the dirty flag of a removed tab", async () => {
    const tracker = new ActivityTracker(() => NOW);
    await tracker.setDirty(1, true);
    await tracker.remove(1);

    expect(session.dirtyTabs).toEqual([]);
  });
});

describe("ActivityTracker robustness", () => {
  it("starts with an empty map when restoring from storage fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("chrome", {
      storage: {
        sync: area(sync),
        session: { get: async () => Promise.reject(new Error("boom")), set: async () => undefined },
      },
      tabs: { query: async () => tabs, discard },
    });
    const tracker = new ActivityTracker(() => NOW);

    await expect(tracker.snapshot()).resolves.toEqual(new Map());
  });

  it("does not discard a tab touched while the sweep is running", async () => {
    session.lastActive = { 1: NOW - 60 * MIN };
    tabs = [tab(1)];
    const tracker = new ActivityTracker(() => NOW);
    let touched: Promise<void> | undefined;
    // The touch is queued while the sweep's own write is in flight.
    vi.stubGlobal("chrome", {
      storage: {
        sync: area(sync),
        session: {
          get: area(session).get,
          set: async (items: Record<string, unknown>) => {
            touched ??= tracker.touch(1);
            Object.assign(session, items);
          },
        },
      },
      tabs: { query: async () => tabs, discard },
    });

    const result = await tracker.sweep();
    await touched;

    expect(result).toEqual([]);
  });
});

describe("ActivityTracker.discardNow", () => {
  it("discards tabs that are not idle long enough for a sweep", async () => {
    session.lastActive = { 1: NOW - 1 * MIN };
    tabs = [tab(1)];

    const result = await new ActivityTracker(() => NOW).discardNow();

    expect(result).toEqual([1]);
  });

  it("skips active, pinned, audible, whitelisted and dirty tabs", async () => {
    sync.settings = { ...DEFAULT_SETTINGS, whitelist: ["site5.example"] };
    session.dirtyTabs = [6];
    tabs = [tab(1, { active: true }), tab(2, { pinned: true }), tab(3, { audible: true }), tab(5), tab(6), tab(7)];

    const result = await new ActivityTracker(() => NOW).discardNow();

    expect(result).toEqual([7]);
  });

  it("discards even when automatic discarding is switched off", async () => {
    sync.settings = { ...DEFAULT_SETTINGS, enabled: false };
    tabs = [tab(1)];

    const result = await new ActivityTracker(() => NOW).discardNow();

    expect(result).toEqual([1]);
  });

  it("skips chrome:// pages", async () => {
    tabs = [tab(1, { url: "chrome://extensions" })];

    const result = await new ActivityTracker(() => NOW).discardNow();

    expect(result).toEqual([]);
  });
});

describe("ActivityTracker memory pressure", () => {
  const noWait = async () => undefined;

  /** Free memory per reading; the last value repeats. */
  function freeMemory(...percents: number[]) {
    let call = 0;
    getMemoryInfo.mockImplementation(async () => ({ capacity: 100, availableCapacity: percents[Math.min(call++, percents.length - 1)] }));
  }

  it("discards least recently used tabs one at a time until memory is above the threshold", async () => {
    freeMemory(5, 8, 20); // threshold 10: below, below, then eased
    session.lastActive = { 1: NOW - 1 * MIN, 2: NOW - 3 * MIN, 3: NOW - 2 * MIN };
    tabs = [tab(1), tab(2), tab(3)];

    const result = await new ActivityTracker(() => NOW, noWait).sweep();

    expect(result).toEqual([2, 3]);
  });

  it("discards nothing extra when memory is above the threshold", async () => {
    freeMemory(50);
    session.lastActive = { 1: NOW - 1 * MIN };
    tabs = [tab(1)];

    const result = await new ActivityTracker(() => NOW, noWait).sweep();

    expect(result).toEqual([]);
  });

  it("keeps every protection under pressure", async () => {
    freeMemory(1);
    sync.settings = { ...DEFAULT_SETTINGS, whitelist: ["site5.example"] };
    session.dirtyTabs = [6];
    session.lastActive = { 1: NOW, 2: NOW, 3: NOW, 5: NOW, 6: NOW, 7: NOW };
    tabs = [tab(1, { active: true }), tab(2, { pinned: true }), tab(3, { audible: true }), tab(5), tab(6), tab(7)];

    const result = await new ActivityTracker(() => NOW, noWait).sweep();

    expect(result).toEqual([7]);
  });

  it("does nothing when the threshold is 0", async () => {
    freeMemory(1);
    sync.settings = { ...DEFAULT_SETTINGS, pressureThresholdPercent: 0 };
    session.lastActive = { 1: NOW };
    tabs = [tab(1)];

    const result = await new ActivityTracker(() => NOW, noWait).sweep();

    expect(result).toEqual([]);
    expect(getMemoryInfo).not.toHaveBeenCalled();
  });

  it("does nothing when automatic discarding is disabled", async () => {
    freeMemory(1);
    sync.settings = { ...DEFAULT_SETTINGS, enabled: false };
    session.lastActive = { 1: NOW };
    tabs = [tab(1)];

    const result = await new ActivityTracker(() => NOW, noWait).sweep();

    expect(result).toEqual([]);
  });

  it("does not discard the same tab twice when it was already idle", async () => {
    freeMemory(1);
    session.lastActive = { 1: NOW - 60 * MIN };
    tabs = [tab(1)];

    await new ActivityTracker(() => NOW, noWait).sweep();

    expect(discard).toHaveBeenCalledTimes(1);
  });

  it("stops after 10 discards even if memory stays low", async () => {
    freeMemory(1);
    session.lastActive = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i + 1, NOW - i * MIN]));
    tabs = Array.from({ length: 15 }, (_, i) => tab(i + 1));

    const result = await new ActivityTracker(() => NOW, noWait).sweep();

    expect(result).toHaveLength(10);
  });

  it("skips pressure mode and keeps the idle discards when the memory reading fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    getMemoryInfo.mockRejectedValue(new Error("no memory info"));
    session.lastActive = { 1: NOW - 60 * MIN, 2: NOW };
    tabs = [tab(1), tab(2)];

    const result = await new ActivityTracker(() => NOW, noWait).sweep();

    expect(result).toEqual([1]);
  });
});
