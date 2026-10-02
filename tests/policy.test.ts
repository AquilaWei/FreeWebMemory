import { describe, expect, it } from "vitest";
import { decideDiscard, type TabInfo } from "../src/policy";
import { DEFAULT_SETTINGS, type Settings } from "../src/settings";

const MIN = 60_000;
const NOW = 10_000 * MIN;

const tab: TabInfo = {
  url: "https://example.com/page",
  active: false,
  pinned: false,
  audible: false,
  discarded: false,
};
const settings: Settings = { ...DEFAULT_SETTINGS, idleMinutes: 30 };

describe("decideDiscard", () => {
  it("approves a tab idle longer than the threshold", () => {
    expect(decideDiscard(tab, NOW - 31 * MIN, settings, NOW)).toEqual({ discard: true });
  });

  it("approves a tab idle for exactly the threshold", () => {
    expect(decideDiscard(tab, NOW - 30 * MIN, settings, NOW)).toEqual({ discard: true });
  });

  it("refuses a tab one millisecond short of the threshold", () => {
    expect(decideDiscard(tab, NOW - 30 * MIN + 1, settings, NOW)).toEqual({
      discard: false,
      reason: "not_idle",
    });
  });

  it("refuses everything when disabled", () => {
    expect(decideDiscard(tab, 0, { ...settings, enabled: false }, NOW)).toEqual({
      discard: false,
      reason: "disabled",
    });
  });

  it("refuses the active tab", () => {
    expect(decideDiscard({ ...tab, active: true }, 0, settings, NOW)).toEqual({
      discard: false,
      reason: "active",
    });
  });

  it("refuses a pinned tab", () => {
    expect(decideDiscard({ ...tab, pinned: true }, 0, settings, NOW)).toEqual({
      discard: false,
      reason: "pinned",
    });
  });

  it("approves a pinned tab when pinned protection is off", () => {
    const s = { ...settings, protectPinned: false };
    expect(decideDiscard({ ...tab, pinned: true }, 0, s, NOW)).toEqual({ discard: true });
  });

  it("refuses an audible tab", () => {
    expect(decideDiscard({ ...tab, audible: true }, 0, settings, NOW)).toEqual({
      discard: false,
      reason: "audible",
    });
  });

  it("approves an audible tab when audible protection is off", () => {
    const s = { ...settings, protectAudible: false };
    expect(decideDiscard({ ...tab, audible: true }, 0, s, NOW)).toEqual({ discard: true });
  });

  it("refuses an already discarded tab", () => {
    expect(decideDiscard({ ...tab, discarded: true }, 0, settings, NOW)).toEqual({
      discard: false,
      reason: "discarded",
    });
  });

  it("refuses chrome:// pages", () => {
    expect(decideDiscard({ ...tab, url: "chrome://settings" }, 0, settings, NOW)).toEqual({
      discard: false,
      reason: "unsupported_url",
    });
  });

  it("refuses extension pages", () => {
    const t = { ...tab, url: "chrome-extension://abcdef/popup.html" };
    expect(decideDiscard(t, 0, settings, NOW)).toEqual({
      discard: false,
      reason: "unsupported_url",
    });
  });

  it("refuses a tab without a URL", () => {
    expect(decideDiscard({ ...tab, url: undefined }, 0, settings, NOW)).toEqual({
      discard: false,
      reason: "unsupported_url",
    });
  });

  it("refuses a whitelisted hostname", () => {
    const s = { ...settings, whitelist: ["example.com"] };
    expect(decideDiscard(tab, 0, s, NOW)).toEqual({ discard: false, reason: "whitelisted" });
  });

  it("refuses a subdomain of a whitelisted domain", () => {
    const s = { ...settings, whitelist: ["example.com"] };
    const t = { ...tab, url: "https://mail.example.com/inbox" };
    expect(decideDiscard(t, 0, s, NOW)).toEqual({ discard: false, reason: "whitelisted" });
  });

  it("does not treat a lookalike hostname as whitelisted", () => {
    const s = { ...settings, whitelist: ["example.com"] };
    const t = { ...tab, url: "https://notexample.com/" };
    expect(decideDiscard(t, 0, s, NOW)).toEqual({ discard: true });
  });
});
