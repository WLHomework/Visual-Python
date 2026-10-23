/**
 * 顶级工具栏同时承担窗口拖动/双击最大化。双击下拉框时事件会冒泡到 header，
 * 导致“选板卡/选串口”顺带把窗口最大化；所有可交互控件都要从窗口拖动逻辑里排除。
 */
export const windowDragInteractiveSelector = [
  "button",
  "input",
  "select",
  "option",
  "textarea",
  "a",
  "label",
  "[contenteditable='true']",
  "[role='button']",
  "[role='combobox']",
  "[role='menuitem']",
  "[data-no-window-drag]",
].join(",");

type ClosestTarget = { closest?: (selector: string) => unknown };

/**
 * 判断事件目标是否属于可交互控件。用 `closest` 做鸭式检测，而不是 `instanceof Element`，
 * 这样在 SSR/单元测试环境里也能复用同一套判断。
 */
export const isWindowDragInteractiveTarget = (target: EventTarget | null): boolean => {
  const candidate = target as ClosestTarget | null;
  if (!candidate || typeof candidate.closest !== "function") return false;
  return Boolean(candidate.closest(windowDragInteractiveSelector));
};
