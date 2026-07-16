import type { WorkspaceMode } from "./workspaceMode";

export type WorkbenchShortcutAction =
  | { type: "run" }
  | { type: "stop" }
  | { type: "mode"; mode: WorkspaceMode };

type ShortcutKeyboardEvent = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "repeat" | "isComposing" | "defaultPrevented" | "target">;

const isEditableTarget = (target: EventTarget | null) => {
  if (!target || typeof target !== "object") return false;
  const element = target as { isContentEditable?: boolean; tagName?: string };
  if (element.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName || "");
};

const hasOnlyControl = (event: ShortcutKeyboardEvent) => event.ctrlKey !== event.metaKey && !event.shiftKey && !event.altKey;
const hasOnlyShift = (event: ShortcutKeyboardEvent) => event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
const hasOnlyAlt = (event: ShortcutKeyboardEvent) => event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;

/** Maps the workbench's global shortcuts without triggering any side effects. */
export function getWorkbenchShortcutAction(event: ShortcutKeyboardEvent): WorkbenchShortcutAction | null {
  if (event.defaultPrevented || event.repeat || event.isComposing) return null;

  if (hasOnlyControl(event) && (event.key === "Enter" || event.code === "Enter")) return { type: "run" };
  if (hasOnlyShift(event) && (event.key === "F5" || event.code === "F5")) return { type: "stop" };
  if (!hasOnlyAlt(event) || isEditableTarget(event.target)) return null;

  const modeByKey: Record<string, WorkspaceMode> = { "1": "visual", "2": "split", "3": "code" };
  const mode = modeByKey[event.key] ?? modeByKey[event.code.replace("Digit", "")];
  return mode ? { type: "mode", mode } : null;
}
