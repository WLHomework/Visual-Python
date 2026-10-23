import { describe, expect, it, vi } from "vitest";
import { isWindowDragInteractiveTarget, windowDragInteractiveSelector } from "./windowDragTargets";

const fakeTarget = (matched: boolean) => ({
  closest: vi.fn(() => (matched ? {} : null)),
}) as unknown as EventTarget & { closest: ReturnType<typeof vi.fn> };

describe("window drag targets", () => {
  it("excludes selects, options and other form controls from window double-click handling", () => {
    for (const selector of ["select", "option", "button", "input", "textarea", "role='combobox'"]) {
      expect(windowDragInteractiveSelector).toContain(selector);
    }
  });

  it("treats an interactive target as excluded", () => {
    const target = fakeTarget(true);
    expect(isWindowDragInteractiveTarget(target)).toBe(true);
    expect(target.closest).toHaveBeenCalledWith(windowDragInteractiveSelector);
  });

  it("allows plain header targets to drag and maximize", () => {
    expect(isWindowDragInteractiveTarget(fakeTarget(false))).toBe(false);
    expect(isWindowDragInteractiveTarget(null)).toBe(false);
    expect(isWindowDragInteractiveTarget({} as EventTarget)).toBe(false);
  });
});
