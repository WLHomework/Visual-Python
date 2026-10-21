import * as Blockly from "blockly/core";
import { toolbox as baseToolbox } from "../pythonBlocks";
import { setActiveHardwareBoard } from "../hardware/hardwareBlocks";
import { boardToolboxSpec, hardwareBlockEntries } from "../hardware/toolboxes";
import { resolveBoardToolbox } from "../hardware/toolboxes/resolve";
import { isHardwareWorkbench, type WorkbenchProfile } from "./workbenchProfile";

/** 激活 Profile：硬件 Profile 会激活板卡档案（引脚取值与代码生成），Python Profile 清空板卡但保留积木数据。 */
export function activateWorkbenchProfile(profile: WorkbenchProfile): void {
  setActiveHardwareBoard(isHardwareWorkbench(profile) ? profile.boardId : undefined);
}

/**
 * 按 Profile 组装工具箱。
 *
 * Python Profile 保持工具箱原样（含插件分类）；硬件 Profile 只用板卡的专属声明，
 * 传入的工具箱（可能已被插件扩展）被完全忽略。
 */
export function buildProfileToolbox(toolbox: Blockly.utils.toolbox.ToolboxDefinition, profile: WorkbenchProfile): Blockly.utils.toolbox.ToolboxDefinition {
  if (!isHardwareWorkbench(profile)) return toolbox;
  const spec = boardToolboxSpec(profile.boardId);
  if (!spec) {
    // 缺声明时静默回退会把已移除的 Python 积木重新塞回硬件界面，所以这里直接报错。
    throw new Error(`板卡 ${profile.boardId} 缺少专属工具箱声明（见 src/hardware/toolboxes/）。`);
  }
  return resolveBoardToolbox(spec, { baseToolbox, hardwareEntries: hardwareBlockEntries(profile.boardId) });
}
