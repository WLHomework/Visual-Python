import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type AiModelConfig = {
  baseUrl: string;
  model: string;
};

export type AiAgentPermissionMode = "auto" | "confirm";

export type AiChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: AiChatToolCall[];
};

export type AiChatToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type AiChatToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type AiChatCompletionResult = {
  content: string;
  toolCalls: AiChatToolCall[];
  model: string;
  truncated?: boolean;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
};

type AiChatStreamEvent = {
  requestId: string;
  channel?: "content" | "reasoning" | "toolArguments";
  delta: string;
  toolIndex?: number;
  toolName?: string;
};

export type AiToolCallStreamDelta = {
  index: number;
  name?: string;
  delta: string;
};

export type AiChatToolChoice = "auto" | "required" | { type: "function"; function: { name: string } };

export type AiCapabilityStatus = "unknown" | "supported" | "unsupported";

export type AiModelCapabilities = {
  functionCalling: AiCapabilityStatus;
  toolChoice: AiCapabilityStatus;
};

const storageKey = "visual-python:ai-model-config";
const permissionModeStorageKey = "visual-python:ai-agent-permission-mode";
const capabilityStorageKey = "visual-python:ai-model-capabilities";
const capabilityTtlMs = 7 * 24 * 60 * 60 * 1000;
const defaultAiModelCapabilities: AiModelCapabilities = { functionCalling: "unknown", toolChoice: "unknown" };

export const defaultAiModelConfig: AiModelConfig = {
  baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  model: "qwen3.7-flash",
};

export function normalizeAiModelConfig(value: unknown): AiModelConfig {
  const candidate = value && typeof value === "object" ? value as Partial<AiModelConfig> : {};
  const baseUrl = typeof candidate.baseUrl === "string" ? candidate.baseUrl.trim().replace(/\/+$/, "").slice(0, 1000) : "";
  const model = typeof candidate.model === "string" ? candidate.model.trim().slice(0, 200) : "";
  return {
    baseUrl: baseUrl || defaultAiModelConfig.baseUrl,
    model: model || defaultAiModelConfig.model,
  };
}

export function getAiModelConfig(): AiModelConfig {
  try {
    return normalizeAiModelConfig(JSON.parse(localStorage.getItem(storageKey) || "null"));
  } catch {
    return { ...defaultAiModelConfig };
  }
}

export function saveAiModelConfig(config: AiModelConfig): AiModelConfig {
  const normalized = normalizeAiModelConfig(config);
  localStorage.setItem(storageKey, JSON.stringify(normalized));
  return normalized;
}

function aiModelCapabilityKey(config: AiModelConfig): string {
  const normalized = normalizeAiModelConfig(config);
  return `${normalized.baseUrl}\n${normalized.model}`;
}

type StoredAiModelCapabilities = AiModelCapabilities & { updatedAt: number };

export function getAiModelCapabilities(config: AiModelConfig = getAiModelConfig()): AiModelCapabilities {
  try {
    const entries = JSON.parse(localStorage.getItem(capabilityStorageKey) || "{}") as Record<string, StoredAiModelCapabilities>;
    const entry = entries[aiModelCapabilityKey(config)];
    if (!entry || !Number.isFinite(entry.updatedAt) || Date.now() - entry.updatedAt > capabilityTtlMs) return { ...defaultAiModelCapabilities };
    return {
      functionCalling: ["unknown", "supported", "unsupported"].includes(entry.functionCalling) ? entry.functionCalling : "unknown",
      toolChoice: ["unknown", "supported", "unsupported"].includes(entry.toolChoice) ? entry.toolChoice : "unknown",
    };
  } catch {
    return { ...defaultAiModelCapabilities };
  }
}

export function updateAiModelCapabilities(update: Partial<AiModelCapabilities>, config: AiModelConfig = getAiModelConfig()): AiModelCapabilities {
  const current = getAiModelCapabilities(config);
  const next: AiModelCapabilities = {
    functionCalling: update.functionCalling || current.functionCalling,
    toolChoice: update.toolChoice || current.toolChoice,
  };
  try {
    const stored = JSON.parse(localStorage.getItem(capabilityStorageKey) || "{}") as Record<string, StoredAiModelCapabilities>;
    const entries = Object.fromEntries(Object.entries(stored)
      .filter(([, value]) => value && Number.isFinite(value.updatedAt) && Date.now() - value.updatedAt <= capabilityTtlMs)
      .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
      .slice(0, 31));
    entries[aiModelCapabilityKey(config)] = { ...next, updatedAt: Date.now() };
    localStorage.setItem(capabilityStorageKey, JSON.stringify(entries));
  } catch {
    // Capability caching is an optimization; an unavailable storage must not block AI requests.
  }
  return next;
}

export function getAiAgentPermissionMode(): AiAgentPermissionMode {
  try {
    return localStorage.getItem(permissionModeStorageKey) === "confirm" ? "confirm" : "auto";
  } catch {
    return "auto";
  }
}

export function saveAiAgentPermissionMode(mode: AiAgentPermissionMode): AiAgentPermissionMode {
  const normalized = mode === "confirm" ? "confirm" : "auto";
  localStorage.setItem(permissionModeStorageKey, normalized);
  return normalized;
}

export function hasAiApiKey(baseUrl: string): Promise<boolean> {
  return invoke<boolean>("has_ai_api_key", { baseUrl });
}

export function clearAiApiKey(baseUrl: string): Promise<void> {
  return invoke("clear_ai_api_key", { baseUrl });
}

export function testAiConnection(config: AiModelConfig, apiKey: string): Promise<AiChatCompletionResult> {
  return invoke<AiChatCompletionResult>("test_ai_connection", {
    config: normalizeAiModelConfig(config),
    apiKey: apiKey.trim() || null,
  });
}

export function requestAiChat(messages: AiChatMessage[]): Promise<AiChatCompletionResult> {
  return invoke<AiChatCompletionResult>("ai_chat_completion", {
    config: getAiModelConfig(),
    messages,
    tools: null,
  });
}

let streamRequestSequence = 1;

export async function streamAiChat(
  messages: AiChatMessage[],
  onDelta: (delta: string) => void,
  options: { maxTokens?: number; signal?: AbortSignal; tools?: AiChatToolDefinition[]; toolChoice?: AiChatToolChoice; omitToolChoice?: boolean; onReasoningDelta?: (delta: string) => void; onToolCallDelta?: (delta: AiToolCallStreamDelta) => void } = {},
): Promise<AiChatCompletionResult> {
  const requestId = `${Date.now().toString(36)}-${streamRequestSequence++}`;
  if (options.signal?.aborted) throw new Error("已停止生成");
  const unlisten = await listen<AiChatStreamEvent>("ai-chat-stream", (event) => {
    if (event.payload.requestId !== requestId || !event.payload.delta) return;
    if (event.payload.channel === "toolArguments") {
      options.onToolCallDelta?.({ index: event.payload.toolIndex ?? 0, name: event.payload.toolName, delta: event.payload.delta });
      return;
    }
    if (event.payload.channel === "reasoning") {
      options.onReasoningDelta?.(event.payload.delta);
      return;
    }
    onDelta(event.payload.delta);
  });
  const cancel = () => { void invoke("cancel_ai_chat_stream", { requestId }).catch(() => undefined); };
  options.signal?.addEventListener("abort", cancel, { once: true });
  try {
    const result = await invoke<AiChatCompletionResult>("ai_chat_completion_stream", {
      requestId,
      config: getAiModelConfig(),
      messages,
      tools: options.tools ?? null,
      toolChoice: options.toolChoice ?? null,
      omitToolChoice: options.omitToolChoice ?? false,
      maxTokens: options.maxTokens ?? null,
    });
    if (options.signal?.aborted) throw new Error("已停止生成");
    return result;
  } catch (error) {
    if (options.signal?.aborted) throw new Error("已停止生成");
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", cancel);
    unlisten();
  }
}
