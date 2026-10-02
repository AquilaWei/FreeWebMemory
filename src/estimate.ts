/**
 * Chrome exposes no per-tab memory on the stable channel (`chrome.processes` is
 * dev-channel only), so savings are a flat estimate: a discarded tab frees its
 * renderer, which for ordinary pages is typically 50-150 MiB. 100 MiB sits in the
 * middle. Heavy pages free more and trivial ones less; the UI labels the total an estimate.
 */
export const ESTIMATED_BYTES_PER_TAB = 100 * 1024 * 1024;

/** Estimated bytes freed by discarding `tabCount` tabs; never negative. */
export function estimateSavedBytes(tabCount: number): number {
  if (!Number.isFinite(tabCount) || tabCount <= 0) return 0;
  return Math.floor(tabCount) * ESTIMATED_BYTES_PER_TAB;
}
