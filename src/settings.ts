/** User settings, stored in chrome.storage.sync so they follow the user across devices. */
export interface Settings {
  enabled: boolean;
  /** Minutes a tab must be idle before it may be discarded. */
  idleMinutes: number;
  /** Hostnames never discarded; subdomains are matched too. */
  whitelist: string[];
  protectPinned: boolean;
  protectAudible: boolean;
  protectFormDirty: boolean;
}

export const MIN_IDLE_MINUTES = 1;
export const MAX_IDLE_MINUTES = 24 * 60;

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  enabled: true,
  idleMinutes: 30,
  whitelist: [],
  protectPinned: true,
  protectAudible: true,
  protectFormDirty: true,
};

const STORAGE_KEY = "settings";

/**
 * Reduces a user-typed site to a bare lowercase hostname ("https://Example.com/a?b" and
 * "*.example.com" both become the hostname), or null when nothing usable is left.
 * Subdomains are matched by the policy, so no wildcard is stored.
 */
export function normalizeWhitelistEntry(raw: string): string | null {
  const text = raw.trim().toLowerCase().replace(/^\*\./, "");
  if (text === "") return null;
  try {
    return new URL(text.includes("://") ? text : `http://${text}`).hostname || null;
  } catch {
    return null;
  }
}

/**
 * Returns `settings` with the hostname of `url` added to the whitelist, or null when `url`
 * is not an http(s) page (nothing to whitelist). Adding a site twice keeps one entry.
 */
export function whitelistSite(settings: Settings, url: string | undefined): Settings | null {
  let parsed: URL;
  try {
    parsed = new URL(url ?? "");
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const host = normalizeWhitelistEntry(parsed.hostname);
  if (host === null) return null;
  return { ...settings, whitelist: [...new Set([...settings.whitelist, host])] };
}

/**
 * Turns untrusted input (storage contents, imported JSON) into valid Settings.
 * Unknown keys are dropped, wrongly typed fields fall back to defaults, and
 * idleMinutes is rounded and clamped so a corrupt value can never disable the
 * idle threshold (e.g. 0 or negative) or make it effectively infinite.
 */
export function sanitizeSettings(raw: unknown): Settings {
  const input = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

  const idle = typeof input.idleMinutes === "number" ? input.idleMinutes : Number.NaN;
  const idleMinutes = Number.isFinite(idle)
    ? Math.min(MAX_IDLE_MINUTES, Math.max(MIN_IDLE_MINUTES, Math.round(idle)))
    : d.idleMinutes;

  const whitelist = Array.isArray(input.whitelist)
    ? input.whitelist
        .filter((h): h is string => typeof h === "string")
        .map(normalizeWhitelistEntry) // bare lowercase hostnames, so the policy can match exactly
        .filter((h): h is string => h !== null)
    : [...d.whitelist];

  return {
    enabled: bool(input.enabled, d.enabled),
    idleMinutes,
    whitelist: [...new Set(whitelist)],
    protectPinned: bool(input.protectPinned, d.protectPinned),
    protectAudible: bool(input.protectAudible, d.protectAudible),
    protectFormDirty: bool(input.protectFormDirty, d.protectFormDirty),
  };
}

/** Loads settings; missing or corrupt storage yields defaults. Rejects if storage itself fails. */
export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return sanitizeSettings(stored[STORAGE_KEY]);
}

/** Saves settings after sanitizing them and returns what was actually stored. */
export async function saveSettings(settings: Settings): Promise<Settings> {
  const clean = sanitizeSettings(settings);
  await chrome.storage.sync.set({ [STORAGE_KEY]: clean });
  return clean;
}

/** Calls `listener` with the new settings whenever they change in sync storage. */
export function onSettingsChanged(listener: (settings: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !(STORAGE_KEY in changes)) return;
    listener(sanitizeSettings(changes[STORAGE_KEY].newValue));
  });
}
