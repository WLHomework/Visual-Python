import { streamAiChat, type AiChatCompletionResult, type AiChatMessage, type AiChatToolChoice, type AiChatToolDefinition, type AiReasoningEffort, type AiToolCallStreamDelta } from "./aiConfig";
import type { AgentModelEvent } from "./agentEvents";

export type AgentModelTurnOptions = {
  maxTokens: number;
  reasoningEffort: AiReasoningEffort;
  signal: AbortSignal;
  tools: AiChatToolDefinition[];
  toolChoice?: AiChatToolChoice;
  onEvent: (event: AgentModelEvent) => void;
};

export type AgentModelTransport = {
  runTurn: (messages: AiChatMessage[], options: AgentModelTurnOptions) => Promise<AiChatCompletionResult>;
};

/** Protocol adapter for OpenAI-compatible Chat Completions endpoints. */
export class ChatCompletionsTransport implements AgentModelTransport {
  async runTurn(messages: AiChatMessage[], options: AgentModelTurnOptions): Promise<AiChatCompletionResult> {
    try {
      const result = await streamAiChat(messages, (delta) => options.onEvent({ type: "textDelta", delta }), {
        maxTokens: options.maxTokens,
        reasoningEffort: options.reasoningEffort,
        signal: options.signal,
        tools: options.tools,
        toolChoice: options.toolChoice,
        onReasoningDelta: (delta) => options.onEvent({ type: "reasoningDelta", delta }),
        onToolCallDelta: (delta: AiToolCallStreamDelta) => options.onEvent({ type: "toolCallDelta", ...delta }),
      });
      if (result.totalTokens !== undefined || result.promptTokens !== undefined || result.completionTokens !== undefined) {
        options.onEvent({
          type: "tokenUsage",
          inputTokens: result.promptTokens || 0,
          cachedInputTokens: result.cachedTokens || 0,
          outputTokens: result.completionTokens || 0,
          totalTokens: result.totalTokens || 0,
          ...(result.cacheCreationTokens === undefined ? {} : { cacheCreationTokens: result.cacheCreationTokens }),
        });
      }
      options.onEvent({ type: "turnCompleted", status: "completed" });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.onEvent(options.signal.aborted
        ? { type: "interrupted", message: "任务已停止" }
        : { type: "error", message });
      throw error;
    }
  }
}

export const chatCompletionsTransport = new ChatCompletionsTransport();
