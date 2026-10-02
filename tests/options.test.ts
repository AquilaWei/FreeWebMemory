// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initOptions } from "../src/options/controller";
import { exportSettings, importSettings, validateForm, type FormValues } from "../src/options/validate";
import { DEFAULT_SETTINGS } from "../src/settings";

let sync: Record<string, unknown>;

const validValues: FormValues = {
  enabled: true,
  idleMinutes: "20",
  whitelist: "Example.com\nhttps://News.Site/path",
  protectPinned: true,
  protectAudible: false,
  protectFormDirty: true,
  pressureThresholdPercent: "15",
};

function input(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

function submit() {
  document.getElementById("settings-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
}

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  document.documentElement.innerHTML = readFileSync("src/options/options.html", "utf8");
  sync = {};
  vi.stubGlobal("chrome", {
    storage: {
      sync: {
        get: async (key: string) => (key in sync ? { [key]: sync[key] } : {}),
        set: async (items: Record<string, unknown>) => {
          Object.assign(sync, items);
        },
      },
    },
  });
});

describe("validateForm", () => {
  it("builds settings from valid input and normalizes the whitelist", () => {
    expect(validateForm(validValues)).toEqual({
      ok: true,
      settings: {
        enabled: true,
        idleMinutes: 20,
        whitelist: ["example.com", "news.site"],
        protectPinned: true,
        protectAudible: false,
        protectFormDirty: true,
        pressureThresholdPercent: 15,
      },
    });
  });

  it("rejects idle minutes that are out of range or not a whole number", () => {
    for (const bad of ["0", "1441", "abc", "", "2.5", "-3"]) {
      expect(validateForm({ ...validValues, idleMinutes: bad }).ok, bad).toBe(false);
    }
  });

  it("rejects a pressure threshold above 50", () => {
    expect(validateForm({ ...validValues, pressureThresholdPercent: "51" }).ok).toBe(false);
  });

  it("accepts 0 as the pressure threshold", () => {
    expect(validateForm({ ...validValues, pressureThresholdPercent: "0" }).ok).toBe(true);
  });

  it("reports an invalid whitelist line and names it", () => {
    expect(validateForm({ ...validValues, whitelist: "ok.com\nnot a host" })).toEqual({
      ok: false,
      errors: ['"not a host" is not a valid site.'],
    });
  });

  it("skips blank whitelist lines and duplicates", () => {
    const result = validateForm({ ...validValues, whitelist: "a.com\n\n  \nA.com\nhttp://a.com/x" });
    expect(result.ok && result.settings.whitelist).toEqual(["a.com"]);
  });
});

describe("importSettings", () => {
  it("re-imports exported settings unchanged", () => {
    const settings = { ...DEFAULT_SETTINGS, idleMinutes: 45, whitelist: ["a.com"], pressureThresholdPercent: 20 };
    expect(importSettings(exportSettings(settings))).toEqual({ ok: true, settings });
  });

  it("rejects malformed JSON with a message", () => {
    expect(importSettings("{oops")).toEqual({ ok: false, error: "That is not valid JSON." });
  });

  it("rejects JSON that is not an object", () => {
    expect(importSettings("[1,2]").ok).toBe(false);
    expect(importSettings("null").ok).toBe(false);
    expect(importSettings("42").ok).toBe(false);
  });

  it("repairs an out-of-range value instead of storing it", () => {
    const result = importSettings('{"idleMinutes": 99999}');
    expect(result.ok && result.settings.idleMinutes).toBe(1440);
  });
});

describe("options page", () => {
  it("fills the form from the stored settings", async () => {
    sync.settings = { ...DEFAULT_SETTINGS, idleMinutes: 12, whitelist: ["a.com", "b.com"] };
    await initOptions(document);
    expect(input("idle-minutes").value).toBe("12");
    expect(input("whitelist").value).toBe("a.com\nb.com");
  });

  it("saves a valid form through the settings module", async () => {
    await initOptions(document);
    input("idle-minutes").value = "20";
    input("pressure-percent").value = "15";
    input("whitelist").value = "HTTPS://Example.com/x";
    submit();
    await tick();
    expect(sync.settings).toMatchObject({ idleMinutes: 20, pressureThresholdPercent: 15, whitelist: ["example.com"] });
    expect(document.getElementById("status")!.textContent).toBe("Settings saved.");
  });

  it("shows the normalized whitelist after saving", async () => {
    await initOptions(document);
    input("whitelist").value = "HTTPS://Example.com/x";
    submit();
    await tick();
    expect(input("whitelist").value).toBe("example.com");
  });

  it("shows an error and saves nothing for invalid input", async () => {
    await initOptions(document);
    input("idle-minutes").value = "0";
    submit();
    await tick();
    expect(sync.settings).toBeUndefined();
    expect(document.getElementById("errors")!.textContent).toContain("Idle minutes must be a whole number");
  });

  it("exports the stored settings as JSON", async () => {
    sync.settings = { ...DEFAULT_SETTINGS, idleMinutes: 12 };
    await initOptions(document);
    document.getElementById("export")!.click();
    await tick();
    expect(JSON.parse(input("settings-json").value)).toEqual({ ...DEFAULT_SETTINGS, idleMinutes: 12 });
  });

  it("imports valid JSON, stores it and fills the form", async () => {
    await initOptions(document);
    input("settings-json").value = JSON.stringify({ ...DEFAULT_SETTINGS, idleMinutes: 77 });
    document.getElementById("import")!.click();
    await tick();
    expect((sync.settings as { idleMinutes: number }).idleMinutes).toBe(77);
    expect(input("idle-minutes").value).toBe("77");
  });

  it("rejects malformed JSON on import with a message and saves nothing", async () => {
    await initOptions(document);
    input("settings-json").value = "{oops";
    document.getElementById("import")!.click();
    await tick();
    expect(sync.settings).toBeUndefined();
    expect(document.getElementById("errors")!.textContent).toBe("That is not valid JSON.");
  });
});

describe("options.html accessibility", () => {
  it("gives every control an accessible name", () => {
    for (const control of document.querySelectorAll("input, button, select, textarea")) {
      const name = control.closest("label")?.textContent?.trim() || control.textContent?.trim();
      expect(name, `#${control.id} needs a label`).toBeTruthy();
    }
  });

  it("announces errors and status changes", () => {
    expect(document.getElementById("errors")!.getAttribute("role")).toBe("alert");
    expect(document.getElementById("status")!.getAttribute("role")).toBe("status");
  });
});
