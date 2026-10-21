import type * as Blockly from "blockly/core";
import type { HardwareBoardId } from "../firmwareCatalog";

/** 工具箱里的一项：积木类型（字符串）、带字段的选择器、小节标题或分隔。 */
export type ToolboxItemSpec =
  | string
  | { type: string; fields?: Record<string, string | number> }
  | { label: string }
  | { sep: true };

export type ToolboxCategorySpec =
  | { id: string; name: string; colour: string; items: ToolboxItemSpec[] }
  /** 动态分类（变量 / 调用）：整体复制基础工具箱里的同名分类。 */
  | { id: string; fromBase: string };

export type BoardToolboxSpec = { boardId: HardwareBoardId; categories: ToolboxCategorySpec[] };

/** 工具箱来源里的一条条目；解析时整条复制，保留默认字段、影子积木与 extraState。 */
export type ToolboxEntry = {
  kind?: string;
  type?: string;
  name?: string;
  fields?: Record<string, unknown>;
  custom?: string;
  [key: string]: unknown;
};

/** 硬件积木条目表：类型 → 条目（同类型多条时按声明顺序保留，供 fields 选择器区分）。 */
export type ToolboxEntryIndex = ReadonlyMap<string, readonly ToolboxEntry[]>;

export type ToolboxSources = {
  baseToolbox: Blockly.utils.toolbox.ToolboxDefinition;
  hardwareEntries: ToolboxEntryIndex;
};
