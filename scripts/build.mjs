// Bundles the extension into dist/. The version is read from package.json only,
// so it is written in one place.
import { build } from "esbuild";
import { buildManifest } from "./manifest.mjs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const manifest = JSON.parse(await readFile("src/manifest.json", "utf8"));

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await build({
  entryPoints: {
    background: "src/background.ts",
    popup: "src/popup/popup.ts",
    options: "src/options/options.ts",
  },
  outdir: "dist",
  bundle: true,
  format: "esm",
  target: "chrome120",
});

await cp("src/popup/popup.html", "dist/popup.html");
await cp("src/options/options.html", "dist/options.html");
await writeFile(
  "dist/manifest.json",
  JSON.stringify(buildManifest(pkg, manifest), null, 2) + "\n",
);
