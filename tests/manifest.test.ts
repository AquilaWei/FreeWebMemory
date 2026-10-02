import { buildManifest } from "../scripts/manifest.mjs";
import { existsSync, readFileSync } from "node:fs";
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

describe("icons", () => {
  // The build copies src/icons/ to dist/icons/, so a manifest path icons/x maps to src/icons/x.
  it("points every extension icon at a file that exists", () => {
    const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8"));
    expect(Object.values(manifest.icons).filter((path) => !existsSync(`src/${path}`))).toEqual([]);
  });

  it("points every toolbar icon at a file that exists", () => {
    const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8"));
    expect(Object.values(manifest.action.default_icon).filter((path) => !existsSync(`src/${path}`))).toEqual([]);
  });
});

describe("content script", () => {
  it("runs only on http(s) pages and uses no extra host permissions", () => {
    const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8"));
    expect(manifest.content_scripts).toEqual([
      { matches: ["http://*/*", "https://*/*"], js: ["content.js"], run_at: "document_idle" },
    ]);
    expect(manifest.host_permissions).toBeUndefined();
  });
});

describe("buildManifest", () => {
  const src = { manifest_version: 3, name: "FreeWebMemory", permissions: ["tabs"] };

  it("sets version to the package.json version", () => {
    expect(buildManifest({ version: "1.2.3" }, src).version).toBe("1.2.3");
  });

  it("keeps the other manifest fields unchanged", () => {
    expect(buildManifest({ version: "1.2.3" }, src)).toMatchObject(src);
  });
});
