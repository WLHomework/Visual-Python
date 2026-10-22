import type * as Blockly from "blockly/core";
import type { HardwareBoardId } from "../firmwareCatalog";

/**
 * 一个硬件积木包必须提供的两个入口。
 *
 * 新模块只要按这个形状导出 `register` 和 `toolboxContents`，再在
 * `hardwareBlockPacks` 里加一行，就会自动进入注册流程和工具箱组装；
 * 不需要在 `App.tsx` 里再加板卡判断。
 */
export type HardwareBlockPack = {
  register(): void;
  toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[];
};

export function registerHardwarePacks(packs: readonly HardwareBlockPack[]): void {
  for (const pack of packs) pack.register();
}

export function hardwarePackToolboxContents(
  packs: readonly HardwareBlockPack[],
  boardId?: HardwareBoardId,
): Blockly.utils.toolbox.FlyoutItemInfo[] {
  return packs.flatMap((pack) => pack.toolboxContents(boardId));
}
