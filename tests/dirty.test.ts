// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { trackDirty } from "../src/content/dirty";
import { isDirtyMessage } from "../src/content/messages";

let report: Mock<(dirty: boolean) => void>;

beforeEach(() => {
  document.body.innerHTML = `<form><input id="name"><textarea id="note"></textarea></form><button id="b">x</button>`;
  report = vi.fn<(dirty: boolean) => void>();
  trackDirty(document, report);
});

function type(id: string) {
  document.getElementById(id)!.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("trackDirty", () => {
  it("reports dirty when typing into an input", () => {
    type("name");
    expect(report.mock.calls).toEqual([[true]]);
  });

  it("reports dirty when typing into a textarea", () => {
    type("note");
    expect(report.mock.calls).toEqual([[true]]);
  });

  it("reports only once during repeated typing", () => {
    type("name");
    type("name");
    type("note");
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("reports clean when the form is reset", () => {
    type("name");
    document.querySelector("form")!.dispatchEvent(new Event("reset", { bubbles: true }));
    expect(report.mock.calls).toEqual([[true], [false]]);
  });

  it("reports clean when the form is submitted", () => {
    type("name");
    document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true }));
    expect(report.mock.calls).toEqual([[true], [false]]);
  });

  it("reports nothing for a submit on a clean page", () => {
    document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true }));
    expect(report).not.toHaveBeenCalled();
  });

  it("ignores input events from non-form elements", () => {
    type("b");
    expect(report).not.toHaveBeenCalled();
  });
});

describe("isDirtyMessage", () => {
  it("accepts a message with a boolean flag", () => {
    expect(isDirtyMessage({ type: "form-dirty", dirty: true })).toBe(true);
  });

  it("rejects a non-boolean flag", () => {
    expect(isDirtyMessage({ type: "form-dirty", dirty: "yes" })).toBe(false);
  });

  it("rejects other message types and null", () => {
    expect(isDirtyMessage({ type: "other", dirty: true })).toBe(false);
    expect(isDirtyMessage(null)).toBe(false);
  });
});
