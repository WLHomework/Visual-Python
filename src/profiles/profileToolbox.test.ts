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

  it("puts the hardware category first and hides plugin categories on a hardware profile", () => {
    const toolbox = buildProfileToolbox(fakeToolbox, getWorkbenchProfile("esp8266-esp12e"));
    expect(categoryNames(toolbox)).toEqual(["硬件", "输入输出", "循环"]);
    const contents = (toolbox as unknown as { contents: Array<{ kind?: string }> }).contents;
    expect(contents.some((item) => item.kind === "sep")).toBe(true);
    const hardware = contents[0] as { contents: Array<{ kind?: string; text?: string; fields?: Record<string, string> }> };
    expect(hardware.contents[0].text).toContain("NodeMCU");
    expect(hardware.contents.find((item) => item.fields && "PIN" in item.fields && item.text === undefined)).toBeTruthy();
  });

  it("replaces a previously injected hardware category instead of duplicating it", () => {
    const profile = getWorkbenchProfile("esp32-wroom");
    const twice = buildProfileToolbox(buildProfileToolbox(fakeToolbox, profile), profile);
    expect(categoryNames(twice)).toEqual(["硬件", "输入输出", "循环"]);
  });

  it("activates the board only for a hardware profile", () => {
    activateWorkbenchProfile(getWorkbenchProfile("esp8266-esp12e"));
    expect(getActiveHardwareBoard()?.boardId).toBe("esp8266-esp12e");

    activateWorkbenchProfile(getWorkbenchProfile("python"));
    expect(getActiveHardwareBoard()).toBeUndefined();
  });
});
