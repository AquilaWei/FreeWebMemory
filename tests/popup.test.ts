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
let openOptionsPage: ReturnType<typeof vi.fn>;

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
  openOptionsPage = vi.fn(async () => undefined);
  vi.stubGlobal("chrome", {
    storage: { sync: area(sync), local: area(local) },
    tabs: { query: async () => activeTabs },
    runtime: { sendMessage, openOptionsPage },
    system: { memory: { getInfo: async () => ({ capacity: 8 * 1024 ** 3, availableCapacity: 2 * 1024 ** 3 }) } },
  });
});

describe("renderStats", () => {
  it("shows the discarded count and the estimated memory saved", () => {
    renderStats(document, { discardedCount: 4, estimatedBytesSaved: 400 * 1024 * 1024 });
    expect(el("discarded-count").textContent).toBe("4");
    expect(el("saved-estimate").textContent).toBe("~400 MB");
  });

  it("labels the saved figure as an estimate in the page", () => {
    expect(document.body.textContent).toContain("Memory saved (estimate)");
  });

  it("shows system memory when it is known and 'unknown' otherwise", () => {
    renderStats(document, { discardedCount: 0, estimatedBytesSaved: 0 }, { capacity: 8 * 1024 ** 3, availableCapacity: 2 * 1024 ** 3 });
    expect(el("system-memory").textContent).toBe("2.0 GB of 8.0 GB");
    renderStats(document, { discardedCount: 0, estimatedBytesSaved: 0 });
    expect(el("system-memory").textContent).toBe("unknown");
  });

  it("fills the memory meter with the available share when memory is known", () => {
    renderStats(document, { discardedCount: 0, estimatedBytesSaved: 0 }, { capacity: 8 * 1024 ** 3, availableCapacity: 2 * 1024 ** 3 });
    const meter = el("memory-meter") as HTMLMeterElement;
    expect(meter.hidden).toBe(false);
    expect(meter.value).toBe(0.25);
  });

  it("hides the memory meter when memory is unknown", () => {
    renderStats(document, { discardedCount: 0, estimatedBytesSaved: 0 });
    expect(el("memory-meter").hidden).toBe(true);
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

  it("shows the stored idle minutes in the idle field", async () => {
    sync.settings = { ...DEFAULT_SETTINGS, idleMinutes: 45 };
    await initPopup(document);
    expect((el("idle-minutes") as HTMLInputElement).value).toBe("45");
  });

  it("saves a valid idle minutes value when the field changes", async () => {
    await initPopup(document);
    const field = el("idle-minutes") as HTMLInputElement;
    field.value = "15";
    field.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect((sync.settings as { idleMinutes: number }).idleMinutes).toBe(15));
  });

  it.each(["0", "abc", "1441", "2.5", ""])("saves nothing and shows an error for idle minutes %j", async (value) => {
    await initPopup(document);
    const field = el("idle-minutes") as HTMLInputElement;
    field.value = value;
    field.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 0));
    expect(sync.settings).toBeUndefined();
    expect(el("status").textContent).toContain("whole number from 1 to 1440");
  });

  it("opens the options page from the more settings button", async () => {
    await initPopup(document);
    await click("open-options");
    expect(openOptionsPage).toHaveBeenCalledOnce();
  });

  it("lists the window's tabs with a Freeze button for a freezable one", async () => {
    activeTabs = [{ id: 1, title: "Docs", url: "https://a.example/", active: false, discarded: false }];
    await initPopup(document);
    const button = document.querySelector<HTMLButtonElement>("#tab-list li button")!;
    expect(document.querySelector("#tab-list .tab-title")!.textContent).toBe("Docs");
    expect(button.textContent).toBe("Freeze");
    expect(button.disabled).toBe(false);
  });

  it("disables the button of the active, frozen and unsupported tabs and says why", async () => {
    activeTabs = [
      { id: 1, title: "A", url: "https://a.example/", active: true, discarded: false },
      { id: 2, title: "B", url: "https://b.example/", active: false, discarded: true },
      { id: 3, title: "C", url: "chrome://extensions", active: false, discarded: false },
    ];
    await initPopup(document);
    const buttons = [...document.querySelectorAll<HTMLButtonElement>("#tab-list button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["In use", "Frozen", "Not supported"]);
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });

  it("sends freeze-tab with the tab id when Freeze is clicked", async () => {
    activeTabs = [{ id: 42, title: "Docs", url: "https://a.example/", active: false, discarded: false }];
    sendMessage.mockResolvedValueOnce({ frozen: true });
    await initPopup(document);
    document.querySelector<HTMLButtonElement>("#tab-list button")!.click();
    await vi.waitFor(() => expect(el("status").textContent).toBe("Tab frozen."));
    expect(sendMessage).toHaveBeenCalledWith({ type: "freeze-tab", tabId: 42 });
  });

  it("reports when the background could not freeze the tab", async () => {
    activeTabs = [{ id: 42, title: "Docs", url: "https://a.example/", active: false, discarded: false }];
    sendMessage.mockResolvedValueOnce({ frozen: false });
    await initPopup(document);
    document.querySelector<HTMLButtonElement>("#tab-list button")!.click();
    await vi.waitFor(() => expect(el("status").textContent).toBe("This tab cannot be frozen."));
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
