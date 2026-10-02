import type { Settings } from "./settings";

/** The tab fields the policy looks at (a subset of chrome.tabs.Tab). */
export interface TabInfo {
  url?: string;
  active: boolean;
  pinned: boolean;
  audible: boolean;
  discarded: boolean;
  /** True when the page reported edited form fields (see content script). */
  dirty?: boolean;
}

export type RefusalReason =
  | "disabled"
  | "active"
  | "pinned"
  | "audible"
  | "dirty"
  | "discarded"
  | "unsupported_url"
  | "whitelisted"
  | "not_idle";

export type DiscardDecision = { discard: true } | { discard: false; reason: RefusalReason };

/** True if `hostname` equals a whitelist entry or is a subdomain of it. */
function isWhitelisted(hostname: string, whitelist: readonly string[]): boolean {
  return whitelist.some((entry) => hostname === entry || hostname.endsWith(`.${entry}`));
}

/**
 * Decides whether a tab may be discarded. Checks run in a fixed order and the
 * first failing one is reported, so every refusal has exactly one reason.
 * A tab idle for exactly `idleMinutes` is eligible (boundary is inclusive).
 * Only http(s) pages qualify: chrome://, extension pages, about: etc. are
 * refused as `unsupported_url`, as is a tab with no readable URL.
 *
 * @param lastActiveMs epoch ms when the tab was last active
 * @param nowMs epoch ms of the decision
 */
export function decideDiscard(
  tab: TabInfo,
  lastActiveMs: number,
  settings: Settings,
  nowMs: number,
): DiscardDecision {
  if (!settings.enabled) return { discard: false, reason: "disabled" };
  if (tab.active) return { discard: false, reason: "active" };
  if (tab.discarded) return { discard: false, reason: "discarded" };
  if (tab.pinned && settings.protectPinned) return { discard: false, reason: "pinned" };
  if (tab.audible && settings.protectAudible) return { discard: false, reason: "audible" };
  if (tab.dirty && settings.protectFormDirty) return { discard: false, reason: "dirty" };

  let url: URL;
  try {
    url = new URL(tab.url ?? "");
  } catch {
    return { discard: false, reason: "unsupported_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { discard: false, reason: "unsupported_url" };
  }
  if (isWhitelisted(url.hostname.toLowerCase(), settings.whitelist)) {
    return { discard: false, reason: "whitelisted" };
  }

  if (nowMs - lastActiveMs < settings.idleMinutes * 60_000) {
    return { discard: false, reason: "not_idle" };
  }
  return { discard: true };
}
