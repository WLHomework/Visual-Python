import { applyExactCodeEdits } from "./codeChanges";
import type { AiCodeEdit } from "./types";

const streamingCodeTools = new Set(["replace_code", "edit_code"]);

export function isStreamingCodeTool(name?: string): boolean {
  return Boolean(name && streamingCodeTools.has(name));
}

function unescapeJsonFragment(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, "\"")
      .replace(/\\\\/g, "\\");
  }
}

export function extractJsonString(source: string, key: string): string | null {
  const pattern = new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:\\s*"`);
  const match = pattern.exec(source);
  if (!match) return null;
  let index = match.index + match[0].length;
  let raw = "";
  while (index < source.length) {
    const character = source[index];
    if (character === "\\" && index + 1 < source.length) {
      raw += source.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (character === "\"") return unescapeJsonFragment(raw);
    raw += character;
    index += 1;
  }
  return unescapeJsonFragment(raw);
}

function extractCompleteJsonObjects(source: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (character === "\\" && index + 1 < source.length) index += 1;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") {
      inString = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(source.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return objects;
}

function parseEditObject(value: string): AiCodeEdit | null {
  try {
    const parsed = JSON.parse(value) as Partial<AiCodeEdit>;
    if (typeof parsed.oldText !== "string" || !parsed.oldText || typeof parsed.newText !== "string") return null;
    return { oldText: parsed.oldText, newText: parsed.newText, replaceAll: parsed.replaceAll === true };
  } catch {
    const oldText = extractJsonString(value, "oldText");
    const newText = extractJsonString(value, "newText");
    if (!oldText || newText === null) return null;
    return { oldText, newText, replaceAll: /"replaceAll"\s*:\s*true/.test(value) };
  }
}

export function previewCodeFromStreamingTool(toolName: string, partialArguments: string, baseline: string): string | null {
  if (toolName === "replace_code") {
    const code = extractJsonString(partialArguments, "code");
    return code === null ? null : code;
  }
  if (toolName !== "edit_code") return null;
  const objects = extractCompleteJsonObjects(partialArguments);
  const edits = objects.flatMap((item) => {
    const edit = parseEditObject(item);
    return edit ? [edit] : [];
  });
  const lastObjectStart = partialArguments.lastIndexOf("{");
  if (lastObjectStart >= 0 && !objects.some((item) => partialArguments.lastIndexOf(item) === lastObjectStart)) {
    const trailing = parseEditObject(partialArguments.slice(lastObjectStart));
    if (trailing) edits.push(trailing);
  }
  if (!edits.length) return null;
  try {
    return applyExactCodeEdits(baseline, edits);
  } catch {
    if (edits.length === 1) return null;
    try {
      return applyExactCodeEdits(baseline, edits.slice(0, -1));
    } catch {
      return null;
    }
  }
}
