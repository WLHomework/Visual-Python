export type AgentModelEvent =
  | { type: "textDelta"; delta: string; threadId?: string; turnId?: string; itemId?: string }
  | { type: "reasoningDelta"; delta: string; threadId?: string; turnId?: string; itemId?: string }
  | { type: "toolCallDelta"; index: number; delta: string; name?: string; callId?: string }
  | { type: "tokenUsage"; inputTokens: number; cachedInputTokens: number; outputTokens: number; totalTokens: number; cacheCreationTokens?: number; threadId?: string; turnId?: string }
  | { type: "turnCompleted"; status: string; threadId?: string; turnId?: string; turn?: Record<string, unknown> }
  | { type: "error"; message: string; status?: number }
  | { type: "interrupted"; message: string; threadId?: string; turnId?: string };

export type AgentToolRequest = {
  requestId: string | number;
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
};

export function resolveAgentEventText(event: { title: string; markdown?: string }): string {
  return event.markdown?.trim() ? event.markdown : event.title;
}
