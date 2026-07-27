import { parseVoiceoverMarker } from "./voiceoverMarkers";

export type SynthesizedVoiceoverClip = {
  path: string;
  durationSeconds: number;
};

export type VoiceoverSynthesisRequest = { text: string; roleId?: string; blockId?: string };

export class ManimVoiceoverError extends Error {
  readonly request: VoiceoverSynthesisRequest;
  readonly detail?: string;

  constructor(message: string, request: VoiceoverSynthesisRequest, detail?: string) {
    super(message);
    this.name = "ManimVoiceoverError";
    this.request = request;
    this.detail = detail;
  }
}

export type PreparedVoiceoverSource = {
  code: string;
  clipCount: number;
  segmentCount: number;
  synchronizedSegmentCount: number;
  totalDurationSeconds: number;
  segments: Array<{ blockId?: string; durationSeconds: number }>;
};

const pythonString = (value: string) => JSON.stringify(value);
const minimumTimedActionSeconds = 0.2;

type TimedCall = {
  kind: "play" | "wait";
  weight: number;
  valueStart: number;
  valueEnd: number;
};

function skipPythonString(source: string, start: number): number {
  const quote = source[start];
  const triple = source.slice(start, start + 3) === quote.repeat(3);
  const delimiter = triple ? quote.repeat(3) : quote;
  let index = start + delimiter.length;
  while (index < source.length) {
    if (!triple && source[index] === "\\") index += 2;
    else if (source.slice(index, index + delimiter.length) === delimiter) return index + delimiter.length;
    else index += 1;
  }
  return source.length;
}

function findClosingParenthesis(source: string, opening: number, limit: number): number {
  let depth = 0;
  for (let index = opening; index < limit; index += 1) {
    const char = source[index];
    if (char === "'" || char === '"') index = skipPythonString(source, index) - 1;
    else if (char === "#") {
      const newline = source.indexOf("\n", index);
      index = newline < 0 ? limit : newline;
    } else if (char === "(") depth += 1;
    else if (char === ")" && --depth === 0) return index;
  }
  return -1;
}

function topLevelArguments(source: string, start: number, end: number): Array<{ start: number; end: number }> {
  const arguments_: Array<{ start: number; end: number }> = [];
  let argumentStart = start;
  let depth = 0;
  for (let index = start; index < end; index += 1) {
    const char = source[index];
    if (char === "'" || char === '"') index = skipPythonString(source, index) - 1;
    else if (char === "#") {
      const newline = source.indexOf("\n", index);
      index = newline < 0 ? end : newline;
    } else if ("([{".includes(char)) depth += 1;
    else if (")]}".includes(char)) depth -= 1;
    else if (char === "," && depth === 0) {
      arguments_.push({ start: argumentStart, end: index });
      argumentStart = index + 1;
    }
  }
  if (source.slice(argumentStart, end).trim()) arguments_.push({ start: argumentStart, end });
  return arguments_;
}

function trimmedSpan(source: string, start: number, end: number) {
  while (start < end && /\s/.test(source[start])) start += 1;
  while (end > start && /\s/.test(source[end - 1])) end -= 1;
  return { start, end };
}

function numericWeight(value: string, fallback = 1) {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function findTimedCalls(source: string, start: number, end: number): TimedCall[] {
  const calls: TimedCall[] = [];
  for (let index = start; index < end; index += 1) {
    const char = source[index];
    if (char === "'" || char === '"') {
      index = skipPythonString(source, index) - 1;
      continue;
    }
    if (char === "#") {
      const newline = source.indexOf("\n", index);
      index = newline < 0 ? end : newline;
      continue;
    }
    const match = source.slice(index).match(/^self\.(play|wait)\s*\(/);
    if (!match || (index > 0 && /[\w.]/.test(source[index - 1]))) continue;
    const kind = match[1] as "play" | "wait";
    const opening = source.indexOf("(", index + 5);
    const closing = findClosingParenthesis(source, opening, end);
    if (closing < 0) continue;
    const args = topLevelArguments(source, opening + 1, closing);
    if (kind === "wait") {
      const value = args[0] ? trimmedSpan(source, args[0].start, args[0].end) : { start: opening + 1, end: opening + 1 };
      calls.push({ kind, weight: numericWeight(source.slice(value.start, value.end)), valueStart: value.start, valueEnd: value.end });
    } else {
      const runTime = args.find((argument) => /^\s*run_time\s*=/.test(source.slice(argument.start, argument.end)));
      if (runTime) {
        const argument = source.slice(runTime.start, runTime.end);
        const equals = argument.indexOf("=");
        const value = trimmedSpan(source, runTime.start + equals + 1, runTime.end);
        calls.push({ kind, weight: numericWeight(source.slice(value.start, value.end)), valueStart: value.start, valueEnd: value.end });
      } else {
        calls.push({ kind, weight: 1, valueStart: closing, valueEnd: closing });
      }
    }
    index = closing;
  }
  return calls;
}

export function fitSynchronizedVoiceoverTiming(source: string, startLine: number, endLine: number, durationSeconds: number): string {
  const lineOffsets = [0];
  for (let index = 0; index < source.length; index += 1) if (source[index] === "\n") lineOffsets.push(index + 1);
  const start = lineOffsets[startLine - 1] ?? source.length;
  const end = lineOffsets[endLine] ?? source.length;
  const calls = findTimedCalls(source, start, end);
  if (!calls.length) return source;
  const minimumTotal = calls.length * minimumTimedActionSeconds;
  const available = Math.max(durationSeconds, minimumTotal);
  const distributable = Math.max(0, available - minimumTotal);
  const totalWeight = calls.reduce((sum, call) => sum + call.weight, 0);
  const replacements = calls.map((call) => ({
    start: call.valueStart,
    end: call.valueEnd,
    value: `${call.kind === "play" && call.valueStart === call.valueEnd ? ", run_time=" : ""}${(minimumTimedActionSeconds + distributable * call.weight / totalWeight).toFixed(3)}`,
  })).sort((left, right) => right.start - left.start);
  let result = source;
  for (const replacement of replacements) result = `${result.slice(0, replacement.start)}${replacement.value}${result.slice(replacement.end)}`;
  return result;
}

export async function prepareManimVoiceovers(
  source: string,
  synthesize: (request: VoiceoverSynthesisRequest) => Promise<SynthesizedVoiceoverClip>,
): Promise<PreparedVoiceoverSource> {
  const lines = source.split("\n");
  const cache = new Map<string, Promise<SynthesizedVoiceoverClip>>();
  const stack: Array<{ variable: string; duration: number; startLine: number }> = [];
  const synchronizedRanges: Array<{ startLine: number; endLine: number; duration: number }> = [];
  let clipCount = 0;
  let segmentCount = 0;
  let synchronizedSegmentCount = 0;
  let totalDurationSeconds = 0;
  const segments: Array<{ blockId?: string; durationSeconds: number }> = [];

  const getClip = (text: string, roleId?: string, blockId?: string) => {
    const key = `${roleId || "default"}\0${text}`;
    let clip = cache.get(key);
    if (!clip) {
      clip = synthesize({ text, roleId, blockId });
      cache.set(key, clip);
      clipCount += 1;
    }
    return clip;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const marker = parseVoiceoverMarker(lines[index]);
    if (!marker) continue;
    const indent = lines[index].match(/^\s*/)?.[0] ?? "";
    if (marker.kind === "end") {
      const active = stack.pop();
      if (!active) throw new Error("配音时间轴缺少开始积木");
      synchronizedRanges.push({ startLine: active.startLine, endLine: index + 1, duration: active.duration });
      const remainingVariable = `${active.variable}_remaining`;
      lines[index] = `${indent}${remainingVariable} = ${active.duration.toFixed(3)} - (self.renderer.time - ${active.variable}); self.wait(${remainingVariable}) if ${remainingVariable} > 0 else None`;
      continue;
    }
    const text = marker.payload?.text;
    const request = { text: text ?? "", roleId: marker.payload?.roleId, blockId: marker.payload?.blockId };
    if (text === undefined) throw new ManimVoiceoverError("配音文本需要直接连接 Python 文本积木", request);
    if (!text.trim()) throw new ManimVoiceoverError("配音文本不能为空", request);
    const clip = await getClip(text, marker.payload?.roleId, marker.payload?.blockId);
    if (!Number.isFinite(clip.durationSeconds) || clip.durationSeconds <= 0) throw new ManimVoiceoverError("无法读取这段配音的音频时长", request);
    segmentCount += 1;
    totalDurationSeconds += clip.durationSeconds;
    segments.push({ ...(marker.payload?.blockId ? { blockId: marker.payload.blockId } : {}), durationSeconds: clip.durationSeconds });
    const path = pythonString(clip.path);
    if (marker.kind === "cue") {
      lines[index] = `${indent}self.add_sound(${path}); self.wait(${clip.durationSeconds.toFixed(3)})`;
    } else {
      synchronizedSegmentCount += 1;
      const variable = `_visual_python_voiceover_start_${index + 1}`;
      stack.push({ variable, duration: clip.durationSeconds, startLine: index + 2 });
      lines[index] = `${indent}${variable} = self.renderer.time; self.add_sound(${path})`;
    }
  }
  if (stack.length) throw new Error("配音时间轴缺少结束积木");
  let code = lines.join("\n");
  for (const range of synchronizedRanges) code = fitSynchronizedVoiceoverTiming(code, range.startLine, range.endLine - 1, range.duration);
  return { code, clipCount, segmentCount, synchronizedSegmentCount, totalDurationSeconds, segments };
}
