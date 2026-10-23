import type * as Blockly from "blockly/core";
import { isHardwareBlockType } from "../blocks/shared";
import type {
  BoardToolboxSpec,
  ToolboxEntry,
  ToolboxItemSpec,
  ToolboxSources,
} from "./types";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * 收集基础工具箱里的积木条目。
 *
 * 只沿分类的 `contents` 走，不进入积木内部：`inputs` 里的影子积木也有 `type`，
 * 一并收集会把 `math_number` 这类类型误当成工具箱条目。
 */
function collectBaseBlocks(items: readonly unknown[], found: ToolboxEntry[]): void {
  for (const item of items) {
    if (!isObject(item)) continue;
    if (item.kind === "block") {
      found.push(item as ToolboxEntry);
      continue;
    }
    if (Array.isArray(item.contents)) collectBaseBlocks(item.contents, found);
  }
}

function baseEntries(
  baseToolbox: Blockly.utils.toolbox.ToolboxDefinition,
  type: string,
  fromCategory?: string,
  categoryName?: string,
): ToolboxEntry[] {
  const definition = baseToolbox as unknown as { contents?: unknown };
  if (!Array.isArray(definition.contents)) return [];
  let items: readonly unknown[] = definition.contents;
  if (fromCategory) {
    // 同一类型可能同时出现在列表、元组、字典等分类里；fromCategory 让硬件白名单取到确定的那条预配置。
    const category = findBaseCategory(baseToolbox, fromCategory);
    if (!category) {
      const context = categoryName ? `工具箱分类「${categoryName}」` : "工具箱";
      throw new Error(`${context}引用了不存在的基础分类「${fromCategory}」`);
    }
    items = Array.isArray(category.contents) ? category.contents : [];
  }
  const found: ToolboxEntry[] = [];
  collectBaseBlocks(items, found);
  return found.filter((entry) => entry.type === type);
}

function matchesFields(entry: ToolboxEntry, fields: Record<string, string | number> | undefined): boolean {
  if (!fields) return true;
  return Object.entries(fields).every(([key, value]) => entry.fields?.[key] === value);
}

/** 按类型与字段在来源里找唯一条目；已注册的硬件积木找不到时返回 undefined（该板卡没有这个积木）。 */
function findEntry(
  type: string,
  fields: Record<string, string | number> | undefined,
  categoryName: string,
  sources: ToolboxSources,
  fromCategory?: string,
): ToolboxEntry | undefined {
  const candidates = type.startsWith("hardware_")
    ? sources.hardwareEntries.get(type) ?? []
    : baseEntries(sources.baseToolbox, type, fromCategory, categoryName);
  const matched = candidates.filter((entry) => matchesFields(entry, fields));
  if (matched.length === 0) {
    if (isHardwareBlockType(type)) return undefined;
    const source = type.startsWith("hardware_") ? "硬件条目" : "基础工具箱";
    throw new Error(`工具箱分类「${categoryName}」里的积木 ${type} 不在${source}里（检查类型是否拼错）`);
  }
  if (matched.length > 1) {
    throw new Error(`工具箱分类「${categoryName}」里的积木 ${type} 匹配到多个条目，请用 fields 区分`);
  }
  return matched[0];
}

function resolveItems(items: ToolboxItemSpec[], categoryName: string, sources: ToolboxSources): unknown[] {
  const contents: unknown[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      const entry = findEntry(item, undefined, categoryName, sources);
      if (entry) contents.push(structuredClone(entry));
      continue;
    }
    if ("label" in item) {
      contents.push({ kind: "label", text: item.label, "web-class": "python-standard-library-label" });
      continue;
    }
    if ("sep" in item) {
      contents.push({ kind: "sep", gap: 20 });
      continue;
    }
    const entry = findEntry(item.type, item.fields, categoryName, sources, item.fromCategory);
    if (entry) contents.push(structuredClone(entry));
  }
  return contents;
}

function findBaseCategory(baseToolbox: Blockly.utils.toolbox.ToolboxDefinition, name: string): Record<string, unknown> | undefined {
  const definition = baseToolbox as unknown as { contents?: unknown };
  if (!Array.isArray(definition.contents)) return undefined;
  return definition.contents.find(
    (item): item is Record<string, unknown> =>
      isObject(item) && item.kind === "category" && item.name === name,
  );
}

/**
 * 把板卡的工具箱声明解析成 Blockly 工具箱定义。
 *
 * 没有写进声明的积木不会出现——硬件界面的工具箱就是这份白名单。
 */
export function resolveBoardToolbox(
  spec: BoardToolboxSpec,
  sources: ToolboxSources,
): Blockly.utils.toolbox.ToolboxDefinition {
  const categories: Record<string, unknown>[] = [];
  for (const category of spec.categories) {
    if ("fromBase" in category) {
      const source = findBaseCategory(sources.baseToolbox, category.fromBase);
      if (!source) {
        throw new Error(`工具箱里没有名为「${category.fromBase}」的分类（分类 ${category.id}）`);
      }
      categories.push(structuredClone(source));
      continue;
    }
    const contents = resolveItems(category.items, category.name, sources);
    // 全是该板卡没有的硬件积木时，分类整体丢弃。
    if (!contents.some((item) => isObject(item) && item.kind === "block")) continue;
    categories.push({ kind: "category", name: category.name, colour: category.colour, contents });
  }
  return { kind: "categoryToolbox", contents: categories } as unknown as Blockly.utils.toolbox.ToolboxDefinition;
}
