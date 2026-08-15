import type { AiChatMessage } from "../aiConfig";
import type { AgentConversationTurn } from "./types";

type AgentRequestContextInput = {
  system: string;
  prompt: string;
  history: AgentConversationTurn[];
  snapshot: Record<string, unknown>;
  memory: string;
};

export type AgentRequestContext = AgentRequestContextInput;

const truncate = (value: string, max: number) => value.length > max ? `${value.slice(0, max)}\n[内容已截断]` : value;
const maxAgentToolHistoryCharacters = 32_000;

function snapshotText(snapshot: Record<string, unknown>): string {
  const compact = { ...snapshot };
  return truncate(JSON.stringify(compact), 12_000);
}

function historyMessages(history: AgentConversationTurn[]): AiChatMessage[] {
  return history.slice(-4).flatMap((turn) => [
    { role: "user" as const, content: truncate(turn.user, 1_500) },
    { role: "assistant" as const, content: truncate(turn.assistant, 1_500) },
  ]);
}

export function createAgentRequestContext(input: AgentRequestContextInput): AgentRequestContext {
  return input;
}

export function buildAgentRequestMessages(context: AgentRequestContext): AiChatMessage[] {
  return [
    { role: "system", content: context.system },
    ...historyMessages(context.history),
    {
      role: "user",
      content: `用户任务：\n${context.prompt.trim()}\n\n当前工程快照：\n${snapshotText(context.snapshot)}\n\n${context.memory}`,
    },
  ];
}

export function appendAgentTurn(messages: AiChatMessage[], turn: AiChatMessage[]): AiChatMessage[] {
  const next = [...messages, ...turn];
  if (JSON.stringify(next).length <= maxAgentToolHistoryCharacters) return next;

  let removedRounds = 0;
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
    next.splice(start, end - start);
    removedRounds += 1;
  }

  if (!removedRounds) return next;
  next.push({ role: "user", content: `历史工具回合已压缩（${removedRounds} 轮）。当前工作区状态和最近一轮工具结果优先；如需旧细节，请重新读取当前状态。` });
  return next;
}

export function compactAgentAssistantMessage(content: string): string {
  return truncate(content.trim(), 1_200);
}

function compactResultValue(value: unknown, key = ""): unknown {
  if (key === "__codeChange") return undefined;
  if (typeof value === "string") return truncate(value, key === "code" ? 6_000 : 2_000);
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => compactResultValue(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([entryKey, entryValue]) => [entryKey, compactResultValue(entryValue, entryKey)] as const)
    .filter(([, entryValue]) => entryValue !== undefined));
}

export function compactAgentToolResult(_toolName: string, result: Record<string, unknown>): string {
  try {
    if (_toolName === "add_workspace_block") {
      const compact = Object.fromEntries([
        ["ok", result.ok],
        ["changed", result.changed],
        ["block", result.block],
        ["blockCount", result.blockCount],
        ["error", result.error],
        ["detail", result.detail],
      ].filter(([, value]) => value !== undefined));
      return truncate(JSON.stringify(compact), 2_000);
    }
    return truncate(JSON.stringify(compactResultValue(result)), 6_000);
  } catch {
    return JSON.stringify({ ok: false, error: "工具返回结果无法序列化" });
  }
}
