import { getAiProviderProtocol, type AiModelConfig, type AiProviderProtocol } from "./aiConfig";

export type AiProtocolDecisionSource = "manual" | "cache" | "probe";

export type AiProtocolDecision = {
  protocol: AiProviderProtocol;
  source: AiProtocolDecisionSource;
};

export function selectAiProviderProtocol(
  config: AiModelConfig,
  cachedProtocol: AiProviderProtocol = getAiProviderProtocol(config),
): AiProtocolDecision {
  if (config.protocol === "chat-completions" || config.protocol === "responses") {
    return { protocol: config.protocol, source: "manual" };
  }
  if (cachedProtocol === "chat-completions" || cachedProtocol === "responses") {
    return { protocol: cachedProtocol, source: "cache" };
  }
  return { protocol: "unknown", source: "probe" };
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: unknown; cause?: unknown };
  if (typeof candidate.status === "number") return candidate.status;
  return errorStatus(candidate.cause);
}

function errorText(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) return `${error.message} ${errorText(error.cause)}`;
  if (typeof error === "object") {
    const candidate = error as { message?: unknown; error?: unknown; cause?: unknown };
    return `${typeof candidate.message === "string" ? candidate.message : ""} ${typeof candidate.error === "string" ? candidate.error : ""} ${errorText(candidate.cause)}`;
  }
  return String(error);
}

/** Return true only when the Responses endpoint itself is unavailable. */
export function isResponsesProtocolUnsupported(error: unknown): boolean {
  const status = errorStatus(error);
  if (status === 404 || status === 405) return true;

  const detail = errorText(error).toLowerCase();
  if (/\b(?:404|405)\b/.test(detail)) return true;
  const mentionsResponses = /(?:responses?|\/responses)/i.test(detail);
  if (!mentionsResponses) return false;
  return /(?:not\s+supported|unsupported|not\s+implemented|unknown\s+endpoint|unrecognized\s+endpoint|method\s+not\s+allowed|not\s+found|invalid\s+endpoint)/i.test(detail);
}
