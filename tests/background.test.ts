import { beforeEach, describe, expect, it, vi } from "vitest";
import { SWEEP_ALARM } from "../src/tracker";

const MIN = 60_000;
const NOW = 10_000 * MIN;

type Listener = (...args: any[]) => unknown; // eslint-disable-line @typescript-eslint/no-explicit-any

let listeners: Record<string, Listener>;
let session: Record<string, unknown>;
let local: Record<string, unknown>;
let tabs: Partial<chrome.tabs.Tab>[];
let discard: ReturnType<typeof vi.fn>;
let alarmExists: boolean;
let createAlarm: ReturnType<typeof vi.fn>;

function event(name: string) {
  return {
    addListener: (fn: Listener) => {
      listeners[name] = fn;
    },
  };
}

async function loadBackground() {
  vi.resetModules();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  await import("../src/background");
  await vi.waitFor(() => expect(createAlarm.mock.calls.length + (alarmExists ? 1 : 0)).toBeGreaterThan(0));
}

async function lastActive(): Promise<Record<string, number>> {
  // Let queued writes finish, then read what was persisted.
  await vi.waitFor(() => expect(session.lastActive).toBeDefined());
  return session.lastActive as Record<string, number>;
}

beforeEach(() => {
  listeners = {};
  session = {};
  local = {};
  tabs = [];
  alarmExists = false;
  discard = vi.fn(async () => ({}));
  createAlarm = vi.fn(async () => undefined);
  vi.stubGlobal("chrome", {
    storage: {
      sync: { get: async () => ({}), set: async () => undefined },
      local: {
        get: async (key: string) => (key in local ? { [key]: local[key] } : {}),
        set: async (items: Record<string, unknown>) => {
          Object.assign(local, items);
        },
      },
      session: {
        get: async (key: string) => (key in session ? { [key]: session[key] } : {}),
        set: async (items: Record<string, unknown>) => {
          Object.assign(session, items);
        },
      },
    },
    tabs: {
      query: async () => tabs,
      discard,
      onActivated: event("activated"),
      onRemoved: event("removed"),
      onUpdated: event("updated"),
    },
    alarms: {
      get: async () => (alarmExists ? { name: SWEEP_ALARM } : undefined),
      create: createAlarm,
      onAlarm: event("alarm"),
    },
    runtime: { id: "me", onInstalled: event("installed"), onStartup: event("startup"), onMessage: event("message") },
  });
});

const idleTab = { id: 1, url: "https://a.example/", active: false, pinned: false, audible: false, discarded: false };

describe("background wiring", () => {
  it("discards an idle tab when the sweep alarm fires", async () => {
    session.lastActive = { 1: NOW - 60 * MIN };
    tabs = [idleTab];
    await loadBackground();

    listeners.alarm({ name: SWEEP_ALARM });

    await vi.waitFor(() => expect(discard).toHaveBeenCalledWith(1));
  });

  it("does nothing when an alarm with another name fires", async () => {
    session.lastActive = { 1: NOW - 60 * MIN };
    tabs = [idleTab];
    await loadBackground();

    listeners.alarm({ name: "other" });
    await new Promise((r) => setTimeout(r, 20));

    expect(discard).not.toHaveBeenCalled();
  });

  it("resets the idle timer when a tab is activated", async () => {
    session.lastActive = { 1: NOW - 60 * MIN };
    await loadBackground();

    listeners.activated({ tabId: 1 });

    await vi.waitFor(async () => expect((await lastActive())[1]).toBe(NOW));
  });

  it("does not reset the timer when onUpdated only reports discarded", async () => {
    session.lastActive = { 1: NOW - 60 * MIN };
    await loadBackground();

    listeners.updated(1, { discarded: true });
    await new Promise((r) => setTimeout(r, 20));

    expect(session.lastActive).toEqual({ 1: NOW - 60 * MIN });
  });

  it("resets the timer when a tab finishes loading", async () => {
    session.lastActive = { 1: NOW - 60 * MIN };
    await loadBackground();

    listeners.updated(1, { status: "complete" });

    await vi.waitFor(async () => expect((await lastActive())[1]).toBe(NOW));
  });

  it("resets the timer when a tab's url changes", async () => {
    session.lastActive = { 1: NOW - 60 * MIN };
    await loadBackground();

    listeners.updated(1, { url: "https://b.example/" });

    await vi.waitFor(async () => expect((await lastActive())[1]).toBe(NOW));
  });

  it("drops a tab from tracking when it is removed", async () => {
    session.lastActive = { 1: NOW - 60 * MIN, 2: NOW };
    await loadBackground();

    listeners.removed(1);

    await vi.waitFor(() => expect(session.lastActive).toEqual({ 2: NOW }));
  });

  it("creates the sweep alarm at worker start when it is missing", async () => {
    await loadBackground();

    expect(createAlarm).toHaveBeenCalledWith(SWEEP_ALARM, { periodInMinutes: 1 });
  });

  it("does not re-create the sweep alarm when it already exists", async () => {
    alarmExists = true;
    await loadBackground();
    listeners.installed();
    listeners.startup();
    await new Promise((r) => setTimeout(r, 20));

    expect(createAlarm).not.toHaveBeenCalled();
  });

  it("marks the sender tab dirty on a form-dirty message", async () => {
    await loadBackground();

    listeners.message({ type: "form-dirty", dirty: true }, { id: "me", tab: { id: 7 } });

    await vi.waitFor(() => expect(session.dirtyTabs).toEqual([7]));
  });

  it("ignores a form-dirty message from another extension", async () => {
    await loadBackground();

    listeners.message({ type: "form-dirty", dirty: true }, { id: "other", tab: { id: 7 } });
    await new Promise((r) => setTimeout(r, 20));

    expect(session.dirtyTabs).toBeUndefined();
  });

  it("keeps a tab dirty across a same-document loading update", async () => {
    await loadBackground();
    listeners.message({ type: "form-dirty", dirty: true }, { id: "me", tab: { id: 7 } });
    await vi.waitFor(() => expect(session.dirtyTabs).toEqual([7]));

    listeners.updated(7, { status: "loading" });
    await new Promise((r) => setTimeout(r, 20));

    expect(session.dirtyTabs).toEqual([7]);
  });

  it("answers discard-now from the popup with the number of tabs discarded", async () => {
    tabs = [idleTab];
    await loadBackground();
    const sendResponse = vi.fn();

    const keepOpen = listeners.message({ type: "discard-now" }, { id: "me" }, sendResponse);

    expect(keepOpen).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ discarded: 1 }));
    expect(discard).toHaveBeenCalledWith(1);
  });

  it("ignores discard-now from another extension and from a content script", async () => {
    tabs = [idleTab];
    await loadBackground();
    const sendResponse = vi.fn();

    listeners.message({ type: "discard-now" }, { id: "other" }, sendResponse);
    listeners.message({ type: "discard-now" }, { id: "me", tab: { id: 3 } }, sendResponse);
    await new Promise((r) => setTimeout(r, 20));

    expect(discard).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it("adds sweep discards to the cumulative stats", async () => {
    session.lastActive = { 1: NOW - 60 * MIN };
    tabs = [idleTab];
    await loadBackground();

    listeners.alarm({ name: SWEEP_ALARM });

    await vi.waitFor(() => expect(local.stats).toEqual({ discardedCount: 1, estimatedBytesSaved: 100 * 1024 * 1024 }));
  });
});
