import { beforeEach, describe, expect, it, vi } from "vitest";
import { SWEEP_ALARM } from "../src/tracker";

const MIN = 60_000;
const NOW = 10_000 * MIN;

type Listener = (...args: any[]) => unknown; // eslint-disable-line @typescript-eslint/no-explicit-any

let listeners: Record<string, Listener>;
let session: Record<string, unknown>;
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
  tabs = [];
  alarmExists = false;
  discard = vi.fn(async () => ({}));
  createAlarm = vi.fn(async () => undefined);
  vi.stubGlobal("chrome", {
    storage: {
      sync: { get: async () => ({}), set: async () => undefined },
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
    runtime: { onInstalled: event("installed"), onStartup: event("startup") },
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
});
