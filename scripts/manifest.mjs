/**
 * Builds the manifest written to dist/. The version comes only from
 * package.json so it is defined in one place.
 * @param {{ version: string }} pkg
 * @param {Record<string, unknown>} srcManifest
 */
export function buildManifest(pkg, srcManifest) {
  return { ...srcManifest, version: pkg.version };
}
