/**
 * Watches a document for edited form fields and reports transitions through
 * `report`. Typing in an input/textarea/select marks the page dirty; a form
 * submit or reset marks it clean. Only changes are reported, so a long typing
 * session sends one message. Listeners run in the capture phase because
 * `input` events from some widgets do not reach document in the bubble phase.
 */
export function trackDirty(doc: Document, report: (dirty: boolean) => void): void {
  let dirty = false;
  const set = (value: boolean) => {
    if (value === dirty) return;
    dirty = value;
    report(value);
  };

  doc.addEventListener(
    "input",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.matches("input, textarea, select")) return;
      set(true);
    },
    true,
  );
  doc.addEventListener("submit", () => set(false), true);
  doc.addEventListener("reset", () => set(false), true);
}
