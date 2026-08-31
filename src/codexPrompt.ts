import type { AgentConversationTurn } from "./agentV2/types";

type CodexPromptInput = {
  prompt: string;
  history: AgentConversationTurn[];
  snapshot: Record<string, unknown>;
};

const maxSnapshotCharacters = 10_000;
const maxCodeCharacters = 8_000;
const maxHistoryCharacters = 6_000;

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
  let result = "";
  for (const turn of history.slice(-4)) {
    const item = `用户：${truncate(turn.user, 900)}\n助手：${truncate(turn.assistant, 900)}\n\n`;
    if (result.length + item.length > maxHistoryCharacters) break;
    result += item;
  }
  return result.trim();
}

export function buildCodexPrompt(input: CodexPromptInput, includeHistory: boolean): string {
  const history = includeHistory ? compactHistory(input.history) : "";
  return [
    history ? `最近对话：\n${history}` : "",
    `当前工程状态：\n${compactSnapshot(input.snapshot)}`,
    `用户任务：\n${input.prompt.trim()}`,
  ].filter(Boolean).join("\n\n");
}
