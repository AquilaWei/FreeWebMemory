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
