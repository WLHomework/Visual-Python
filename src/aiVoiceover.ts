import { createVoiceoverEndMarker, createVoiceoverMarker, parseVoiceoverMarker } from "./plugins/builtin/manim/voiceoverMarkers";

export type VoiceoverInspection = {
  valid: boolean;
  cueCount: number;
  synchronizedCount: number;
  issues: string[];
};

const fakeVoiceoverApiPattern = /\bself\.(?:add_voiceover|add_synchronized_voiceover)\s*\(/g;

export function countFakeVoiceoverApis(source: string): number {
  return [...source.matchAll(fakeVoiceoverApiPattern)].length;
}

function requireUnique(source: string, target: string, label: string) {
  if (!target) throw new Error(`${label}不能为空`);
  const count = source.split(target).length - 1;
  if (!count) throw new Error(`找不到${label}，请重新读取当前代码并逐字提供原文`);
  if (count !== 1) throw new Error(`${label}匹配到 ${count} 处，请提供更多上下文使其唯一`);
}

function validateText(text: string) {
  if (!text.trim()) throw new Error("配音文本不能为空");
  if (text.length > 2000) throw new Error("单段配音文本不能超过 2000 个字符");
}

function indentedMarker(marker: string, indent: string) {
  return `${indent}${marker}`;
}

export function insertStandaloneVoiceover(source: string, anchorText: string, text: string, roleId = "default", placement: "before" | "after" = "before"): string {
  requireUnique(source, anchorText, "anchorText");
  validateText(text);
  const indent = anchorText.match(/^\s*/)?.[0] ?? "";
  const marker = indentedMarker(createVoiceoverMarker("cue", JSON.stringify(text), text, roleId), indent);
  const replacement = placement === "after" ? `${anchorText}\n${marker}` : `${marker}\n${anchorText}`;
  return source.replace(anchorText, replacement);
}

export function insertSynchronizedVoiceover(source: string, targetText: string, text: string, roleId = "default"): string {
  requireUnique(source, targetText, "targetText");
  validateText(text);
  const indent = targetText.match(/^\s*/)?.[0] ?? "";
  const begin = indentedMarker(createVoiceoverMarker("begin", JSON.stringify(text), text, roleId), indent);
  const end = indentedMarker(createVoiceoverEndMarker(), indent);
  return source.replace(targetText, `${begin}\n${targetText}\n${end}`);
}

export function inspectVoiceovers(source: string, roleIds: Iterable<string>): VoiceoverInspection {
  const knownRoles = new Set(["default", ...roleIds]);
  const issues: string[] = [];
  const stack: number[] = [];
  let cueCount = 0;
  let synchronizedCount = 0;
  source.split("\n").forEach((line, index) => {
    if (/\bself\.(?:add_voiceover|add_synchronized_voiceover)\s*\(/.test(line)) {
      issues.push(`第 ${index + 1} 行调用了不存在的配音 Python 方法；请删除该调用并使用 AI 专用配音工具插入标记`);
    }
  });
  source.split("\n").forEach((line, index) => {
    const lineNumber = index + 1;
    const marker = parseVoiceoverMarker(line);
    if (!marker) {
      if (line.includes("visual-python-tts:")) issues.push(`第 ${lineNumber} 行的配音标记无效`);
      return;
    }
    if (marker.kind === "end") {
      if (!stack.length) issues.push(`第 ${lineNumber} 行存在多余的配音同步结束标记`);
      else stack.pop();
      return;
    }
    const text = marker.payload?.text;
    if (typeof text !== "string" || !text.trim()) issues.push(`第 ${lineNumber} 行缺少可合成的静态配音文本`);
    if (text && text.length > 2000) issues.push(`第 ${lineNumber} 行的配音文本超过 2000 个字符`);
    const roleId = marker.payload?.roleId || "default";
    if (!knownRoles.has(roleId)) issues.push(`第 ${lineNumber} 行引用了不存在的配音角色 ${roleId}`);
    if (marker.kind === "cue") cueCount += 1;
    else {
      synchronizedCount += 1;
      if (stack.length) issues.push(`第 ${lineNumber} 行的同步配音嵌套在另一个同步区间内；请拆分为不重叠的区间`);
      stack.push(lineNumber);
    }
  });
  stack.forEach((lineNumber) => issues.push(`第 ${lineNumber} 行开始的同步配音缺少结束标记`));
  return { valid: !issues.length, cueCount, synchronizedCount, issues };
}
