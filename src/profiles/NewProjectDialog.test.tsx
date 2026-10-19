import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NewProjectDialog, type NewProjectDialogProps } from "./NewProjectDialog";
import { listWorkbenchProfiles } from "./workbenchProfile";

type ElementWithChildren = ReactElement<{ children?: ReactNode; onClick?: () => void }>;

const text = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (node && typeof node === "object" && "props" in node) return text((node as ElementWithChildren).props.children);
  return "";
};

const buttons = (node: ReactNode, found: ElementWithChildren[] = []): ElementWithChildren[] => {
  if (Array.isArray(node)) {
    for (const child of node) buttons(child, found);
    return found;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return found;
  const element = node as ElementWithChildren;
  if (element.type === "button") found.push(element);
  return buttons(element.props.children, found);
};

const render = (overrides: Partial<NewProjectDialogProps> = {}) => {
  const props: NewProjectDialogProps = {
    profiles: listWorkbenchProfiles(),
    currentId: "python",
    onSelect: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { props, markup: renderToStaticMarkup(<NewProjectDialog {...props}/>) };
};

describe("new project dialog", () => {
  it("offers one card per workbench profile and marks the current one", () => {
    const { markup } = render({ currentId: "esp32-wroom" });

    expect(markup).toContain("新建工程");
    expect(markup.match(/new-project-option /g)?.length).toBe(4);
    expect(markup).toContain("Python");
    expect(markup).toContain("ESP32 WROOM");
    expect(markup).toContain("ESP8266 ESP-12E（NodeMCU）");
    expect(markup).toContain("ESP32-S3");
    expect(markup).toContain("在本机运行，支持 Manim 动画与全部内置积木");
    expect(markup).toContain('class="new-project-option current" aria-current="true"');
    expect(markup).toContain("当前");
  });

  it("hands the picked profile id to the caller and the cancel button to onCancel", () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    const { props } = render({ onSelect, onCancel });
    const elements = buttons(NewProjectDialog(props));

    const boardButton = elements.find((element) => text(element).includes("ESP8266 ESP-12E"));
    expect(boardButton).toBeDefined();
    boardButton?.props.onClick?.();
    expect(onSelect).toHaveBeenCalledWith("esp8266-esp12e");

    const cancelButton = elements.find((element) => text(element) === "取消");
    cancelButton?.props.onClick?.();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
