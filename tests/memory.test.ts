import { afterEach, describe, expect, it, vi } from "vitest";
import { availablePercent, isUnderPressure } from "../src/memory";

afterEach(() => vi.unstubAllGlobals());

describe("availablePercent", () => {
  it("returns the available share of capacity", () => {
    expect(availablePercent({ capacity: 8000, availableCapacity: 2000 })).toBe(25);
  });

  it("returns 100 when capacity is unknown so pressure is never assumed", () => {
    expect(availablePercent({ capacity: 0, availableCapacity: 0 })).toBe(100);
  });
});

describe("isUnderPressure", () => {
  it("is true below the threshold and false at it", async () => {
    vi.stubGlobal("chrome", { system: { memory: { getInfo: async () => ({ capacity: 100, availableCapacity: 10 }) } } });
    expect(await isUnderPressure(11)).toBe(true);
    expect(await isUnderPressure(10)).toBe(false);
  });
});
