import { buildManifest } from "../scripts/manifest.mjs";
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

describe("buildManifest", () => {
  const src = { manifest_version: 3, name: "Memory Saver", permissions: ["tabs"] };

  it("sets version to the package.json version", () => {
    expect(buildManifest({ version: "1.2.3" }, src).version).toBe("1.2.3");
  });

  it("keeps the other manifest fields unchanged", () => {
    expect(buildManifest({ version: "1.2.3" }, src)).toMatchObject(src);
  });
});
