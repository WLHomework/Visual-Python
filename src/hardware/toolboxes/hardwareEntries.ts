import { hardwareToolboxContents } from "../hardwareBlocks";
import type { HardwareBoardId } from "../firmwareCatalog";
import type { ToolboxEntry, ToolboxEntryIndex } from "./types";

/**
 * 硬件积木条目表：扫描这块板卡的硬件工具箱内容，把积木条目按类型建索引。
 *
 * 条目仍然由各硬件积木模块决定（例如板卡没有板载 LED 时 `gpio.ts` 不输出它），
 * 工具箱声明只决定分组与顺序。`hardwareToolboxContents` 会激活对应板卡（既有行为）。
 */
export function hardwareBlockEntries(boardId: HardwareBoardId): ToolboxEntryIndex {
  const index = new Map<string, ToolboxEntry[]>();
  for (const item of hardwareToolboxContents(boardId)) {
    const entry = item as unknown as ToolboxEntry;
    if (entry.kind !== "block" || typeof entry.type !== "string") continue;
    const entries = index.get(entry.type);
    if (entries) entries.push(entry);
    else index.set(entry.type, [entry]);
  }
  return index;
}
