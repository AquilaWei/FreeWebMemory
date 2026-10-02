/** Popup → background request to discard every eligible tab now, ignoring the idle threshold. */
export interface DiscardNowMessage {
  type: "discard-now";
}

/** The background's answer to a `DiscardNowMessage`. */
export interface DiscardNowResponse {
  discarded: number;
}

export function isDiscardNowMessage(message: unknown): message is DiscardNowMessage {
  return typeof message === "object" && message !== null && (message as { type?: unknown }).type === "discard-now";
}

/** Popup → background request to discard one specific tab, ignoring the protections the user can override. */
export interface FreezeTabMessage {
  type: "freeze-tab";
  tabId: number;
}

/** The background's answer to a `FreezeTabMessage`. */
export interface FreezeTabResponse {
  frozen: boolean;
}

export function isFreezeTabMessage(message: unknown): message is FreezeTabMessage {
  const m = message as { type?: unknown; tabId?: unknown } | null;
  return typeof m === "object" && m !== null && m.type === "freeze-tab" && Number.isInteger(m.tabId);
}
