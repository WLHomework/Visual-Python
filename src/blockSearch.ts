import type * as Blockly from "blockly/core";

type ToolboxRecord = Record<string, unknown>;

export type BlockAgentMetadata = {
  description?: string;
  purpose?: string;
  aliases?: string[];
  keywords?: string[];
  examples?: string[];
  capabilities?: string[];
  dependencies?: string[];
  inputDescriptions?: Record<string, string>;
  inputTypes?: Record<string, string>;
  outputType?: string;
  statement?: boolean;
  requires?: string[];
  relatedBlocks?: string[];
  recommendedFor?: string[];
  avoidFor?: string[];
  intentTags?: string[];
};

export type BlockSearchEntry = {
  key: string;
  type: string;
  label: string;
  category: string;
  item: Blockly.utils.toolbox.BlockInfo;
  searchText: string;
  agent?: BlockAgentMetadata;
};

export type BlockCatalogField = { name: string; value: string | number | boolean | null; text: string; options?: Array<{ label: string; value: string }> };
export type BlockCatalogContract = {
  inputSlots: Array<{ name: string; kind: "statement" | "value"; check?: string[] }>;
  hasOutputConnection: boolean;
  outputCheck: string[] | null;
  hasPreviousConnection: boolean;
  previousCheck: string[] | null;
  hasNextConnection: boolean;
  nextCheck: string[] | null;
  fields: BlockCatalogField[];
  requiredInputs?: string[];
};
export type BlockCatalogBlock = BlockCatalogContract & {
  type: string;
  label: string;
  state: Record<string, unknown>;
};
export type BlockCatalogCategory = {
  name: string;
  categories: BlockCatalogCategory[];
  blocks: BlockCatalogBlock[];
};
export type BlockCatalog = { categories: BlockCatalogCategory[] };

export type BlockDirectoryBlock = { type: string; label: string };
export type BlockDirectoryCategory = {
  name: string;
  categories: BlockDirectoryCategory[];
  blocks: BlockDirectoryBlock[];
};
export type BlockDirectory = { categories: BlockDirectoryCategory[] };
export type BlockTaskDirectoryCandidate = {
  apiVersion: 1;
  type: string;
  label: string;
  category: string;
  description?: string;
  purpose?: string;
  aliases?: string[];
  keywords?: string[];
  examples?: string[];
  capabilities?: string[];
  dependencies?: string[];
  inputDescriptions?: Record<string, string>;
  inputTypes?: Record<string, string>;
  outputType?: string;
  statement?: boolean;
  requires?: string[];
  relatedBlocks?: string[];
  recommendedFor?: string[];
  avoidFor?: string[];
  intentTags?: string[];
  contract?: BlockCatalogContract;
};
export type BlockTaskDirectory = {
  apiVersion: 1;
  schema: "visual-python.block-api";
  categories: Array<{ name: string; blockCount: number }>;
  candidates: BlockTaskDirectoryCandidate[];
  omittedCandidateCount?: number;
  hint?: string;
};

type DynamicCategoryResolver = (custom: string) => Blockly.utils.toolbox.FlyoutDefinition | null;
type BlockSearchOptions = { metadataForType?: (type: string) => BlockAgentMetadata | undefined };

const agentArrayFields = [
  "aliases",
  "keywords",
  "examples",
  "capabilities",
  "dependencies",
  "requires",
  "relatedBlocks",
  "recommendedFor",
  "avoidFor",
  "intentTags",
] as const;

function mergeBlockAgentMetadata(...sources: Array<BlockAgentMetadata | undefined>): BlockAgentMetadata {
  const merged: BlockAgentMetadata = {};
  for (const source of sources) {
    if (!source) continue;
    for (const key of ["description", "purpose", "outputType", "statement"] as const) {
      if (source[key] !== undefined) Object.assign(merged, { [key]: source[key] });
    }
    for (const key of agentArrayFields) {
      const values = source[key];
      if (values?.length) {
        const existing = merged[key] || [];
        merged[key] = [...new Set([...existing, ...values])];
      }
    }
    if (source.inputDescriptions) merged.inputDescriptions = { ...(merged.inputDescriptions || {}), ...source.inputDescriptions };
    if (source.inputTypes) merged.inputTypes = { ...(merged.inputTypes || {}), ...source.inputTypes };
  }
  return merged;
}

function inferredAgentMetadata(type: string, label: string, category: string): BlockAgentMetadata {
  const typeTerms = type.split("_").filter((part) => part.length > 1);
  const categoryTerms = category.split("/").map((part) => part.trim()).filter(Boolean);
  const source = `${type} ${label} ${category}`.toLocaleLowerCase();
  const semanticTerms = new Set<string>();
  const addSemantic = (pattern: RegExp, ...terms: string[]) => {
    if (pattern.test(source)) terms.forEach((term) => semanticTerms.add(term));
  };
  addSemantic(/for|while|repeat|loop|迭代|循环|重复|遍历/u, "loop", "循环", "迭代", "遍历");
  addSemantic(/if|else|condition|boolean|logic|判断|条件|逻辑|如果/u, "condition", "条件", "判断");
  addSemantic(/compare|relation|comparison|比较|关系/u, "compare", "比较", "关系");
  addSemantic(/variable|variables|assign|target|变量|赋值/u, "variable", "变量", "assign", "赋值");
  addSemantic(/list|sequence|array|collection|列表|序列|数组|集合/u, "list", "列表", "sequence", "序列", "array", "数组");
  addSemantic(/index|slice|索引|切片/u, "index", "索引");
  addSemantic(/sort|排序/u, "sort", "排序");
  addSemantic(/set|update|insert|delete|修改|设置|插入|删除/u, "modify", "修改");
  return {
    description: `A ${label} block in ${category}. It generates the corresponding Python expression or statement.`,
    keywords: [...new Set([label, ...categoryTerms, ...typeTerms, ...semanticTerms])],
    capabilities: [...semanticTerms],
  };
}

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

const entryKey = (type: string, item: ToolboxRecord) => `${type}:${JSON.stringify({ fields: item.fields, extraState: item.extraState, inputs: item.inputs, next: item.next })}`;

export function createBlockSearchIndex(
  definition: Blockly.utils.toolbox.ToolboxDefinition,
  labelForType: (type: string) => string,
  resolveDynamic?: DynamicCategoryResolver,
  options: BlockSearchOptions = {},
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
      const inferred = inferredAgentMetadata(item.type, label, category);
      const declared = options.metadataForType?.(item.type) || {};
      const agent = mergeBlockAgentMetadata(inferred, declared);
      entries.set(key, {
        key,
        type: item.type,
        label,
        category,
        item: item as unknown as Blockly.utils.toolbox.BlockInfo,
        agent,
        searchText: `${label} ${item.type.replaceAll("_", " ")} ${category} ${searchableValues(item.fields)} ${searchableValues(item.extraState)} ${searchableValues(agent)}`.toLocaleLowerCase(),
      });
    }
  };
  visit(asItems(definition), []);
  return [...entries.values()];
}

export function createBlockCatalog(
  entries: BlockSearchEntry[],
  describe: (type: string, state: Record<string, unknown>) => BlockCatalogContract,
): BlockCatalog {
  const catalog: BlockCatalog = { categories: [] };
  for (const entry of entries) {
    const path = entry.category.split(" / ").filter(Boolean);
    let categories = catalog.categories;
    let category: BlockCatalogCategory | undefined;
    for (const name of path) {
      category = categories.find((item) => item.name === name);
      if (!category) {
        category = { name, categories: [], blocks: [] };
        categories.push(category);
      }
      categories = category.categories;
    }
    const state = { ...entry.item } as unknown as Record<string, unknown>;
    delete state.kind;
    delete state.gap;
    category!.blocks.push({
      type: entry.type,
      label: entry.label,
      state,
      ...describe(entry.type, state),
    });
  }
  return catalog;
}

export function createBlockDirectory(entries: BlockSearchEntry[]): BlockDirectory {
  const directory: BlockDirectory = { categories: [] };
  const seenBlocks = new Set<string>();
  for (const entry of entries) {
    const path = entry.category.split(" / ").filter(Boolean);
    let categories = directory.categories;
    let category: BlockDirectoryCategory | undefined;
    for (const name of path) {
      category = categories.find((item) => item.name === name);
      if (!category) {
        category = { name, categories: [], blocks: [] };
        categories.push(category);
      }
      categories = category.categories;
    }
    const key = `${entry.category}:${entry.type}`;
    if (category && !seenBlocks.has(key)) {
      category.blocks.push({ type: entry.type, label: entry.label });
      seenBlocks.add(key);
    }
  }
  return directory;
}

function taskQueryTerms(query: string): string[] {
  const normalized = normalizedQuery(query);
  const terms = new Set<string>();
  for (const part of normalized.split(/\s+/).filter(Boolean)) {
    for (const match of part.matchAll(/[a-z0-9_]+|[\u3400-\u9fff]+/g)) {
      const value = match[0];
      if (/^[\u3400-\u9fff]+$/.test(value)) {
        if (value.length <= 4) terms.add(value);
        for (let index = 0; index < value.length - 1; index += 1) terms.add(value.slice(index, index + 2));
      } else terms.add(value);
    }
  }
  if (normalized.length >= 2) terms.add(normalized);
  for (const [trigger, related] of capabilityExpansions) {
    if (normalized.includes(trigger)) related.forEach((term) => terms.add(term));
  }
  return [...terms];
}

const capabilityExpansions: Array<[string, string[]]> = [
  ["\u6392\u5e8f", ["\u5217\u8868", "\u5faa\u73af", "\u6bd4\u8f83", "\u6761\u4ef6", "\u7d22\u5f15", "\u53d8\u91cf", "\u8d4b\u503c"]],
  ["sort", ["list", "loop", "compare", "condition", "index", "variable", "assign"]],
  ["\u5192\u6ce1", ["\u6392\u5e8f", "\u5217\u8868", "\u5faa\u73af", "\u6bd4\u8f83", "\u6761\u4ef6", "\u4ea4\u6362"]],
  ["\u6570\u7ec4", ["\u5217\u8868", "\u7d22\u5f15", "\u957f\u5ea6", "\u5faa\u73af"]],
  ["\u77e9\u9635", ["\u6570\u7ec4", "\u5217\u8868", "\u7d22\u5f15", "\u5f62\u72b6"]],
  ["\u6587\u4ef6", ["\u8def\u5f84", "\u8bfb\u53d6", "\u5199\u5165", "\u6587\u4ef6"]],
  ["csv", ["\u6587\u4ef6", "\u8bfb\u53d6", "\u5199\u5165", "\u8868\u683c"]],
  ["\u56fe\u8868", ["\u7ed8\u56fe", "\u6570\u636e", "\u5750\u6807"]],
];

function metadataText(agent: BlockAgentMetadata | undefined, keys: readonly (keyof BlockAgentMetadata)[]): string {
  if (!agent) return "";
  return keys.flatMap((key) => {
    const value = agent[key];
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return [value];
    if (value && typeof value === "object") return Object.values(value);
    return [];
  }).join(" ").toLocaleLowerCase();
}

function taskMatchScore(entry: BlockSearchEntry, query: string, terms: string[]): number {
  const normalized = normalizedQuery(query);
  const label = entry.label.toLocaleLowerCase();
  const type = entry.type.toLocaleLowerCase();
  const category = entry.category.toLocaleLowerCase();
  const agent = entry.agent;
  const purposeText = metadataText(agent, ["purpose", "recommendedFor", "capabilities", "intentTags", "aliases"]);
  const semanticText = metadataText(agent, ["purpose", "recommendedFor", "capabilities", "intentTags", "aliases", "keywords", "examples", "inputDescriptions", "inputTypes", "relatedBlocks"]);
  const avoidText = metadataText(agent, ["avoidFor"]);
  let score = 0;
  if (purposeText.includes(normalized) || metadataText(agent, ["recommendedFor"]).includes(normalized)) score += 900;
  else if (label === normalized) score += 700;
  else if (purposeText.includes(normalized)) score += 500;
  for (const term of terms) {
    const inPurpose = purposeText.includes(term);
    const inSemantic = semanticText.includes(term);
    const inAvoid = avoidText.includes(term);
    if (!inPurpose && !inSemantic && !label.includes(term) && !type.includes(term) && !category.includes(term)) continue;
    if (inSemantic) score += term.length * 12;
    if (inPurpose) score += 120 + term.length * 8;
    if (inAvoid) score -= 180 + term.length * 6;
    if (label.includes(term)) score += 70;
    if (type.includes(term)) score += 8;
    if (category.includes(term)) score += 4;
  }
  return score;
}

function isBroadTask(task: string): boolean {
  const normalized = normalizedQuery(task);
  return [
    /(?:绘制|画|创建|制作|生成|做)(?:一个|一段)?(?:图形|图像|动画|可视化)/u,
    /(?:处理|分析|整理)(?:一些|一批)?数据/u,
    /\b(?:draw|create|make|build|animate|visualize|process)\b.*\b(?:shape|figure|animation|data)\b/i,
  ].some((pattern) => pattern.test(normalized));
}

function candidateDiversityKey(entry: BlockSearchEntry): string {
  const segments = entry.category.split(" / ").filter(Boolean);
  return segments[segments.length - 1] || entry.category;
}

function selectTaskCandidates(
  ranked: Array<{ entry: BlockSearchEntry; score: number; order: number }>,
  limit: number,
  broad: boolean,
  entryByType: Map<string, BlockSearchEntry>,
): BlockSearchEntry[] {
  if (!broad) {
    const selected = ranked.slice(0, limit).map(({ entry }) => entry);
    if (selected.length >= limit) return selected;
    const selectedTypes = new Set(selected.map((entry) => entry.type));
    for (const { entry } of ranked.slice(0, 3)) {
      for (const relatedType of entry.agent?.relatedBlocks ?? []) {
        if (selected.length >= limit) return selected;
        if (selectedTypes.has(relatedType)) continue;
        const related = entryByType.get(relatedType);
        if (!related) continue;
        selectedTypes.add(relatedType);
        selected.push(related);
      }
    }
    return selected;
  }
  const groups = new Map<string, Array<typeof ranked[number]>>();
  for (const item of ranked) {
    const group = candidateDiversityKey(item.entry);
    const candidates = groups.get(group) || [];
    candidates.push(item);
    groups.set(group, candidates);
  }
  const selected: Array<typeof ranked[number]> = [];
  for (let depth = 0; selected.length < limit; depth += 1) {
    let added = false;
    for (const candidates of groups.values()) {
      const candidate = candidates[depth];
      if (!candidate) continue;
      selected.push(candidate);
      added = true;
      if (selected.length >= limit) break;
    }
    if (!added) break;
  }
  return selected.map(({ entry }) => entry);
}

export function createTaskBlockDirectory(
  entries: BlockSearchEntry[],
  task: string,
  options: { limit?: number; describe?: (type: string, state: Record<string, unknown>) => BlockCatalogContract } = {},
): BlockTaskDirectory {
  const terms = taskQueryTerms(task);
  const broad = isBroadTask(task);
  const uniqueTypeCount = new Set(entries.map((entry) => entry.type)).size;
  const rankedResults = entries
    .map((entry, order) => ({ entry, score: taskMatchScore(entry, task, terms), order }))
    .filter(({ score }) => broad || score > 0)
    .sort((left, right) => right.score - left.score || left.order - right.order);
  const seenTypes = new Set<string>();
  const rankedByType = rankedResults.filter(({ entry }) => {
    if (seenTypes.has(entry.type)) return false;
    seenTypes.add(entry.type);
    return true;
  });
  const entryByType = new Map<string, BlockSearchEntry>();
  for (const entry of entries) if (!entryByType.has(entry.type)) entryByType.set(entry.type, entry);
  const ranked = selectTaskCandidates(rankedByType, options.limit ?? 40, broad, entryByType);
  const selected = new Set(ranked.map((entry) => entry.type));
  const summaryEntries = selected.size ? ranked : entries;
  const counts = new Map<string, number>();
  for (const entry of summaryEntries) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  const omittedCandidateCount = ranked.length ? Math.max(0, uniqueTypeCount - ranked.length) : 0;
  const candidates = ranked.map((entry) => {
    const agent = entry.agent ?? {};
    const state = entry.item as unknown as Record<string, unknown>;
    const contract = options.describe?.(entry.type, state);
    return {
      apiVersion: 1 as const,
      type: entry.type,
      label: entry.label,
      category: entry.category,
      ...(agent.description ? { description: agent.description } : {}),
      ...(agent.purpose ? { purpose: agent.purpose } : {}),
      ...(agent.aliases?.length ? { aliases: agent.aliases } : {}),
      ...(agent.keywords?.length ? { keywords: agent.keywords } : {}),
      ...(agent.examples?.length ? { examples: agent.examples } : {}),
      ...(agent.capabilities?.length ? { capabilities: agent.capabilities } : {}),
      ...(agent.dependencies?.length ? { dependencies: agent.dependencies } : {}),
      ...(agent.inputDescriptions ? { inputDescriptions: agent.inputDescriptions } : {}),
      ...(agent.inputTypes ? { inputTypes: agent.inputTypes } : {}),
      ...(agent.outputType ? { outputType: agent.outputType } : {}),
      ...(agent.statement !== undefined ? { statement: agent.statement } : {}),
      ...(agent.requires?.length ? { requires: agent.requires } : {}),
      ...(agent.relatedBlocks?.length ? { relatedBlocks: agent.relatedBlocks } : {}),
      ...(agent.recommendedFor?.length ? { recommendedFor: agent.recommendedFor } : {}),
      ...(agent.avoidFor?.length ? { avoidFor: agent.avoidFor } : {}),
      ...(agent.intentTags?.length ? { intentTags: agent.intentTags } : {}),
      ...(contract ? { contract } : {}),
    };
  });
  return {
    apiVersion: 1,
    schema: "visual-python.block-api",
    categories: [...counts].map(([name, blockCount]) => ({ name, blockCount })),
    candidates,
    ...(omittedCandidateCount ? { omittedCandidateCount } : {}),
    ...(candidates.length ? {} : { hint: "未找到直接匹配的积木。请使用 search_blocks，并只传入一个能描述目标能力的关键词。" }),
  };
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
