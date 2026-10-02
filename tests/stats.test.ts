import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadStats, resetStats, sanitizeStats, StatsRecorder } from "../src/stats";

const MIB = 1024 * 1024;
let local: Record<string, unknown>;

beforeEach(() => {
  local = {};
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (key: string) => (key in local ? { [key]: local[key] } : {}),
        set: async (items: Record<string, unknown>) => {
          Object.assign(local, items);
        },
      },
    },
  });
});

describe("StatsRecorder", () => {
  it("starts from zero when nothing is stored", async () => {
    expect(await loadStats()).toEqual({ discardedCount: 0, estimatedBytesSaved: 0 });
  });

  it("accumulates discards across calls", async () => {
    const recorder = new StatsRecorder();
    await recorder.record(2);
    await recorder.record(1);
    expect(await loadStats()).toEqual({ discardedCount: 3, estimatedBytesSaved: 300 * MIB });
  });

  it("keeps the totals for a recorder created after a worker restart", async () => {
    await new StatsRecorder().record(2);
    await new StatsRecorder().record(1);
    expect((await loadStats()).discardedCount).toBe(3);
  });

  it("keeps every update when records happen concurrently", async () => {
    const recorder = new StatsRecorder();
    await Promise.all([recorder.record(1), recorder.record(1), recorder.record(1)]);
    expect((await loadStats()).discardedCount).toBe(3);
  });

  it("ignores a negative count", async () => {
    await new StatsRecorder().record(-3);
    expect(await loadStats()).toEqual({ discardedCount: 0, estimatedBytesSaved: 0 });
  });

  it("can be reset to zero", async () => {
    await new StatsRecorder().record(4);
    await resetStats();
    expect(await loadStats()).toEqual({ discardedCount: 0, estimatedBytesSaved: 0 });
  });
});

describe("sanitizeStats", () => {
  it("treats corrupt storage contents as zero", () => {
    expect(sanitizeStats({ discardedCount: "many", estimatedBytesSaved: -1 })).toEqual({ discardedCount: 0, estimatedBytesSaved: 0 });
    expect(sanitizeStats(null)).toEqual({ discardedCount: 0, estimatedBytesSaved: 0 });
  });
});
