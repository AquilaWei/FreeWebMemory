/** Sent by the content script when a page gains or loses unsaved form input. Carries only a boolean, never page content. */
export interface DirtyMessage {
  type: "form-dirty";
  dirty: boolean;
}

export function isDirtyMessage(message: unknown): message is DirtyMessage {
  const m = message as Partial<DirtyMessage> | null;
  return typeof m === "object" && m !== null && m.type === "form-dirty" && typeof m.dirty === "boolean";
}
