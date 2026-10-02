// Zips dist/ into release/<name>-<version>.zip and writes a sha256sum-compatible
// checksum file next to it. Run `npm run build` first.
import { zipSync } from "fflate";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

/** Files below `dir`, as paths relative to it, in a stable order. */
/** @param {string} dir @returns {Promise<string[]>} */
async function listFiles(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join("/"))
    .sort();
}

/**
 * Creates the zip and checksum files. Entry order and timestamps are fixed so the
 * same dist/ always produces the same bytes, which keeps the SHA256 reproducible.
 * Throws if `distDir` has no manifest.json (i.e. the build was not run).
 * @param {string} distDir
 * @param {string} outDir
 * @param {string} name
 * @param {string} version
 * @returns {Promise<{ zipPath: string, sha256Path: string, sha256: string }>}
 */
export async function createPackage(distDir, outDir, name, version) {
  const files = await listFiles(distDir).catch(() => /** @type {string[]} */ ([]));
  if (!files.includes("manifest.json")) throw new Error(`${distDir} has no manifest.json; run "npm run build" first`);

  /** @type {import("fflate").Zippable} */
  const entries = {};
  for (const file of files) {
    entries[file] = [await readFile(join(distDir, file)), { mtime: new Date("2000-01-01T00:00:00Z") }];
  }
  const zip = zipSync(entries);
  const sha256 = createHash("sha256").update(zip).digest("hex");

  await mkdir(outDir, { recursive: true });
  const zipName = `${name}-${version}.zip`;
  const zipPath = join(outDir, zipName);
  const sha256Path = `${zipPath}.sha256`;
  await writeFile(zipPath, zip);
  await writeFile(sha256Path, `${sha256}  ${zipName}\n`);
  return { zipPath, sha256Path, sha256 };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const { zipPath, sha256 } = await createPackage("dist", "release", pkg.name, pkg.version);
  console.log(`${zipPath}\nsha256 ${sha256}`);
}
