import type { AgentConversationTurn } from "./agentV2/types";
import { compactBlockCatalogForPrompt } from "./agentV2/context";

type CodexPromptInput = {
  prompt: string;
  history: AgentConversationTurn[];
  snapshot: Record<string, unknown>;
  blockCatalog?: string;
};

const maxSnapshotCharacters = 10_000;
const maxCodeCharacters = 8_000;
const maxHandoffTurns = 12;
const maxHandoffTurnCharacters = 2_000;
const maxHandoffCharacters = 24_000;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}\n[内容已截断]` : value;
}

function compactSnapshot(snapshot: Record<string, unknown>): string {
  const project = snapshot.project && typeof snapshot.project === "object" && !Array.isArray(snapshot.project)
    ? snapshot.project as Record<string, unknown>
    : undefined;
  const compactProject = project ? {
    name: project.name,
    dirty: project.dirty,
    activeDocument: project.activeDocument,
    documentCount: project.documentCount,
  } : undefined;
  const compact = Object.fromEntries([
    ["workspaceMode", snapshot.workspaceMode],
    ["project", compactProject],
    ["lineCount", snapshot.lineCount],
    ["pythonEnvironment", snapshot.pythonEnvironment],
    ["running", snapshot.running],
    ["capabilities", snapshot.capabilities],
    ["plugins", snapshot.plugins],
    ["blockWorkspace", snapshot.blockWorkspace],
  ].filter(([, value]) => value !== undefined));
  if (typeof snapshot.code === "string") compact.code = truncate(snapshot.code, maxCodeCharacters);
  return truncate(JSON.stringify(compact), maxSnapshotCharacters);
}

function compactHistory(history: AgentConversationTurn[]): string {
  // Fill from the newest turn backwards so a tight budget never drops the most recent context.
  const selected: string[] = [];
  let characters = 0;
  for (let index = history.length - 1; index >= 0 && selected.length < maxHandoffTurns; index -= 1) {
    const turn = history[index];
    const item = `用户：${truncate(turn.user, maxHandoffTurnCharacters)}\n助手：${truncate(turn.assistant, maxHandoffTurnCharacters)}\n\n`;
    if (selected.length && characters + item.length > maxHandoffCharacters) break;
    selected.unshift(item);
    characters += item.length;
  }
  return selected.join("").trim();
}

export function buildCodexPrompt(input: CodexPromptInput, includeHistory: boolean): string {
  const history = includeHistory ? compactHistory(input.history) : "";
  const sections = [
    // includeHistory 只在服务端线程缺失（新会话或模型/供应商切换）时为真：
    // 明确告知模型上下文来自摘要而非完整线程，避免它假装记得全部细节。
    history
      ? `最近对话（注意：服务端线程已重置，以下是最近对话的摘要，仅用于衔接；如用户询问更早的细节，请如实说明只掌握摘要内容）：\n${history}`
      : "",
    `当前工程状态：\n${compactSnapshot(input.snapshot)}`,
    `用户任务：\n${input.prompt.trim()}`,
  ];
  // The server Thread owns the conversation history, but the host-owned
  // graphical catalog is task-scoped and must be refreshed for every turn.
  // Keeping these concerns separate prevents resumed threads from losing the
  // current workspace's block contracts without duplicating the full history.
  if (input.blockCatalog?.trim()) {
    const catalog = compactBlockCatalogForPrompt(input.blockCatalog.trim());
    if (catalog) sections.push(`[Graphical workspace block catalog]\n${catalog}\nUse get_block_templates only for the specific block types needed by this task.`);
  }
  return sections.filter(Boolean).join("\n\n");
}
