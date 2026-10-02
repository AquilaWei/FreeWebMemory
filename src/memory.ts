/** Percentage of system memory that is still available (0-100); 100 if capacity is unknown. */
export function availablePercent(info: { capacity: number; availableCapacity: number }): number {
  if (!(info.capacity > 0)) return 100;
  return (info.availableCapacity / info.capacity) * 100;
}

/** True when available system memory is below `thresholdPercent`. Rejects if Chrome cannot report it. */
export async function isUnderPressure(thresholdPercent: number): Promise<boolean> {
  return availablePercent(await chrome.system.memory.getInfo()) < thresholdPercent;
}
