import { describe, expect, it } from "vitest";
import { getWorkbenchShortcutAction } from "./workbenchShortcuts";

const event = (overrides: Partial<KeyboardEvent> = {}) => ({
  key: "",
  code: "",
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  repeat: false,
  isComposing: false,
  defaultPrevented: false,
  target: null,
  ...overrides,
});

describe("workbench shortcuts", () => {
  it("maps Ctrl+Enter and Meta+Enter to run", () => {
    expect(getWorkbenchShortcutAction(event({ key: "Enter", ctrlKey: true }))).toEqual({ type: "run" });
    expect(getWorkbenchShortcutAction(event({ code: "Enter", metaKey: true }))).toEqual({ type: "run" });
  });

  it("maps Shift+F5 to stop", () => {
    expect(getWorkbenchShortcutAction(event({ key: "F5", shiftKey: true }))).toEqual({ type: "stop" });
  });

  it("maps Alt+1/2/3 to workspace modes", () => {
    expect(getWorkbenchShortcutAction(event({ key: "1", altKey: true }))).toEqual({ type: "mode", mode: "visual" });
    expect(getWorkbenchShortcutAction(event({ code: "Digit2", altKey: true }))).toEqual({ type: "mode", mode: "split" });
    expect(getWorkbenchShortcutAction(event({ key: "3", altKey: true }))).toEqual({ type: "mode", mode: "code" });
  });

  it("requires an exact modifier combination", () => {
    expect(getWorkbenchShortcutAction(event({ key: "Enter", ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(getWorkbenchShortcutAction(event({ key: "F5", shiftKey: true, altKey: true }))).toBeNull();
    expect(getWorkbenchShortcutAction(event({ key: "4", altKey: true }))).toBeNull();
  });

  it("ignores repeated, composing, prevented, and editable mode events", () => {
    expect(getWorkbenchShortcutAction(event({ key: "Enter", ctrlKey: true, repeat: true }))).toBeNull();
    expect(getWorkbenchShortcutAction(event({ key: "Enter", ctrlKey: true, isComposing: true }))).toBeNull();
    expect(getWorkbenchShortcutAction(event({ key: "Enter", ctrlKey: true, defaultPrevented: true }))).toBeNull();
    const input = { tagName: "INPUT" } as unknown as EventTarget;
    expect(getWorkbenchShortcutAction(event({ key: "1", altKey: true, target: input }))).toBeNull();
  });
});
