import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8"));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|html)$/.test(e.name))
    .map((e) => join(e.parentPath, e.name));
}

const sources = sourceFiles("src").map((file) => ({ file, text: readFileSync(file, "utf8") }));
const allSource = sources.map((s) => s.text).join("\n");

describe("manifest permissions", () => {
  it("declares exactly the permissions the extension needs", () => {
    expect([...manifest.permissions].sort()).toEqual(["alarms", "storage", "system.memory", "tabs"]);
  });

  it("uses every declared permission somewhere in src/", () => {
    expect(allSource).toContain("chrome.storage.");
    expect(allSource).toContain("chrome.tabs.");
    expect(allSource).toContain("chrome.alarms.");
    expect(allSource).toContain("chrome.system.memory.");
  });

  it("declares no host permissions beyond the content script's matches", () => {
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(manifest.optional_permissions).toBeUndefined();
  });
});

describe("no remote code", () => {
  it("keeps the default extension content security policy", () => {
    expect(manifest.content_security_policy).toBeUndefined();
  });

  it("exposes nothing to web pages", () => {
    expect(manifest.web_accessible_resources).toBeUndefined();
    expect(manifest.externally_connectable).toBeUndefined();
  });

  it("loads no script from a remote url", () => {
    expect(allSource).not.toMatch(/<script[^>]+src=["']?(https?:)?\/\//i);
  });

  it("does not evaluate strings as code", () => {
    expect(allSource).not.toMatch(/\beval\s*\(|new\s+Function\s*\(/);
  });
});

describe("no network calls", () => {
  it.each([
    ["fetch", /\bfetch\s*\(/],
    ["XMLHttpRequest", /\bXMLHttpRequest\b/],
    ["WebSocket", /\bWebSocket\b/],
    ["EventSource", /\bEventSource\b/],
    ["sendBeacon", /\bsendBeacon\b/],
    ["dynamic import of a url", /\bimport\s*\(\s*["'`]https?:/],
  ])("src/ does not use %s", (_name, pattern) => {
    expect(allSource).not.toMatch(pattern);
  });
});
