import type { AiFollowUpSuggestion } from "./types";

const followUpSuggestionsMarker = /<!--\s*visual-python-followups\s*:\s*([\s\S]*?)\s*-->/gi;
const incompleteFollowUpMarker = /\n?<!--\s*visual-python-followups\b[\s\S]*$/i;

export function stripAgentFollowUpMarkup(content: string): string {
  return content.replace(followUpSuggestionsMarker, "").replace(incompleteFollowUpMarker, "").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseAgentFollowUpSuggestions(content: string): { content: string; suggestions: AiFollowUpSuggestion[] } {
  const suggestions: AiFollowUpSuggestion[] = [];
  const seen = new Set<string>();
  const matches = content.matchAll(followUpSuggestionsMarker);
  for (const match of matches) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      continue;
    }
    for (const item of Array.isArray(parsed) ? parsed : []) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label.replace(/\s+/g, " ").trim().slice(0, 80) : "";
      const prompt = typeof record.prompt === "string" ? record.prompt.replace(/\s+/g, " ").trim().slice(0, 400) : "";
      if (!label || !prompt || seen.has(prompt)) continue;
      seen.add(prompt);
      suggestions.push({ label, prompt });
      if (suggestions.length >= 3) break;
    }
    if (suggestions.length >= 3) break;
  }
  return { content: stripAgentFollowUpMarkup(content), suggestions };
}
