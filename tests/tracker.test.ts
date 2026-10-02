import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityTracker } from "../src/tracker";
import { DEFAULT_SETTINGS } from "../src/settings";

const MIN = 60_000;
const NOW = 10_000 * MIN;

let sync: Record<string, unknown>;
let session: Record<string, unknown>;
let tabs: Partial<chrome.tabs.Tab>[];
let discard: ReturnType<typeof vi.fn>;

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
  vi.stubGlobal("chrome", {
    storage: { sync: area(sync), session: area(session) },
    tabs: { query: async () => tabs, discard },
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
