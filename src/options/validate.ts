import {
  MAX_IDLE_MINUTES,
  MAX_PRESSURE_PERCENT,
  MIN_IDLE_MINUTES,
  normalizeWhitelistEntry,
  sanitizeSettings,
  type Settings,
} from "../settings";

/** The options form as the user left it: number fields are still text. */
export interface FormValues {
  enabled: boolean;
  idleMinutes: string;
  /** One site per line. */
  whitelist: string;
  protectPinned: boolean;
  protectAudible: boolean;
  protectFormDirty: boolean;
  pressureThresholdPercent: string;
}

export type FormResult = { ok: true; settings: Settings } | { ok: false; errors: string[] };

/** Parses a whole number in [min, max], or returns null. */
function wholeNumber(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text);
  return value >= min && value <= max ? value : null;
}

export const IDLE_MINUTES_ERROR = `Idle minutes must be a whole number from ${MIN_IDLE_MINUTES} to ${MAX_IDLE_MINUTES}.`;

/** Parses the idle-minutes text of a form field, or returns null when it is not a valid whole number in range. */
export function parseIdleMinutes(text: string): number | null {
  return wholeNumber(text, MIN_IDLE_MINUTES, MAX_IDLE_MINUTES);
}

/**
 * Checks the form and builds Settings from it. Unlike `sanitizeSettings`, which quietly
 * repairs stored data, this reports every problem so the user can fix what they typed;
 * nothing should be saved unless `ok` is true. Whitelist lines are normalized to bare
 * lowercase hostnames, blank lines are skipped.
 */
export function validateForm(values: FormValues): FormResult {
  const errors: string[] = [];

  const idleMinutes = parseIdleMinutes(values.idleMinutes);
  if (idleMinutes === null) errors.push(IDLE_MINUTES_ERROR);
  const pressureThresholdPercent = wholeNumber(values.pressureThresholdPercent, 0, MAX_PRESSURE_PERCENT);
  if (pressureThresholdPercent === null) {
    errors.push(`Memory pressure threshold must be a whole number from 0 to ${MAX_PRESSURE_PERCENT}.`);
  }

  const whitelist: string[] = [];
  for (const line of values.whitelist.split("\n")) {
    if (line.trim() === "") continue;
    const host = normalizeWhitelistEntry(line);
    if (host === null) errors.push(`"${line.trim()}" is not a valid site.`);
    else if (!whitelist.includes(host)) whitelist.push(host);
  }

  if (errors.length > 0 || idleMinutes === null || pressureThresholdPercent === null) return { ok: false, errors };
  return {
    ok: true,
    settings: {
      enabled: values.enabled,
      idleMinutes,
      whitelist,
      protectPinned: values.protectPinned,
      protectAudible: values.protectAudible,
      protectFormDirty: values.protectFormDirty,
      pressureThresholdPercent,
    },
  };
}

/** Settings as pretty-printed JSON, for the export box. */
export function exportSettings(settings: Settings): string {
  return JSON.stringify(settings, null, 2);
}

export type ImportResult = { ok: true; settings: Settings } | { ok: false; error: string };

/**
 * Reads exported JSON back into Settings. Anything that is not a JSON object is
 * rejected with a message; fields of the wrong type or out of range are repaired by
 * `sanitizeSettings`, so a hand-edited file cannot store an invalid value.
 */
export function importSettings(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "That is not valid JSON." };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Expected a JSON object with settings." };
  }
  return { ok: true, settings: sanitizeSettings(parsed) };
}
