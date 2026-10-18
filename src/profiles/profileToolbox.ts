import * as Blockly from "blockly/core";
import { toolbox as baseToolbox } from "../pythonBlocks";
import { hardwareToolboxCategory, hardwareToolboxCategoryName, setActiveHardwareBoard } from "../hardware/hardwareBlocks";
import { isHardwareWorkbench, type WorkbenchProfile } from "./workbenchProfile";

const baseCategoryNames = new Set(
  ((baseToolbox as unknown as { contents?: Array<{ kind?: string; name?: string }> }).contents ?? [])
    .filter((item) => item.kind === "category" && typeof item.name === "string")
    .map((item) => item.name as string),
);

/** 激活 Profile：硬件 Profile 会激活板卡档案（引脚取值与代码生成），Python Profile 清空板卡但保留积木数据。 */
export function activateWorkbenchProfile(profile: WorkbenchProfile): void {
  setActiveHardwareBoard(isHardwareWorkbench(profile) ? profile.boardId : undefined);
}

/**
 * 按 Profile 组装工具箱。
 *
 * Python Profile 保持工具箱原样（含插件分类）；硬件 Profile 只保留内置 Python 分类并把「硬件」分类放在最前，
 * 插件带来的宿主专属分类（Manim、绘图、数值库等）不会出现。
 */
export function buildProfileToolbox(toolbox: Blockly.utils.toolbox.ToolboxDefinition, profile: WorkbenchProfile): Blockly.utils.toolbox.ToolboxDefinition {
  if (!isHardwareWorkbench(profile)) return toolbox;
  const definition = toolbox as unknown as { kind?: string; contents?: Array<{ kind?: string; name?: string }> };
  if (!Array.isArray(definition.contents)) return toolbox;
  const kept = definition.contents.filter((item) => {
    if (item.kind !== "category") return true;
    if (item.name === hardwareToolboxCategoryName) return false;
    return typeof item.name === "string" && baseCategoryNames.has(item.name);
  });
  return {
    ...definition,
    contents: [hardwareToolboxCategory(profile.boardId), ...kept],
  } as unknown as Blockly.utils.toolbox.ToolboxDefinition;
}
