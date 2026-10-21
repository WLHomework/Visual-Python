import type { HardwareBoardId } from "../firmwareCatalog";
import { esp32S3Toolbox } from "./esp32-s3";
import type { BoardToolboxSpec } from "./types";

export { hardwareBlockEntries } from "./hardwareEntries";

/**
 * 板卡的专属工具箱声明。
 *
 * 返回 `undefined` 的板卡仍走 `profileToolbox.ts` 里旧的隐藏名单路径，
 * 直到各自的声明补齐（见计划 T4）。
 */
export function boardToolboxSpec(boardId: HardwareBoardId): BoardToolboxSpec | undefined {
  if (boardId === "esp32-s3") return esp32S3Toolbox;
  return undefined;
}
