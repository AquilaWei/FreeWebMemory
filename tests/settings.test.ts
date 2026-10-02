import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  normalizeWhitelistEntry,
  onSettingsChanged,
  sanitizeSettings,
  saveSettings,
  whitelistSite,
  type Settings,
} from "../src/settings";

type ChangeListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;

let store: Record<string, unknown>;
let changeListeners: ChangeListener[];

beforeEach(() => {
  store = {};
  changeListeners = [];
  vi.stubGlobal("chrome", {
    storage: {
      sync: {
        get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
        set: async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        },
      },
      onChanged: { addListener: (l: ChangeListener) => changeListeners.push(l) },
    },
  });
});

describe("loadSettings", () => {
  it("returns the documented defaults when storage is empty", async () => {
    expect(await loadSettings()).toEqual({
      enabled: true,
      idleMinutes: 30,
      whitelist: [],
      protectPinned: true,
      protectAudible: true,
      protectFormDirty: true,
      pressureThresholdPercent: 10,
    });
  });

  it("returns defaults for fields missing from a partial record", async () => {
    store.settings = { idleMinutes: 5 };
    expect(await loadSettings()).toEqual({ ...DEFAULT_SETTINGS, idleMinutes: 5 });
  });
});

describe("sanitizeSettings", () => {
  it("clamps negative idle minutes up to 1", () => {
    expect(sanitizeSettings({ idleMinutes: -10 }).idleMinutes).toBe(1);
  });

  it("clamps zero idle minutes up to 1", () => {
    expect(sanitizeSettings({ idleMinutes: 0 }).idleMinutes).toBe(1);
  });

  it("clamps huge idle minutes down to 1440", () => {
    expect(sanitizeSettings({ idleMinutes: 999999 }).idleMinutes).toBe(1440);
  });

  it("falls back to the default for a non-numeric idle value", () => {
    expect(sanitizeSettings({ idleMinutes: "soon" }).idleMinutes).toBe(30);
  });

  it("falls back to the default for NaN", () => {
    expect(sanitizeSettings({ idleMinutes: NaN }).idleMinutes).toBe(30);
  });

  it("rounds fractional idle minutes", () => {
    expect(sanitizeSettings({ idleMinutes: 12.6 }).idleMinutes).toBe(13);
  });

  it("falls back to defaults for non-boolean flags", () => {
    expect(sanitizeSettings({ enabled: "yes", protectPinned: 0 })).toMatchObject({
      enabled: true,
      protectPinned: true,
    });
  });

  it("trims and lowercases whitelist entries so they match hostnames", () => {
    expect(sanitizeSettings({ whitelist: [" Example.COM "] }).whitelist).toEqual(["example.com"]);
  });

  it("drops non-string and blank whitelist entries", () => {
    expect(sanitizeSettings({ whitelist: ["a.com", 5, "  ", null] }).whitelist).toEqual(["a.com"]);
  });

  it("returns defaults for non-object input", () => {
    expect(sanitizeSettings("garbage")).toEqual(DEFAULT_SETTINGS);
  });
});

describe("saveSettings", () => {
  it("round-trips through storage", async () => {
    const custom: Settings = {
      enabled: false,
      idleMinutes: 45,
      whitelist: ["example.com"],
      protectPinned: false,
      protectAudible: true,
      protectFormDirty: false,
      pressureThresholdPercent: 25,
    };
    await saveSettings(custom);
    expect(await loadSettings()).toEqual(custom);
  });

  it("stores the clamped value when given an invalid one", async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, idleMinutes: -5 });
    expect((await loadSettings()).idleMinutes).toBe(1);
  });
});

describe("onSettingsChanged", () => {
  it("fires the listener with the new settings on a sync change", () => {
    const listener = vi.fn();
    onSettingsChanged(listener);
    changeListeners[0]({ settings: { newValue: { idleMinutes: 10 } } }, "sync");
    expect(listener).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, idleMinutes: 10 });
  });

  it("ignores changes in other storage areas", () => {
    const listener = vi.fn();
    onSettingsChanged(listener);
    changeListeners[0]({ settings: { newValue: { idleMinutes: 10 } } }, "local");
    expect(listener).not.toHaveBeenCalled();
  });

  it("ignores changes to unrelated keys", () => {
    const listener = vi.fn();
    onSettingsChanged(listener);
    changeListeners[0]({ other: { newValue: 1 } }, "sync");
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("normalizeWhitelistEntry", () => {
  it("reduces a url to its lowercase hostname", () => {
    expect(normalizeWhitelistEntry("HTTPS://Docs.Example.com:8080/a/b?c=1#d")).toBe("docs.example.com");
  });

  it("drops a leading wildcard and a bare path", () => {
    expect(normalizeWhitelistEntry("*.example.com")).toBe("example.com");
    expect(normalizeWhitelistEntry("example.com/path")).toBe("example.com");
  });

  it("returns null for blank or unusable input", () => {
    expect(normalizeWhitelistEntry("   ")).toBeNull();
    expect(normalizeWhitelistEntry("not a host")).toBeNull();
  });
});

describe("whitelistSite", () => {
  it("adds the hostname of an https page once", () => {
    const once = whitelistSite(DEFAULT_SETTINGS, "https://Example.com/x");
    expect(whitelistSite(once!, "https://example.com/y")?.whitelist).toEqual(["example.com"]);
  });

  it("returns null for non-http pages and missing urls", () => {
    expect(whitelistSite(DEFAULT_SETTINGS, "chrome://extensions")).toBeNull();
    expect(whitelistSite(DEFAULT_SETTINGS, undefined)).toBeNull();
  });
});

describe("sanitizeSettings whitelist normalization", () => {
  it("stores bare hostnames without duplicates", () => {
    expect(sanitizeSettings({ whitelist: ["https://A.com/x", "a.com", "*.b.com"] }).whitelist).toEqual(["a.com", "b.com"]);
  });
});

describe("sanitizeSettings pressure threshold", () => {
  it("accepts 0 to turn pressure mode off", () => {
    expect(sanitizeSettings({ pressureThresholdPercent: 0 }).pressureThresholdPercent).toBe(0);
  });

  it("clamps a value above 50 and a negative value", () => {
    expect(sanitizeSettings({ pressureThresholdPercent: 90 }).pressureThresholdPercent).toBe(50);
    expect(sanitizeSettings({ pressureThresholdPercent: -3 }).pressureThresholdPercent).toBe(0);
  });

  it("falls back to the default for a non-numeric value", () => {
    expect(sanitizeSettings({ pressureThresholdPercent: "low" }).pressureThresholdPercent).toBe(10);
  });
});
