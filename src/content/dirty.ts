/**
 * Watches a document for edited fields and reports its state through `report`.
 * Typing in an input/textarea/select or a contenteditable element marks the
 * page dirty; a form submit or reset marks it clean. This script owns the
 * state: it reports `false` once at start (a fresh document is clean, which
 * also overrides a stale flag left by the tab's previous page), then only
 * transitions. After a back/forward-cache restore (`pageshow` with
 * `persisted`) it reports the current state again, because the page and its
 * form contents come back as they were. Listeners run in the capture phase
 * because `input` events from some widgets do not reach document in the
 * bubble phase.
 */
export function trackDirty(doc: Document, win: Window, report: (dirty: boolean) => void): void {
  let dirty = false;
  const set = (value: boolean) => {
    if (value === dirty) return;
    dirty = value;
    report(value);
  };

  report(false);

  doc.addEventListener(
    "input",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.matches("input, textarea, select") || target.isContentEditable) set(true);
    },
    true,
  );
  doc.addEventListener("submit", () => set(false), true);
  doc.addEventListener("reset", () => set(false), true);
  win.addEventListener("pageshow", (event) => {
    if (event.persisted) report(dirty);
  });
}
