// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/settings";
import { initPopup } from "../src/popup/controller";
import { formatBytes, renderStats } from "../src/popup/render";

let sync: Record<string, unknown>;
let local: Record<string, unknown>;
let activeTabs: Partial<chrome.tabs.Tab>[];
let sendMessage: ReturnType<typeof vi.fn>;

function area(store: Record<string, unknown>) {
  return {
    get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
    set: async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    },
  };
}

function el(id: string): HTMLElement {
  return document.getElementById(id)!;
}

async function click(id: string) {
  el(id).click();
  await new Promise((r) => setTimeout(r, 0)); // let the async handler finish
}

beforeEach(() => {
  document.documentElement.innerHTML = readFileSync("src/popup/popup.html", "utf8");
  sync = {};
  local = {};
  activeTabs = [{ id: 1, url: "https://Docs.Example.com/page" }];
  sendMessage = vi.fn(async () => ({ discarded: 3 }));
  vi.stubGlobal("chrome", {
    storage: { sync: area(sync), local: area(local) },
    tabs: { query: async () => activeTabs },
    runtime: { sendMessage },
    system: { memory: { getInfo: async () => ({ capacity: 8 * 1024 ** 3, availableCapacity: 2 * 1024 ** 3 }) } },
  });
});

describe("renderStats", () => {
  it("shows the discarded count and the estimated memory saved", () => {
    renderStats(document, { discardedCount: 4, estimatedBytesSaved: 400 * 1024 * 1024 });
    expect(el("discarded-count").textContent).toBe("4");
    expect(el("saved-estimate").textContent).toBe("~400 MB");
  });

  it("shows system memory when it is known and 'unknown' otherwise", () => {
    renderStats(document, { discardedCount: 0, estimatedBytesSaved: 0 }, { capacity: 8 * 1024 ** 3, availableCapacity: 2 * 1024 ** 3 });
    expect(el("system-memory").textContent).toBe("2.0 GB of 8.0 GB");
    renderStats(document, { discardedCount: 0, estimatedBytesSaved: 0 });
    expect(el("system-memory").textContent).toBe("unknown");
  });
});

describe("formatBytes", () => {
  it("uses MB below one GB and GB above", () => {
    expect(formatBytes(300 * 1024 ** 2)).toBe("300 MB");
    expect(formatBytes(1.5 * 1024 ** 3)).toBe("1.5 GB");
  });

  it("returns 0 MB for negative or invalid input", () => {
    expect(formatBytes(-5)).toBe("0 MB");
    expect(formatBytes(Number.NaN)).toBe("0 MB");
  });
});

describe("initPopup", () => {
  it("shows the stored stats when it opens", async () => {
    local.stats = { discardedCount: 7, estimatedBytesSaved: 700 * 1024 ** 2 };
    await initPopup(document);
    expect(el("discarded-count").textContent).toBe("7");
  });

  it("reflects the stored enabled setting in the toggle", async () => {
    sync.settings = { ...DEFAULT_SETTINGS, enabled: false };
    await initPopup(document);
    expect((el("enabled") as HTMLInputElement).checked).toBe(false);
  });

  it("saves the enabled setting when the toggle changes", async () => {
    await initPopup(document);
    const toggle = el("enabled") as HTMLInputElement;
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect((sync.settings as { enabled: boolean }).enabled).toBe(false));
  });

  it("sends a discard-now message and reports how many tabs were discarded", async () => {
    await initPopup(document);
    await click("discard-now");
    expect(sendMessage).toHaveBeenCalledWith({ type: "discard-now" });
    expect(el("status").textContent).toBe("Discarded 3 tabs.");
  });

  it("adds the active tab's hostname to the whitelist", async () => {
    await initPopup(document);
    await click("never-discard");
    expect((sync.settings as { whitelist: string[] }).whitelist).toEqual(["docs.example.com"]);
  });

  it("does not whitelist a non-http page", async () => {
    activeTabs = [{ id: 1, url: "chrome://extensions" }];
    await initPopup(document);
    await click("never-discard");
    expect(sync.settings).toBeUndefined();
    expect(el("status").textContent).toBe("This page cannot be discarded anyway.");
  });

  it("shows an error message when sending the discard request fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    sendMessage.mockRejectedValueOnce(new Error("no worker"));
    await initPopup(document);
    await click("discard-now");
    expect(el("status").textContent).toBe("Something went wrong. Please try again.");
  });

  it("resets the stored stats", async () => {
    local.stats = { discardedCount: 7, estimatedBytesSaved: 700 * 1024 ** 2 };
    await initPopup(document);
    await click("reset-stats");
    expect(local.stats).toEqual({ discardedCount: 0, estimatedBytesSaved: 0 });
    expect(el("discarded-count").textContent).toBe("0");
  });
});

describe("popup.html accessibility", () => {
  it("gives every control an accessible name", () => {
    const controls = document.querySelectorAll("input, button, select, textarea");
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      const labelled = control.closest("label")?.textContent?.trim() || control.textContent?.trim() || control.getAttribute("aria-label");
      expect(labelled, `#${control.id} needs a label`).toBeTruthy();
    }
  });

  it("uses only native, keyboard-operable controls and no positive tabindex", () => {
    expect(document.querySelectorAll("[onclick], [tabindex]:not([tabindex='0']):not([tabindex='-1'])").length).toBe(0);
    for (const button of document.querySelectorAll("button")) expect(button.getAttribute("type")).toBe("button");
  });

  it("announces status changes politely to screen readers", () => {
    expect(el("status").getAttribute("role")).toBe("status");
  });
});
