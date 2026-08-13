import type { AiCodeEdit } from "./types";

export function restoreMissingBaseIndent(oldText: string, newText: string): string {
  const oldFirstContent = oldText.split("\n").find((line) => line.trim());
  const newFirstContent = newText.split("\n").find((line) => line.trim());
  if (!oldFirstContent || !newFirstContent) return newText;
  const oldIndent = oldFirstContent.match(/^\s*/)?.[0] ?? "";
  const newIndent = newFirstContent.match(/^\s*/)?.[0] ?? "";
  if (!oldIndent || newIndent) return newText;
  return newText.split("\n").map((line) => line.trim() ? `${oldIndent}${line}` : line).join("\n");
}

export function applyExactCodeEdits(source: string, edits: AiCodeEdit[]): string {
  if (!edits.length) throw new Error("edits 不能为空");
  let result = source;
  for (const [index, edit] of edits.entries()) {
    if (!edit.oldText) throw new Error(`第 ${index + 1} 个编辑的 oldText 不能为空`);
    const lineEnding = result.includes("\r\n") ? "\r\n" : "\n";
    const normalizedResult = result.replace(/\r\n?/g, "\n");
    const normalizedOldText = edit.oldText.replace(/\r\n?/g, "\n");
    const normalizedNewText = edit.newText.replace(/\r\n?/g, "\n");
    const occurrences = normalizedResult.split(normalizedOldText).length - 1;
    if (!occurrences) throw new Error(`第 ${index + 1} 个编辑找不到 oldText，请重新读取当前代码`);
    if (edit.replaceAll !== true && occurrences !== 1) throw new Error(`第 ${index + 1} 个编辑匹配到 ${occurrences} 处，请提供更完整的 oldText 或设置 replaceAll`);
    const newText = restoreMissingBaseIndent(normalizedOldText, normalizedNewText);
    const next = edit.replaceAll === true ? normalizedResult.split(normalizedOldText).join(newText) : normalizedResult.replace(normalizedOldText, newText);
    result = lineEnding === "\r\n" ? next.replace(/\n/g, "\r\n") : next;
  }
  return result;
}

export function createCodeChangePreview(before: string, after: string): string {
  if (before === after) return "没有代码变化";
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix += 1;
  const removed = oldLines.slice(prefix, oldLines.length - suffix);
  const added = newLines.slice(prefix, newLines.length - suffix);
  const result = [`@@ 第 ${prefix + 1} 行 @@`, ...removed.map((line) => `- ${line}`), ...added.map((line) => `+ ${line}`)].join("\n");
  return result.length > 12_000 ? `${result.slice(0, 12_000)}\n...` : result;
}
