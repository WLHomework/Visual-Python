import type { HardwareBoardId } from "../firmwareCatalog";
import { esp8266Esp12eToolbox } from "./esp8266-esp12e";
import { esp32S3Toolbox } from "./esp32-s3";
import { esp32WroomToolbox } from "./esp32-wroom";
import type { BoardToolboxSpec } from "./types";

export { hardwareBlockEntries } from "./hardwareEntries";

/**
 * 板卡的专属工具箱声明。
 *
 * 返回 `undefined` 的板卡仍走 `profileToolbox.ts` 里旧的隐藏名单路径（T4.2 删除）。
 */
export function boardToolboxSpec(boardId: HardwareBoardId): BoardToolboxSpec | undefined {
  if (boardId === "esp32-s3") return esp32S3Toolbox;
  if (boardId === "esp32-wroom") return esp32WroomToolbox;
  if (boardId === "esp8266-esp12e") return esp8266Esp12eToolbox;
  return undefined;
}
