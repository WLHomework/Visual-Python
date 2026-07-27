import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type AiModelConfig = {
  baseUrl: string;
  model: string;
};

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
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

type AiChatStreamEvent = {
  requestId: string;
  channel?: "content" | "toolArguments";
  delta: string;
  toolIndex?: number;
  toolName?: string;
};

export type AiToolCallStreamDelta = {
  index: number;
  name?: string;
  delta: string;
};

const storageKey = "visual-python:ai-model-config";

export const defaultAiModelConfig: AiModelConfig = {
  baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  model: "qwen-plus",
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
  options: { maxTokens?: number; signal?: AbortSignal; tools?: AiChatToolDefinition[]; onToolCallDelta?: (delta: AiToolCallStreamDelta) => void } = {},
): Promise<AiChatCompletionResult> {
  const requestId = `${Date.now().toString(36)}-${streamRequestSequence++}`;
  if (options.signal?.aborted) throw new Error("已停止生成");
  const unlisten = await listen<AiChatStreamEvent>("ai-chat-stream", (event) => {
    if (event.payload.requestId !== requestId || !event.payload.delta) return;
    if (event.payload.channel === "toolArguments") {
      options.onToolCallDelta?.({ index: event.payload.toolIndex ?? 0, name: event.payload.toolName, delta: event.payload.delta });
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
