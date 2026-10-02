/** True when the element still holds content the user has not saved or submitted. */
function holdsUnsavedContent(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) {
    return el.type === "checkbox" || el.type === "radio"
      ? el.checked !== el.defaultChecked
      : el.value !== el.defaultValue;
  }
  if (el instanceof HTMLTextAreaElement) return el.value !== el.defaultValue;
  if (el instanceof HTMLSelectElement) {
    return Array.from(el.options).some((option) => option.selected !== option.defaultSelected);
  }
  return (el.textContent ?? "").trim() !== "";
}

/**
 * Watches a document for edited fields and reports its state through `report`.
 * The page is dirty while any field the user edited is still in the DOM and
 * still differs from its default (or, for contenteditable, is non-empty). Many
 * apps send through a button handler and clear the field in code, which fires
 * no event, so the state is worked out again from the edited elements on every
 * `input` and whenever the page becomes hidden (discard only targets
 * background tabs) rather than only switched on by events. A form submit or
 * reset forgets the edited fields. This script owns the state: it reports
 * `false` once at start (a fresh document is clean, which also overrides a
 * stale flag left by the tab's previous page), then only transitions. After a
 * back/forward-cache restore (`pageshow` with `persisted`) it reports the
 * current state again, because the page and its form contents come back as
 * they were. Listeners run in the capture phase because `input` events from
 * some widgets do not reach document in the bubble phase.
 */
export function trackDirty(doc: Document, win: Window, report: (dirty: boolean) => void): void {
  const edited = new Set<HTMLElement>();
  let dirty = false;

  const recheck = () => {
    for (const el of edited) {
      if (!el.isConnected || !holdsUnsavedContent(el)) edited.delete(el);
    }
    const value = edited.size > 0;
    if (value === dirty) return;
    dirty = value;
    report(value);
  };
  const forget = () => {
    edited.clear();
    recheck();
  };

  report(false);

  doc.addEventListener(
    "input",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches("input, textarea, select") && !target.isContentEditable) return;
      edited.add(target);
      recheck();
    },
    true,
  );
  doc.addEventListener("visibilitychange", () => {
    if (doc.visibilityState === "hidden") recheck();
  });
  doc.addEventListener("submit", forget, true);
  doc.addEventListener("reset", forget, true);
  win.addEventListener("pageshow", (event) => {
    if (event.persisted) report(dirty);
  });
}
