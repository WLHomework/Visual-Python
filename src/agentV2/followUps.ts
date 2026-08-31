import type { AiFollowUpSuggestion } from "./types";

const followUpSuggestionsMarker = /<!--\s*visual-python-followups\s*:\s*([\s\S]*?)\s*-->/i;

export function parseAgentFollowUpSuggestions(content: string): { content: string; suggestions: AiFollowUpSuggestion[] } {
  const match = content.match(followUpSuggestionsMarker);
  if (!match) return { content: content.trim(), suggestions: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return { content: content.replace(match[0], "").trim(), suggestions: [] };
  }
  const seen = new Set<string>();
  const suggestions = (Array.isArray(parsed) ? parsed : []).flatMap((item): AiFollowUpSuggestion[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    const prompt = typeof record.prompt === "string" ? record.prompt.replace(/\s+/g, " ").trim().slice(0, 400) : "";
    if (!label || !prompt || seen.has(prompt)) return [];
    seen.add(prompt);
    return [{ label, prompt }];
  }).slice(0, 3);
  return { content: content.replace(match[0], "").trim(), suggestions };
}
