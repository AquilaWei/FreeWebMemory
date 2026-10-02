import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("source manifest", () => {
  it("does not hardcode a version because the build injects it", () => {
    const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8"));
    expect(manifest.version).toBeUndefined();
  });

  it("is Manifest V3", () => {
    const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8"));
    expect(manifest.manifest_version).toBe(3);
  });
});
