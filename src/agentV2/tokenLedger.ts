import type { AiChatMessage, AiChatToolDefinition } from "../aiConfig";
import type { AgentTokenUsage } from "./types";

export function createAgentTokenUsage(): AgentTokenUsage {
  return {
    prompt: 0,
    completion: 0,
    total: 0,
    requests: 0,
    rounds: 0,
    inputCharacters: 0,
    toolSchemaCharacters: 0,
    toolResultCharacters: 0,
    cached: 0,
    uncachedPrompt: 0,
    cacheCreation: 0,
    cacheReportedRequests: 0,
  };
}

export function recordAgentRequest(usage: AgentTokenUsage, messages: AiChatMessage[], tools: AiChatToolDefinition[], round: number): void {
  usage.rounds = Math.max(usage.rounds, round);
  usage.inputCharacters += JSON.stringify(messages).length;
  usage.toolSchemaCharacters += JSON.stringify(tools).length;
}

export function recordAgentToolResult(usage: AgentTokenUsage, content: string): void {
  usage.toolResultCharacters += content.length;
}

export function mergeProviderTokenUsage(usage: AgentTokenUsage, result: { promptTokens?: number; completionTokens?: number; totalTokens?: number; cachedTokens?: number; cacheCreationTokens?: number }): void {
  const prompt = Number.isFinite(result.promptTokens) ? Number(result.promptTokens) : 0;
  const completion = Number.isFinite(result.completionTokens) ? Number(result.completionTokens) : 0;
  const total = Number.isFinite(result.totalTokens) ? Number(result.totalTokens) : prompt + completion;
  usage.prompt += prompt;
  usage.completion += completion;
  usage.total += total;
  usage.requests += 1;
  if (Number.isFinite(result.cachedTokens)) {
    const cached = Math.max(0, Math.min(prompt, Number(result.cachedTokens)));
    usage.cached += cached;
    usage.cacheReportedRequests += 1;
  }
  usage.uncachedPrompt = Math.max(0, usage.prompt - usage.cached);
  usage.cacheHitRate = usage.prompt > 0 ? usage.cached / usage.prompt : 0;
  if (Number.isFinite(result.cacheCreationTokens)) usage.cacheCreation += Math.max(0, Number(result.cacheCreationTokens));
}
