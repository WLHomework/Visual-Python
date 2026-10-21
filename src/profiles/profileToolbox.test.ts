import { describe, expect, it } from "vitest";
import type * as Blockly from "blockly/core";
import { getActiveHardwareBoard } from "../hardware/hardwareBlocks";
import { activateWorkbenchProfile, buildProfileToolbox } from "./profileToolbox";
import { getWorkbenchProfile } from "./workbenchProfile";

const fakeToolbox = {
  kind: "categoryToolbox",
  contents: [
    { kind: "category", name: "输入输出", colour: "#2f9e8f", contents: [] },
    { kind: "category", name: "循环", colour: "#4b9b62", contents: [] },
    { kind: "category", name: "Manim 动画", colour: "#123456", contents: [] },
    { kind: "sep", gap: 20 },
  ],
} as unknown as Blockly.utils.toolbox.ToolboxDefinition;

const categoryNames = (toolbox: Blockly.utils.toolbox.ToolboxDefinition) =>
  ((toolbox as unknown as { contents: Array<{ kind?: string; name?: string }> }).contents)
    .filter((item) => item.kind === "category")
    .map((item) => item.name);

describe("profile toolbox", () => {
  it("keeps the python toolbox untouched", () => {
    const python = getWorkbenchProfile("python");
    expect(buildProfileToolbox(fakeToolbox, python)).toBe(fakeToolbox);
    expect(categoryNames(buildProfileToolbox(fakeToolbox, python))).toEqual(["输入输出", "循环", "Manim 动画"]);
  });

  it("returns the board declaration and drops plugin categories on a hardware profile", () => {
    const toolbox = buildProfileToolbox(fakeToolbox, getWorkbenchProfile("esp8266-esp12e"));
    const names = categoryNames(toolbox);

    expect(names).toEqual([
      "输入/输出", "控制", "逻辑", "数学", "文本", "列表", "赋值", "变量", "函数", "调用", "串口", "通信", "网络", "传感器", "执行器", "灯光", "显示",
    ]);
    expect(names).not.toContain("Manim 动画");
  });

  it("ignores the passed toolbox and stays stable when rebuilt", () => {
    const profile = getWorkbenchProfile("esp32-wroom");
    const once = buildProfileToolbox(fakeToolbox, profile);
    const twice = buildProfileToolbox(once, profile);

    expect(categoryNames(twice)).toEqual(categoryNames(once));
  });

  it("activates the board only for a hardware profile", () => {
    activateWorkbenchProfile(getWorkbenchProfile("esp8266-esp12e"));
    expect(getActiveHardwareBoard()?.boardId).toBe("esp8266-esp12e");

    activateWorkbenchProfile(getWorkbenchProfile("python"));
    expect(getActiveHardwareBoard()).toBeUndefined();
  });

  it("only offers the board declaration, not Python-only blocks from the passed toolbox", () => {
    const toolbox = buildProfileToolbox(
      {
        kind: "categoryToolbox",
        contents: [
          {
            kind: "category",
            name: "输入输出",
            contents: [
              { kind: "block", type: "python_print" },
              { kind: "block", type: "python_input" },
            ],
          },
          { kind: "category", name: "文件", contents: [{ kind: "block", type: "python_file_read_text" }] },
          { kind: "category", name: "异步", contents: [{ kind: "block", type: "python_asyncio_run" }] },
        ],
      } as unknown as Blockly.utils.toolbox.ToolboxDefinition,
      getWorkbenchProfile("esp32-wroom"),
    );
    const categories = (toolbox as unknown as { contents: Array<{ name?: string; contents?: Array<{ type?: string }> }> }).contents;
    const types = categories.flatMap((item) => item.contents?.map((entry) => entry.type) ?? []);

    expect(categories.some((item) => item.name === "文件")).toBe(false);
    expect(categories.some((item) => item.name === "异步")).toBe(false);
    expect(types).not.toContain("python_input");
    expect(types).not.toContain("python_file_read_text");
    expect(types).not.toContain("python_asyncio_run");
    expect(types).toContain("python_print");
  });
});
