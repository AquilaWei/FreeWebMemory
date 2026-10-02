import { describe, expect, it } from "vitest";
import { ESTIMATED_BYTES_PER_TAB, estimateSavedBytes } from "../src/estimate";

describe("estimateSavedBytes", () => {
  it("estimates 100 MiB per discarded tab", () => {
    expect(ESTIMATED_BYTES_PER_TAB).toBe(104_857_600);
    expect(estimateSavedBytes(3)).toBe(314_572_800);
  });

  it("returns zero for zero tabs", () => {
    expect(estimateSavedBytes(0)).toBe(0);
  });

  it("never returns a negative value", () => {
    expect(estimateSavedBytes(-4)).toBe(0);
    expect(estimateSavedBytes(Number.NaN)).toBe(0);
  });

  it("rounds a fractional tab count down", () => {
    expect(estimateSavedBytes(2.9)).toBe(2 * 104_857_600);
  });
});
