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
  return [...messages, ...turn];
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
    return truncate(JSON.stringify(compactResultValue(result)), 6_000);
  } catch {
    return JSON.stringify({ ok: false, error: "工具返回结果无法序列化" });
  }
}
