import { afterEach, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { createBlockSearchIndex, searchBlockIndex } from "../../blockSearch";
import { toolbox as baseToolbox } from "../../pythonBlocks";
import { setActiveHardwareBoard } from "../blocks/shared";
import { esp32S3Toolbox } from "./esp32-s3";
import { hardwareBlockEntries } from "./hardwareEntries";
import { resolveBoardToolbox } from "./resolve";

let previewWorkspace: Blockly.Workspace | undefined;

/** 与 App.tsx 的 blockSearchLabelForType 相同：实例化一次积木，再读它的显示文字。 */
const labelForType = (type: string): string => {
  previewWorkspace ??= new Blockly.Workspace();
  let block: Blockly.Block | null = null;
  try {
    block = previewWorkspace.newBlock(type);
    return block.toString(140, "").replace(/\s+/g, " ").trim() || type;
  } catch {
    return type;
  } finally {
    block?.dispose(false);
  }
};

const buildIndex = (resolveDynamic?: (custom: string) => Blockly.utils.toolbox.FlyoutDefinition | null) =>
  createBlockSearchIndex(
    resolveBoardToolbox(esp32S3Toolbox, {
      baseToolbox,
      hardwareEntries: hardwareBlockEntries("esp32-s3"),
    }),
    labelForType,
    resolveDynamic,
  );

afterEach(() => {
  previewWorkspace?.dispose();
  previewWorkspace = undefined;
  setActiveHardwareBoard(undefined);
});

describe("ESP32-S3 工具箱的积木搜索", () => {
  it("能搜到工具箱里的硬件积木", () => {
    const index = buildIndex();

    expect(searchBlockIndex(index, "舵机").map((entry) => entry.type)).toContain("hardware_servo_write");
    expect(searchBlockIndex(index, "OLED").map((entry) => entry.type)).toEqual(
      expect.arrayContaining(["hardware_oled_init", "hardware_oled_write"]),
    );
    expect(searchBlockIndex(index, "引脚").map((entry) => entry.type)).toEqual(
      expect.arrayContaining(["hardware_pin_write", "hardware_pin_read"]),
    );
  });

  it("搜不到工具箱外的 Python 积木", () => {
    const index = buildIndex();

    expect(searchBlockIndex(index, "字典")).toEqual([]);
    expect(searchBlockIndex(index, "lambda")).toEqual([]);
    expect(searchBlockIndex(index, "装饰器")).toEqual([]);
  });

  it("通过 USED_VARIABLES 回调索引动态的变量分类", () => {
    const workspace = new Blockly.Workspace();
    try {
      const variable = workspace.getVariableMap().createVariable("计数");
      const index = buildIndex((custom) =>
        custom === "USED_VARIABLES"
          ? Blockly.Variables.jsonFlyoutCategoryBlocks(workspace, [variable], true)
          : null,
      );

      const entry = searchBlockIndex(index, "变量").find((item) => item.type === "variables_get");
      expect(entry?.category).toBe("变量");
    } finally {
      workspace.dispose();
    }
  });
});
