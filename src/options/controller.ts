import { loadSettings, saveSettings, type Settings } from "../settings";
import { exportSettings, importSettings, validateForm } from "./validate";

function byId<T extends HTMLElement>(doc: Document, id: string): T {
  const el = doc.getElementById(id);
  if (!el) throw new Error(`options.html is missing #${id}`);
  return el as T;
}

/** Wires the options form in `doc` to the settings module. */
export async function initOptions(doc: Document): Promise<void> {
  const field = (id: string) => byId<HTMLInputElement>(doc, id);
  const whitelist = byId<HTMLTextAreaElement>(doc, "whitelist");
  const transfer = byId<HTMLTextAreaElement>(doc, "settings-json");
  const errors = byId<HTMLElement>(doc, "errors");
  const status = byId<HTMLElement>(doc, "status");

  const show = (settings: Settings) => {
    field("enabled").checked = settings.enabled;
    field("idle-minutes").value = String(settings.idleMinutes);
    field("pressure-percent").value = String(settings.pressureThresholdPercent);
    field("protect-pinned").checked = settings.protectPinned;
    field("protect-audible").checked = settings.protectAudible;
    field("protect-form-dirty").checked = settings.protectFormDirty;
    whitelist.value = settings.whitelist.join("\n");
  };
  const showErrors = (messages: string[]) => {
    errors.replaceChildren(
      ...messages.map((message) => {
        const item = doc.createElement("li");
        item.textContent = message;
        return item;
      }),
    );
  };
  // A rejected save or load is shown on the page instead of dying silently.
  const guarded = (action: () => Promise<void>) => async () => {
    try {
      await action();
    } catch (err) {
      console.warn("Options action failed", err);
      showErrors(["Something went wrong. Please try again."]);
    }
  };

  show(await loadSettings());

  byId<HTMLFormElement>(doc, "settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void guarded(async () => {
      status.textContent = "";
      const result = validateForm({
        enabled: field("enabled").checked,
        idleMinutes: field("idle-minutes").value,
        whitelist: whitelist.value,
        protectPinned: field("protect-pinned").checked,
        protectAudible: field("protect-audible").checked,
        protectFormDirty: field("protect-form-dirty").checked,
        pressureThresholdPercent: field("pressure-percent").value,
      });
      if (!result.ok) return showErrors(result.errors);
      showErrors([]);
      show(await saveSettings(result.settings)); // show what was actually stored (normalized)
      status.textContent = "Settings saved.";
    })();
  });

  byId(doc, "export").addEventListener(
    "click",
    guarded(async () => {
      transfer.value = exportSettings(await loadSettings());
      status.textContent = "Settings exported below.";
    }),
  );

  byId(doc, "import").addEventListener(
    "click",
    guarded(async () => {
      status.textContent = "";
      const result = importSettings(transfer.value);
      if (!result.ok) return showErrors([result.error]);
      showErrors([]);
      show(await saveSettings(result.settings));
      status.textContent = "Settings imported.";
    }),
  );
}
