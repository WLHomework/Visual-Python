import { runAgentCore } from "./agentCore";
import { getAiModelConfig, saveAiProviderProtocol } from "./aiConfig";
import { isResponsesProtocolUnsupported, selectAiProviderProtocol } from "./aiProtocol";
import type { AgentRunResult, RunVisualPythonAgentArgs } from "./agentV2/types";
import { CodexAgentUnavailableError, runCodexVisualPythonAgent } from "./codexAgent";

export type AgentRunner = (args: RunVisualPythonAgentArgs) => Promise<AgentRunResult>;

export type RunAgentWithFallbackOptions = {
  codex?: AgentRunner;
  chatCompletions?: AgentRunner;
  onFallback?: (error: CodexAgentUnavailableError) => void;
};

/** Use App Server for Responses and the shared Agent Core for Chat Completions. */
export async function runAgentWithProtocolFallback(
  args: RunVisualPythonAgentArgs,
  options: RunAgentWithFallbackOptions = {},
): Promise<AgentRunResult> {
  const codex = options.codex || runCodexVisualPythonAgent;
  const chatCompletions = options.chatCompletions || runAgentCore;
  const config = getAiModelConfig();
  if (selectAiProviderProtocol(config).protocol === "chat-completions") return chatCompletions(args);
  try {
    const result = await codex(args);
    saveAiProviderProtocol("responses", config);
    return result;
  } catch (error) {
    if (!(error instanceof CodexAgentUnavailableError) || args.signal.aborted) throw error;
    const responsesUnsupported = isResponsesProtocolUnsupported(error);
    if (!responsesUnsupported && !error.allowProtocolFallback) throw error;
    if (responsesUnsupported) saveAiProviderProtocol("chat-completions", config);
    options.onFallback?.(error);
    return chatCompletions(args);
  }
}
