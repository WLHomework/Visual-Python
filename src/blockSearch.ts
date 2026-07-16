import type * as Blockly from "blockly/core";

type ToolboxRecord = Record<string, unknown>;

export type BlockSearchEntry = {
  key: string;
  type: string;
  label: string;
  category: string;
  item: Blockly.utils.toolbox.BlockInfo;
  searchText: string;
};

type DynamicCategoryResolver = (custom: string) => Blockly.utils.toolbox.FlyoutDefinition | null;

const asItems = (definition: Blockly.utils.toolbox.ToolboxDefinition | Blockly.utils.toolbox.FlyoutDefinition | null): ToolboxRecord[] => {
  if (!definition || typeof definition === "string" || (typeof Node !== "undefined" && definition instanceof Node)) return [];
  if (Array.isArray(definition)) return definition as unknown as ToolboxRecord[];
  if ("contents" in definition && Array.isArray(definition.contents)) return definition.contents as unknown as ToolboxRecord[];
  return [];
};

const searchableValues = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(searchableValues).join(" ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(searchableValues).join(" ");
  return "";
};

const entryKey = (type: string, item: ToolboxRecord) => `${type}:${searchableValues(item.fields)}:${searchableValues(item.extraState)}`;

export function createBlockSearchIndex(
  definition: Blockly.utils.toolbox.ToolboxDefinition,
  labelForType: (type: string) => string,
  resolveDynamic?: DynamicCategoryResolver,
): BlockSearchEntry[] {
  const entries = new Map<string, BlockSearchEntry>();
  const visit = (items: ToolboxRecord[], path: string[]) => {
    for (const item of items) {
      if (item.kind === "category") {
        const name = typeof item.name === "string" ? item.name : "";
        const nextPath = name ? [...path, name] : path;
        if (typeof item.custom === "string" && resolveDynamic) visit(asItems(resolveDynamic(item.custom)), nextPath);
        if (Array.isArray(item.contents)) visit(item.contents as ToolboxRecord[], nextPath);
        continue;
      }
      if (item.kind !== "block" || typeof item.type !== "string") continue;
      const key = entryKey(item.type, item);
      if (entries.has(key)) continue;
      const label = labelForType(item.type);
      const category = path.join(" / ") || "其他";
      entries.set(key, {
        key,
        type: item.type,
        label,
        category,
        item: item as unknown as Blockly.utils.toolbox.BlockInfo,
        searchText: `${label} ${item.type.replaceAll("_", " ")} ${category} ${searchableValues(item.fields)} ${searchableValues(item.extraState)}`.toLocaleLowerCase(),
      });
    }
  };
  visit(asItems(definition), []);
  return [...entries.values()];
}

const normalizedQuery = (query: string) => query.normalize("NFKC").trim().toLocaleLowerCase();

export function searchBlockIndex(entries: BlockSearchEntry[], query: string, limit = 60): BlockSearchEntry[] {
  const normalized = normalizedQuery(query);
  if (!normalized) return [];
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return entries
    .flatMap((entry, order) => {
      if (!tokens.every((token) => entry.searchText.includes(token))) return [];
      const label = entry.label.toLocaleLowerCase();
      const type = entry.type.toLocaleLowerCase();
      const category = entry.category.toLocaleLowerCase();
      let score = 0;
      if (label === normalized) score += 1000;
      else if (label.startsWith(normalized)) score += 700;
      else if (label.includes(normalized)) score += 500;
      if (type === normalized) score += 800;
      else if (type.split("_").some((part) => part.startsWith(normalized))) score += 350;
      else if (type.includes(normalized)) score += 250;
      if (category.includes(normalized)) score += 100;
      score += Math.max(0, 80 - label.length);
      return [{ entry, score, order }];
    })
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .slice(0, limit)
    .map(({ entry }) => entry);
}

export function blockSearchFlyout(entries: BlockSearchEntry[]): Blockly.utils.toolbox.FlyoutItemInfoArray {
  if (!entries.length) return [{ kind: "label", text: "没有找到匹配的积木" } as Blockly.utils.toolbox.LabelInfo];
  const groups = new Map<string, BlockSearchEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.category) ?? [];
    group.push(entry);
    groups.set(entry.category, group);
  }
  return [...groups].flatMap(([category, group]) => [
    { kind: "label", text: category } as Blockly.utils.toolbox.LabelInfo,
    ...group.map((entry) => ({ ...entry.item, gap: 12 })),
  ]);
}
