import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { createPackage } from "../scripts/package.mjs";

let root: string;
let dist: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "package-test-"));
  dist = join(root, "dist");
  mkdirSync(join(dist, "sub"), { recursive: true });
  writeFileSync(join(dist, "manifest.json"), '{"version":"1.2.3"}');
  writeFileSync(join(dist, "background.js"), "console.log(1)");
  writeFileSync(join(dist, "sub", "page.html"), "<p>hi</p>");
});

describe("createPackage", () => {
  it("names the zip after the package and its version", async () => {
    const { zipPath } = await createPackage(dist, join(root, "release"), "freewebmemory", "1.2.3");
    expect(zipPath).toBe(join(root, "release", "freewebmemory-1.2.3.zip"));
  });

  it("puts every dist file in the zip with manifest.json at the top level", async () => {
    const { zipPath } = await createPackage(dist, join(root, "release"), "x", "1.0.0");
    const files = unzipSync(readFileSync(zipPath));
    expect(Object.keys(files).sort()).toEqual(["background.js", "manifest.json", "sub/page.html"]);
    expect(new TextDecoder().decode(files["sub/page.html"])).toBe("<p>hi</p>");
  });

  it("writes a sha256sum-compatible checksum that matches the zip", async () => {
    const { zipPath, sha256Path } = await createPackage(dist, join(root, "release"), "x", "1.0.0");
    const expected = createHash("sha256").update(readFileSync(zipPath)).digest("hex");
    expect(readFileSync(sha256Path, "utf8")).toBe(`${expected}  x-1.0.0.zip\n`);
  });

  it("produces identical bytes for identical input", async () => {
    const first = await createPackage(dist, join(root, "a"), "x", "1.0.0");
    const second = await createPackage(dist, join(root, "b"), "x", "1.0.0");
    expect(first.sha256).toBe(second.sha256);
  });

  it("refuses to package a directory that was never built", async () => {
    await expect(createPackage(join(root, "missing"), join(root, "release"), "x", "1.0.0")).rejects.toThrow(
      /run "npm run build"/,
    );
  });
});
