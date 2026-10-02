// Renders the PNG icons Chrome needs (manifest icons cannot be SVG) from the SVG
// sources in src/icons/. The PNGs are committed, so only run this after editing an
// SVG; it needs ImageMagick 7 (`magick`) on PATH, which the build and CI do not.
import { execFileSync } from "node:child_process";

/** Small sizes use the simplified drawing; fine detail turns to mush below 48 px. */
const SOURCES = { 16: "icon-small.svg", 32: "icon-small.svg", 48: "icon.svg", 128: "icon.svg" };

for (const [size, svg] of Object.entries(SOURCES)) {
  execFileSync("magick", [
    "-background", "none",
    "-density", "768",
    `src/icons/${svg}`,
    "-resize", `${size}x${size}`,
    "-strip",
    `src/icons/icon-${size}.png`,
  ]);
}
