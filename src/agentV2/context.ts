import type { AiChatMessage } from "../aiConfig";
import type { AgentConversationTurn } from "./types";

type AgentRequestContextInput = {
  system: string;
  prompt: string;
  history: AgentConversationTurn[];
  snapshot: Record<string, unknown>;
  memory: string;
  blockCatalog?: string;
};

export type AgentRequestContext = AgentRequestContextInput;

const truncate = (value: string, max: number) => value.length > max ? `${value.slice(0, max)}\n[内容已截断]` : value;
const maxAgentToolHistoryCharacters = 32_000;
const maxCompactedToolHistoryCharacters = 12_000;
const maxBlockCatalogCharacters = 44_000;
const maxInitialRequestCharacters = 150_000;
const maxContextHistoryTurns = 24;
const maxContextHistoryCharacters = 24_000;
const maxContextHistoryMessageCharacters = 4_000;
const compactedToolHistoryPrefix = "历史工具回合已压缩。已完成的工具结果摘要（除非需要新信息，不要重复读取）：\n";

type CatalogCategory = {
  name: string;
  categories?: CatalogCategory[];
  blocks?: Record<string, unknown>[];
};

export function compactBlockCatalogForPrompt(value: string, maxCharacters = 8_000): string | null {
  return compactTaskBlockDirectory(value, maxCharacters)?.text || compactBlockCatalog(value, maxCharacters)?.text || null;
}

export function hasTruncatedBlockCatalog(value?: string): boolean {
  if (!value?.trim()) return false;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    const record = parsed as Record<string, unknown>;
    return record.truncated === true
      || (typeof record.omittedCandidateCount === "number" && record.omittedCandidateCount > 0)
      || (typeof record.omittedBlockCount === "number" && record.omittedBlockCount > 0);
  } catch {
    return false;
  }
}

function catalogHasContracts(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as { candidates?: unknown };
    return Array.isArray(parsed?.candidates) && parsed.candidates.some((candidate) => Boolean(candidate && typeof candidate === "object" && (candidate as Record<string, unknown>).contract));
  } catch {
    return false;
  }
}

export function graphicalCatalogInstructions(blockCatalog?: string): string {
  const catalog = blockCatalog?.trim();
  const contracts = Boolean(catalog && catalogHasContracts(catalog));
  const contractText = contracts ? " with exact fields, input slots and requiredInputs" : "";
  const discoveryRules = !catalog
    ? "No task block catalog is attached. Call get_task_block_directory once for task discovery; its candidates include the field, input and required-input contract, so build the plan from that result. Do not search for blocks one by one."
    : hasTruncatedBlockCatalog(catalog)
      ? `The attached task block catalog is a ranked candidate selection and reports omittedCandidateCount, so other blocks were omitted. Its candidates${contractText} let you build apply_block_plan directly; do not repeat discovery. Only if a required block type is absent, make at most one search_blocks call or one get_task_block_directory call with a different task phrase, and read get_block_templates only for types whose contract is still missing or empty.`
      : `The prompt contains a complete catalog${contractText}. do not call get_task_block_directory or search_blocks. Use the catalog directly to build apply_block_plan, and call get_block_templates at most once in a batch only for types whose contract is missing or empty.`;
  return `Catalog strategy for this graphical task: ${discoveryRules}`;
}

const planningCandidateKeys = new Set([
  "type", "label", "category", "purpose", "recommendedFor", "relatedBlocks", "avoidFor", "requires",
  "inputDescriptions", "inputTypes", "outputType", "statement", "examples", "contract",
]);

function compactTaskBlockDirectory(value: string, maxCharacters: number): { text: string; omittedBlocks: number } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { candidates?: unknown }).candidates)) return null;
  const record = parsed as { categories?: unknown; candidates: unknown[]; hint?: unknown; omittedCandidateCount?: unknown };
  const candidates = record.candidates.filter((candidate): candidate is Record<string, unknown> => Boolean(candidate && typeof candidate === "object" && !Array.isArray(candidate)));
  const categories = Array.isArray(record.categories) ? record.categories : [];
  const previouslyOmitted = typeof record.omittedCandidateCount === "number" && record.omittedCandidateCount > 0
    ? record.omittedCandidateCount
    : 0;
  const build = (limit: number) => {
    const kept = candidates.slice(0, limit).map((candidate) => Object.fromEntries(Object.entries(candidate)
      .filter(([key]) => planningCandidateKeys.has(key))
      .map(([key, item]) => {
        if (typeof item === "string") return [key, truncate(item, 800)];
        if (Array.isArray(item)) return [key, item.slice(0, 8).map((entry) => typeof entry === "string" ? truncate(entry, 300) : entry)];
        return [key, item];
      })));
    const omittedBlocks = previouslyOmitted + candidates.length - limit;
    return {
      text: JSON.stringify({ categories, candidates: kept, ...(record.hint ? { hint: record.hint } : {}), ...(omittedBlocks ? { omittedCandidateCount: omittedBlocks } : {}) }),
      omittedBlocks,
    };
  };
  let low = 0;
  let high = candidates.length;
  let best = build(0);
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = build(middle);
    if (candidate.text.length <= maxCharacters) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

function compactBlockCatalog(value: string, maxCharacters: number): { text: string; omittedBlocks: number } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { text: JSON.stringify({ content: truncate(value, Math.max(0, maxCharacters - 64)), truncated: value.length > maxCharacters }), omittedBlocks: value.length > maxCharacters ? 1 : 0 };
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { categories?: unknown }).categories)) {
    return value.length <= maxCharacters
      ? { text: value, omittedBlocks: 0 }
      : { text: JSON.stringify({ content: truncate(value, Math.max(0, maxCharacters - 64)), truncated: true }), omittedBlocks: 1 };
  }

  const source = parsed as { categories: CatalogCategory[]; omittedBlockCount?: unknown };
  const categories = source.categories;
  const compactCategory = (category: CatalogCategory): CatalogCategory => ({
    name: category.name,
    categories: (category.categories ?? []).map(compactCategory),
    blocks: (category.blocks ?? []).map(({ state: _state, ...block }) => block),
  });
  const compactCategories = categories.map(compactCategory);
  const countBlocks = (items: CatalogCategory[]): number => items.reduce((total, category) =>
    total + (category.blocks?.length ?? 0) + countBlocks(category.categories ?? []), 0);
  const totalBlocks = countBlocks(compactCategories);
  const buildPrefix = (limit: number) => {
    let remaining = limit;
    const take = (items: CatalogCategory[]): CatalogCategory[] => items.map((category) => {
      const blocks = category.blocks ?? [];
      const keptBlocks = blocks.slice(0, remaining);
      remaining -= keptBlocks.length;
      return { name: category.name, blocks: keptBlocks, categories: take(category.categories ?? []) };
    });
    const keptCategories = take(compactCategories);
    const previouslyOmitted = typeof source.omittedBlockCount === "number" && source.omittedBlockCount > 0
      ? source.omittedBlockCount
      : 0;
    const omittedBlocks = previouslyOmitted + totalBlocks - limit;
    return {
      text: JSON.stringify(omittedBlocks ? { categories: keptCategories, omittedBlockCount: omittedBlocks } : { categories: keptCategories }),
      omittedBlocks,
    };
  };

  let low = 0;
  let high = totalBlocks;
  let best = buildPrefix(0);
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = buildPrefix(middle);
    if (candidate.text.length <= maxCharacters) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

function snapshotText(snapshot: Record<string, unknown>): string {
  const compact = { ...snapshot };
  return truncate(JSON.stringify(compact), 12_000);
}

function historyMessages(history: AgentConversationTurn[]): AiChatMessage[] {
  // Fill from the newest turn backwards so the budget never drops the most recent context.
  const selected: Array<{ user: string; assistant: string }> = [];
  let characters = 0;
  for (let index = history.length - 1; index >= 0 && selected.length < maxContextHistoryTurns; index -= 1) {
    const user = truncate(history[index].user, maxContextHistoryMessageCharacters);
    const assistant = truncate(history[index].assistant, maxContextHistoryMessageCharacters);
    const turnCharacters = user.length + assistant.length;
    if (selected.length && characters + turnCharacters > maxContextHistoryCharacters) break;
    selected.unshift({ user, assistant });
    characters += turnCharacters;
  }
  return selected.flatMap((turn) => [
    { role: "user" as const, content: turn.user },
    { role: "assistant" as const, content: turn.assistant },
  ]);
}

export function createAgentRequestContext(input: AgentRequestContextInput): AgentRequestContext {
  return input;
}

export function buildAgentRequestMessages(context: AgentRequestContext): AiChatMessage[] {
  const messages: AiChatMessage[] = [
    { role: "system", content: context.system },
    ...historyMessages(context.history),
    {
      role: "user",
      content: `用户任务：\n${context.prompt.trim()}\n\n当前工程快照：\n${snapshotText(context.snapshot)}\n\n${context.memory}`,
    },
  ];
  if (context.blockCatalog?.trim()) {
    const baseCharacters = messages.reduce((total, message) => total + message.content.length, 0);
    const catalogBudget = Math.min(maxBlockCatalogCharacters, Math.max(0, maxInitialRequestCharacters - baseCharacters - 512));
    if (catalogBudget < 256) return messages;
    const catalog = compactTaskBlockDirectory(context.blockCatalog.trim(), catalogBudget) ?? compactBlockCatalog(context.blockCatalog.trim(), catalogBudget);
    if (!catalog?.text) return messages;
    const notice = catalog.omittedBlocks
      ? `积木目录受本轮请求长度限制，仅附带部分积木候选；还有 ${catalog.omittedBlocks} 个积木未展开。候选已带字段与输入契约，可直接构建 apply_block_plan；缺少的类型再用 search_blocks 补齐，并用 get_block_templates 读取缺失契约。`
      : "以下积木目录已带字段与输入契约，可直接据此构建 apply_block_plan；只有契约缺失或为空的类型才调用 get_block_templates。";
    messages.push({ role: "user", content: `[Block catalog]\n${catalog.text}\n\n${notice}` });
  }
  return messages;
}

export function appendAgentTurn(messages: AiChatMessage[], turn: AiChatMessage[]): AiChatMessage[] {
  const next = [...messages, ...turn];
  if (JSON.stringify(next).length <= maxAgentToolHistoryCharacters) return next;

  let removedRounds = 0;
  const previousSummaryIndex = next.findIndex((message) => message.role === "user" && message.content.startsWith(compactedToolHistoryPrefix));
  let compactedEvidence = previousSummaryIndex >= 0
    ? next.splice(previousSummaryIndex, 1)[0].content.slice(compactedToolHistoryPrefix.length)
    : "";
  while (JSON.stringify(next).length > maxAgentToolHistoryCharacters) {
    let start = -1;
    let end = -1;
    for (let index = 0; index < next.length; index += 1) {
      const message = next[index];
      if (message.role !== "assistant" || !message.toolCalls?.length) continue;
      let candidateEnd = index + 1;
      while (candidateEnd < next.length && next[candidateEnd].role === "tool") candidateEnd += 1;
      if (candidateEnd < next.length) {
        start = index;
        end = candidateEnd;
        break;
      }
    }
    if (start < 0 || end < 0) break;
    compactedEvidence = mergeCompactedToolEvidence(compactedEvidence, summarizeToolRound(next.slice(start, end)));
    next.splice(start, end - start);
    removedRounds += 1;
  }

  if (!removedRounds) {
    if (compactedEvidence) next.splice(previousSummaryIndex < 0 ? 1 : Math.min(previousSummaryIndex, next.length), 0, { role: "user", content: `${compactedToolHistoryPrefix}${compactedEvidence}` });
    return next;
  }
  next.splice(1, 0, { role: "user", content: `${compactedToolHistoryPrefix}${compactedEvidence || `已压缩 ${removedRounds} 轮工具历史。`}` });
  return next;
}

function summarizeToolRound(round: AiChatMessage[]): string {
  const assistant = round.find((message) => message.role === "assistant" && message.toolCalls?.length);
  if (!assistant?.toolCalls?.length) return "";
  const summaries = assistant.toolCalls.map((call) => {
    const result = round.find((message) => message.role === "tool" && message.toolCallId === call.id);
    let content = result?.content || "工具没有返回内容。";
    let structured = false;
    try {
      const parsed: unknown = JSON.parse(content);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        structured = true;
        content = compactAgentToolResult(call.function.name, parsed as Record<string, unknown>);
        if (call.function.name === "get_task_block_directory") {
          content = compactTaskBlockDirectory(content, 4_000)?.text || content;
        } else if (call.function.name === "get_block_templates" && content.length > 4_000) {
          const templates = (JSON.parse(content) as { templates?: unknown[] }).templates || [];
          content = JSON.stringify({ templates: templates.slice(0, 12), omittedTemplateCount: Math.max(0, templates.length - 12) });
        }
      }
    } catch {
      // Preserve a bounded plain-text diagnostic when the tool result is not JSON.
    }
    if (!structured && content.length > 1_200) content = "非结构化工具输出过长，已省略正文。";
    const boundedContent = content.length > 4_000 ? `${content.slice(0, 4_000)}\n[工具结果摘要已截断]` : content;
    return `- ${call.function.name}(${call.function.arguments.slice(0, 300)}): ${boundedContent}`;
  });
  return summaries.join("\n");
}

function mergeCompactedToolEvidence(previous: string, next: string): string {
  const combined = [previous.trim(), next.trim()].filter(Boolean).join("\n");
  return combined.length > maxCompactedToolHistoryCharacters
    ? `[较早的工具证据已省略]\n${combined.slice(-maxCompactedToolHistoryCharacters + 30)}`
    : combined;
}

export function compactAgentAssistantMessage(content: string): string {
  return truncate(content.trim(), 1_200);
}

function compactResultValue(value: unknown, key = "", stringLimit = 2_000, arrayLimit = 40): unknown {
  if (key === "__codeChange") return undefined;
  if (typeof value === "string") return truncate(value, key === "code" ? stringLimit * 3 : stringLimit);
  if (Array.isArray(value)) return value.slice(0, arrayLimit).map((item) => compactResultValue(item, "", stringLimit, arrayLimit));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([entryKey, entryValue]) => [entryKey, compactResultValue(entryValue, entryKey, stringLimit, arrayLimit)] as const)
    .filter(([, entryValue]) => entryValue !== undefined));
}

function boundedResultJson(result: Record<string, unknown>, max = 6_000): string {
  for (const [stringLimit, arrayLimit] of [[2_000, 40], [1_000, 20], [500, 10], [200, 5]] as const) {
    const serialized = JSON.stringify(compactResultValue(result, "", stringLimit, arrayLimit));
    if (serialized.length <= max) return serialized;
  }
  return JSON.stringify({ message: "工具结果过大，已省略详细内容", truncated: true });
}

export function compactAgentToolResult(_toolName: string, result: Record<string, unknown>): string {
  try {
    if (_toolName === "read_plugin_draft_file" || _toolName === "read_plugin_guide") return JSON.stringify(result);
    if (_toolName === "get_task_block_directory") {
      const compact = compactTaskBlockDirectory(JSON.stringify(result), 6_000);
      if (compact) return compact.text;
    }
    if (_toolName === "get_block_templates") {
      const templates = Array.isArray(result.templates) ? result.templates.map((template) => {
        if (!template || typeof template !== "object" || Array.isArray(template)) return template;
        const { state: _state, ...contract } = template as Record<string, unknown>;
        const fields = Array.isArray(contract.fields) ? contract.fields.map((field) => {
          if (!field || typeof field !== "object" || Array.isArray(field)) return field;
          const item = field as Record<string, unknown>;
          return { ...item, ...(Array.isArray(item.options) ? { options: item.options.slice(0, 20) } : {}) };
        }) : [];
        return { ...contract, fields };
      }) : [];
      return JSON.stringify({ templates });
    }
    if (_toolName === "apply_block_plan") {
      const compact = Object.fromEntries([
        ["ok", result.ok],
        ["changed", result.changed],
        ["blockCount", result.blockCount],
        ["changedBlockIds", result.changedBlockIds],
        ["refIds", result.refIds],
        ["issues", result.issues],
        ["contracts", result.contracts],
      ].filter(([, value]) => value !== undefined));
      return boundedResultJson(compact, result.contracts ? 8_000 : 2_000);
    }
    return boundedResultJson(result);
  } catch {
    return JSON.stringify({ ok: false, error: "工具返回结果无法序列化" });
  }
}
