import { isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, ArrowDown, Box, Check, ChevronDown, ChevronRight, Clock3, Code2, Copy, CornerDownLeft, Eye, Files, Film, ImageIcon, ListChecks, LoaderCircle, MessageSquarePlus, MessagesSquare, Play, Plug, Redo2, RefreshCw, Save, Send, Settings, ShieldQuestion, Sparkles, Square, Terminal, Trash2, Undo2, Volume2, X } from "lucide-react";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import { openUrl } from "@tauri-apps/plugin-opener";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import type { AiAgentActivity, AiAgentExecution, AiAgentMode, AiAgentPermissionRequest, AiAgentPlanStep, AiAgentProgress, AiAgentResult, AiAgentToolName, AiCodeChangeSnapshot, AiConversationTurn, AiTaskChangeSnapshot } from "./aiAgent";
import { getAiAgentPermissionMode, type AiAgentPermissionMode } from "./aiConfig";
import { stripManagedAudioMetadataForDisplay } from "./managedAudioMetadata";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);

type RunAgentArgs = {
  prompt: string;
  history: AiConversationTurn[];
  agentMode: AiAgentMode;
  initialPlan?: AiAgentPlanStep[];
  onActivity: (activity: AiAgentActivity) => void;
  onProgress: (progress: AiAgentProgress) => void;
  permissionMode: AiAgentPermissionMode;
  onPermissionRequest: (request: AiAgentPermissionRequest) => Promise<boolean>;
  signal: AbortSignal;
};

type AiAssistantPanelProps = {
  lineCount: number;
  sceneName: string;
  conversationScope: string;
  onOpenSettings: () => void;
  onClose: () => void;
  onRunAgent: (args: RunAgentArgs) => Promise<AiAgentResult>;
  onRevealCodeChange: (diff: string, line?: number) => void;
  onRevealProblem: (line: number) => void;
  onUndoCodeChange: (change: AiCodeChangeSnapshot) => boolean;
  onApplyCodeChange: (change: AiCodeChangeSnapshot) => boolean;
  onUndoTaskChange: (change: AiTaskChangeSnapshot) => boolean;
  onApplyTaskChange: (change: AiTaskChangeSnapshot) => boolean;
  onClearConversationConfirm: () => Promise<boolean>;
};

type AgentRun = {
  id: number;
  prompt: string;
  request?: string;
  mode: AiAgentMode;
  initialPlan?: AiAgentPlanStep[];
  activities: AiAgentActivity[];
  status: "queued" | "running" | "done" | "error" | "stopped";
  result?: AiAgentResult;
  error?: string;
  taskUndone?: boolean;
  progress?: AiAgentProgress;
  startedAt?: number;
  finishedAt?: number;
  permission?: AiAgentPermissionRequest;
};

type AiConversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  runs: AgentRun[];
};

type AiConversationState = {
  activeId: string;
  conversations: AiConversation[];
};

type AiConversationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

type AgentActivityEntry =
  | { kind: "activity"; activity: AiAgentActivity }
  | { kind: "group"; id: string; summary: string; activities: AiAgentActivity[] };

type AgentToolCategory = "explore" | "edit" | "verify" | "execute" | "other";

const legacyAiHistoryStorageKey = "visual-python:ai-conversation-history";
const maxStoredRuns = 30;
const maxStoredConversations = 12;
const maxStoredHistoryCharacters = 1_500_000;
const maxContextTurns = 24;
const maxContextCharacters = 64_000;
let conversationSequence = 1;

const aiHistoryStorageKey = (scope: string) => `${legacyAiHistoryStorageKey}:${encodeURIComponent(scope)}`;
const aiConversationsStorageKey = (scope: string) => `visual-python:ai-conversations:${encodeURIComponent(scope)}`;

function createConversationId() {
  return `conversation-${Date.now().toString(36)}-${conversationSequence++}`;
}

function conversationTitle(prompt?: string) {
  const normalized = prompt?.replace(/\s+/g, " ").trim() || "新对话";
  return normalized.length > 32 ? `${normalized.slice(0, 32)}...` : normalized;
}

function createConversation(runs: AgentRun[] = []): AiConversation {
  const now = Date.now();
  return {
    id: createConversationId(),
    title: conversationTitle(runs[0]?.prompt),
    createdAt: now,
    updatedAt: now,
    runs,
  };
}

function parseStoredRuns(value: unknown): AgentRun[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-maxStoredRuns).flatMap((candidate): AgentRun[] => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const run = candidate as Partial<AgentRun>;
    if (typeof run.id !== "number" || typeof run.prompt !== "string" || !Array.isArray(run.activities)) return [];
    const status = run.status === "running" ? "stopped" : run.status;
    if (status !== "queued" && status !== "done" && status !== "error" && status !== "stopped") return [];
    const finishedAt = typeof run.finishedAt === "number"
      ? run.finishedAt
      : run.status === "running" && typeof run.startedAt === "number"
        ? Date.now()
        : undefined;
    const initialPlan = Array.isArray(run.initialPlan) ? run.initialPlan.flatMap((candidate): AiAgentPlanStep[] => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
      const step = candidate as Partial<AiAgentPlanStep>;
      if (typeof step.step !== "string" || (step.status !== "pending" && step.status !== "in_progress" && step.status !== "completed")) return [];
      return [{ step: step.step.slice(0, 120), status: step.status }];
    }).slice(0, 10) : [];
    return [{ ...run, id: run.id, prompt: run.prompt, mode: run.mode === "plan" ? "plan" : "agent", ...(initialPlan.length ? { initialPlan } : { initialPlan: undefined }), activities: run.activities, status, finishedAt } as AgentRun];
  });
}

function loadStoredRuns(scope: string): AgentRun[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(aiHistoryStorageKey(scope)) || "[]");
    return parseStoredRuns(value);
  } catch {
    return [];
  }
}

function loadConversationState(scope: string): AiConversationState {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(aiConversationsStorageKey(scope)) || "null");
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const candidate = value as Partial<AiConversationState>;
      const conversations = Array.isArray(candidate.conversations)
        ? candidate.conversations.slice(-maxStoredConversations).flatMap((item): AiConversation[] => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return [];
          const conversation = item as Partial<AiConversation>;
          if (typeof conversation.id !== "string" || !conversation.id) return [];
          const runs = parseStoredRuns(conversation.runs);
          return [{
            id: conversation.id,
            title: typeof conversation.title === "string" && conversation.title.trim() ? conversation.title.slice(0, 80) : conversationTitle(runs[0]?.prompt),
            createdAt: typeof conversation.createdAt === "number" ? conversation.createdAt : Date.now(),
            updatedAt: typeof conversation.updatedAt === "number" ? conversation.updatedAt : Date.now(),
            runs,
          }];
        })
        : [];
      if (conversations.length) {
        const activeId = conversations.some((item) => item.id === candidate.activeId) ? candidate.activeId! : conversations.at(-1)!.id;
        return { activeId, conversations };
      }
    }
  } catch {
    // Fall through to the legacy conversation migration.
  }
  const conversation = createConversation(loadStoredRuns(scope));
  return { activeId: conversation.id, conversations: [conversation] };
}

function isStorageQuotaError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.name === "QuotaExceededError"
    || error.name === "NS_ERROR_DOM_QUOTA_REACHED"
    || ("code" in error && (error.code === 22 || error.code === 1014));
}

function serializeConversationState(state: AiConversationState) {
  let conversations = state.conversations.slice(-maxStoredConversations).map((conversation) => ({
    ...conversation,
    runs: conversation.runs.slice(-maxStoredRuns).map((run): AgentRun => ({
      ...run,
      ...(run.status === "running" ? { status: "stopped", finishedAt: run.finishedAt ?? Date.now() } : {}),
      activities: run.activities.map((activity) => ({
        ...activity,
        ...(activity.execution ? {
          execution: {
            ...activity.execution,
            output: activity.execution.output.slice(-120),
            problems: activity.execution.problems.slice(0, 40),
          },
        } : {}),
      })),
    })),
  }));
  const serialize = () => JSON.stringify({ activeId: state.activeId, conversations });
  let serialized = serialize();
  const update = (transform: (conversation: AiConversation) => AiConversation) => {
    conversations = conversations.map(transform);
    serialized = serialize();
  };

  if (serialized.length > maxStoredHistoryCharacters) {
    update((conversation) => ({
      ...conversation,
      runs: conversation.runs.map((run) => run.result?.taskChange
        ? { ...run, result: { ...run.result, taskChange: undefined } }
        : run),
    }));
  }
  if (serialized.length > maxStoredHistoryCharacters) {
    update((conversation) => ({
      ...conversation,
      runs: conversation.runs.map((run, runIndex) => {
        const keepLatestActiveChange = conversation.id === state.activeId && runIndex === conversation.runs.length - 1;
        return keepLatestActiveChange ? run : {
          ...run,
          activities: run.activities.map((activity) => activity.codeChange ? { ...activity, codeChange: undefined } : activity),
        };
      }),
    }));
  }
  if (serialized.length > maxStoredHistoryCharacters) {
    update((conversation) => ({
      ...conversation,
      runs: conversation.runs.map((run) => ({
        ...run,
        activities: run.activities.map((activity) => ({
          ...activity,
          codeChange: undefined,
          result: activity.result?.slice(0, 12_000),
          ...(activity.execution ? {
            execution: { ...activity.execution, output: activity.execution.output.slice(-40) },
          } : {}),
        })),
      })),
    }));
  }
  while (conversations.length > 1 && serialized.length > maxStoredHistoryCharacters) {
    const removable = conversations.findIndex((conversation) => conversation.id !== state.activeId);
    if (removable < 0) break;
    conversations = conversations.filter((_, index) => index !== removable);
    serialized = serialize();
  }
  let activeIndex = conversations.findIndex((conversation) => conversation.id === state.activeId);
  while (activeIndex >= 0 && conversations[activeIndex].runs.length > 1 && serialized.length > maxStoredHistoryCharacters) {
    conversations = conversations.map((conversation, index) => index === activeIndex
      ? { ...conversation, runs: conversation.runs.slice(1) }
      : conversation);
    serialized = serialize();
    activeIndex = conversations.findIndex((conversation) => conversation.id === state.activeId);
  }
  if (serialized.length > maxStoredHistoryCharacters && activeIndex >= 0) {
    conversations = conversations.map((conversation, index) => index !== activeIndex ? conversation : {
      ...conversation,
      runs: conversation.runs.slice(-1).map((run) => ({
        ...run,
        prompt: run.prompt.slice(0, 50_000),
        request: run.request?.slice(0, 50_000),
        activities: run.activities.slice(-80).map((activity) => ({
          ...activity,
          codeChange: undefined,
          title: activity.title.slice(0, 50_000),
          result: activity.result?.slice(0, 4_000),
          ...(activity.execution ? {
            execution: { ...activity.execution, output: activity.execution.output.slice(-20), problems: activity.execution.problems.slice(0, 20) },
          } : {}),
        })),
        ...(run.result ? { result: { ...run.result, summary: run.result.summary.slice(0, 50_000), taskChange: undefined } } : {}),
      })),
    });
    serialized = serialize();
  }
  return serialized;
}

function storedConversationTimestamp(storage: AiConversationStorage, key: string) {
  try {
    const value = JSON.parse(storage.getItem(key) || "null") as Partial<AiConversationState> | null;
    if (!Array.isArray(value?.conversations)) return 0;
    return Math.max(0, ...value.conversations.map((conversation) => typeof conversation?.updatedAt === "number" ? conversation.updatedAt : 0));
  } catch {
    return 0;
  }
}

export function storeConversationState(scope: string, state: AiConversationState, storage: AiConversationStorage = localStorage) {
  const key = aiConversationsStorageKey(scope);
  const serialized = serializeConversationState(state);
  const persist = () => {
    storage.setItem(key, serialized);
    storage.removeItem(aiHistoryStorageKey(scope));
  };
  try {
    persist();
    return true;
  } catch (error) {
    if (!isStorageQuotaError(error)) return false;
  }

  const staleKeys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((candidate): candidate is string => Boolean(candidate?.startsWith("visual-python:ai-conversations:") && candidate !== key))
    .sort((left, right) => storedConversationTimestamp(storage, left) - storedConversationTimestamp(storage, right));
  for (const staleKey of staleKeys) {
    try {
      storage.removeItem(staleKey);
      persist();
      return true;
    } catch (error) {
      if (!isStorageQuotaError(error)) return false;
    }
  }
  return false;
}

export function trimAiConversationHistory(turns: AiConversationTurn[]): AiConversationTurn[] {
  const selected: AiConversationTurn[] = [];
  let characters = 0;
  for (let index = turns.length - 1; index >= 0 && selected.length < maxContextTurns; index -= 1) {
    const turn = {
      user: turns[index].user.slice(0, 4000),
      assistant: turns[index].assistant.slice(0, 4000),
      ...(turns[index].clarification ? { clarification: true } : {}),
    };
    const turnCharacters = turn.user.length + turn.assistant.length;
    if (selected.length && characters + turnCharacters > maxContextCharacters) break;
    selected.unshift(turn);
    characters += turnCharacters;
  }
  return selected;
}

export function buildPlanExecutionRequest(originalPrompt: string, plan: string): string {
  const truncate = (value: string, limit: number) => value.length > limit ? `${value.slice(0, limit)}\n[内容已截断]` : value;
  return [
    "请按照以下已审阅计划执行原始任务。直接实施、检查并修复，不要重新输出计划。",
    `原始任务：\n${truncate(originalPrompt.trim(), 16_000)}`,
    `实施计划：\n${truncate(plan.trim(), 30_000)}`,
  ].join("\n\n");
}

export function extractPlanSteps(markdown: string): string[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const collect = (pattern: RegExp) => lines.flatMap((line) => {
    const match = line.match(pattern);
    if (!match) return [];
    const step = match[1]
      .replace(/^\[[ xX]\]\s*/, "")
      .replace(/[*_`~]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    return step ? [step] : [];
  });
  const numbered = collect(/^\s*\d+[.)、]\s+(.+)$/);
  const candidates = numbered.length >= 2 ? numbered : collect(/^\s*[-*+]\s+(.+)$/);
  return [...new Set(candidates)].slice(0, 10);
}

export function createInitialTaskPlan(steps: string[]): AiAgentPlanStep[] {
  const normalized = [...new Set(steps.map((step) => step.replace(/\s+/g, " ").trim().slice(0, 120)).filter(Boolean))].slice(0, 10);
  if (normalized.length < 2) return [];
  return normalized.map((step, index) => ({ step, status: index === 0 ? "in_progress" : "pending" }));
}

export function prepareTaskPlanForResume(steps: AiAgentPlanStep[]): AiAgentPlanStep[] {
  const firstIncomplete = steps.findIndex(({ status }) => status !== "completed");
  return steps.slice(0, 10).map((item, index): AiAgentPlanStep => ({
    step: item.step.replace(/\s+/g, " ").trim().slice(0, 120),
    status: item.status === "completed" || firstIncomplete < 0 ? "completed" : index === firstIncomplete ? "in_progress" : "pending",
  })).filter(({ step }) => Boolean(step));
}

export function buildTaskResumeRequest(originalRequest: string, steps: AiAgentPlanStep[]): string {
  const completed = steps.filter(({ status }) => status === "completed").map(({ step }) => `- ${step}`).join("\n") || "- 无";
  const remaining = steps.filter(({ status }) => status !== "completed").map(({ step }, index) => `${index + 1}. ${step}`).join("\n") || "- 所有计划步骤已完成，请核对当前结果并完成最终回复";
  const request = originalRequest.trim();
  return [
    "继续执行此前中断的任务。工程已恢复到最近完成步骤的检查点，不要重复已完成步骤。",
    `原始任务：\n${request.length > 40_000 ? `${request.slice(0, 40_000)}\n[内容已截断]` : request}`,
    `已完成：\n${completed}`,
    `从以下未完成步骤继续：\n${remaining}`,
  ].join("\n\n");
}

export function taskPlanResumeLabel(steps: AiAgentPlanStep[]): string {
  return steps.length >= 2 && steps.every(({ status }) => status === "completed")
    ? "继续完成任务收尾"
    : "从未完成步骤继续";
}

function storeTransferredConversation(scope: string, title: string, runs: AgentRun[]) {
  const state = loadConversationState(scope);
  const transferred = { ...createConversation(runs), title };
  const conversations = [...state.conversations.filter((conversation) => conversation.runs.length), transferred].slice(-maxStoredConversations);
  storeConversationState(scope, { activeId: transferred.id, conversations });
}

const suggestions = [
  "创建勾股定理动画",
  "让图形沿圆形路径移动",
  "添加标题和入场动画",
];

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

const codeLanguageAliases: Record<string, string> = {
  cjs: "javascript",
  html: "xml",
  js: "javascript",
  jsx: "javascript",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  tsx: "typescript",
};

const codeLanguageLabels: Record<string, string> = {
  bash: "Shell",
  css: "CSS",
  javascript: "JavaScript",
  json: "JSON",
  markdown: "Markdown",
  python: "Python",
  typescript: "TypeScript",
  xml: "HTML/XML",
};

function codeLanguage(className?: string): { id: string; label: string } {
  const requested = className?.match(/(?:^|\s)language-([^\s]+)/)?.[1]?.toLowerCase() || "";
  const id = codeLanguageAliases[requested] || requested;
  return { id, label: codeLanguageLabels[id] || requested || "Text" };
}

export function highlightAssistantCode(code: string, language: string): string | null {
  if (!language || !hljs.getLanguage(language)) return null;
  return hljs.highlight(code, { language, ignoreIllegals: true }).value;
}

async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through for WebViews that expose but deny the Clipboard API.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard access denied");
}

function useCopyFeedback() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const resetTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  const copyText = async (text: string) => {
    try {
      await writeClipboardText(text);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyState("idle"), 1800);
  };

  return { copyState, copyText };
}

function MarkdownCodeBlock({ children }: { children?: ReactNode }) {
  const { copyState, copyText } = useCopyFeedback();
  const codeElement = isValidElement<{ className?: string; children?: ReactNode }>(children) ? children : null;
  const className = codeElement?.props.className;
  const code = String(codeElement?.props.children ?? "").replace(/\n$/, "");
  const language = codeLanguage(className);
  const highlighted = highlightAssistantCode(code, language.id);

  return <div className="ai-markdown-code-block">
    <header><span>{language.label}</span><button type="button" onClick={() => void copyText(code)} title="复制代码" aria-label="复制代码">{copyState === "copied" ? <Check size={13}/> : copyState === "error" ? <AlertCircle size={13}/> : <Copy size={13}/>}<span>{copyState === "copied" ? "已复制" : copyState === "error" ? "复制失败" : "复制"}</span></button></header>
    <pre><code className={className} {...(highlighted === null ? { children: code } : { dangerouslySetInnerHTML: { __html: highlighted } })}/></pre>
  </div>;
}

export function safeExternalMarkdownUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function MarkdownLink({ href, children }: { href?: string; children?: ReactNode }) {
  const safeUrl = safeExternalMarkdownUrl(href);
  if (!safeUrl) return <span className="ai-markdown-unsupported-link" title="不支持打开此链接">{children}</span>;
  return <a href={safeUrl} title={safeUrl} onClick={(event) => {
    event.preventDefault();
    void openUrl(safeUrl).catch(() => undefined);
  }}>{children}</a>;
}

function AiResponseActions({ markdown, disabled, onRetry }: { markdown: string; disabled: boolean; onRetry: () => void }) {
  const { copyState, copyText } = useCopyFeedback();
  const copyTitle = copyState === "copied" ? "已复制回复" : copyState === "error" ? "复制失败" : "复制回复";
  return <span className="ai-response-actions">
    <button type="button" title={copyTitle} aria-label={copyTitle} onClick={() => void copyText(normalizeAssistantMarkdown(markdown))}>{copyState === "copied" ? <Check size={13}/> : copyState === "error" ? <AlertCircle size={13}/> : <Copy size={13}/>}</button>
    <button type="button" disabled={disabled} title="基于当前代码重新执行此任务" aria-label="重新执行此任务" onClick={onRetry}><RefreshCw size={13}/></button>
  </span>;
}

export function normalizeAssistantMarkdown(value: string): string {
  let markdown = value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (/^"(?:\\.|[^"\\])*"$/.test(markdown)) {
    try {
      const decoded: unknown = JSON.parse(markdown);
      if (typeof decoded === "string") markdown = decoded.trim();
    } catch {
      // Keep malformed quoted responses visible instead of dropping content.
    }
  }
  if (!markdown.includes("\n") && /\\n\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```|~~~)/.test(markdown)) {
    markdown = markdown.replace(/\\r\\n|\\n|\\r/g, "\n");
  }
  const outerFence = markdown.match(/^(```|~~~)(?:markdown|md|mdown)\s*\n([\s\S]*?)\n\1\s*$/i);
  return (outerFence?.[2] ?? markdown).trim();
}

export function MarkdownContent({ children, className = "" }: { children: string; className?: string }) {
  return <div className={`ai-markdown ${className}`}><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{ pre: MarkdownCodeBlock, a: MarkdownLink }}>{normalizeAssistantMarkdown(children)}</ReactMarkdown></div>;
}

function codeDiffStartLine(result?: string): number | null {
  const line = Number(result?.match(/^@@ 第 (\d+) 行 @@/)?.[1]);
  return Number.isInteger(line) && line > 0 ? line : null;
}

function isCodeChangeTool(toolName?: AiAgentToolName) {
  return toolName === "rename_scene" || toolName === "replace_code" || toolName === "edit_code" || toolName === "insert_statements" || toolName === "replace_function_body" || toolName === "add_import" || toolName === "add_voiceover" || toolName === "add_synchronized_voiceover";
}

export function groupAgentActivities(activities: AiAgentActivity[]): AgentActivityEntry[] {
  const entries: AgentActivityEntry[] = [];
  let compact: AiAgentActivity[] = [];
  const flushCompact = () => {
    if (compact.length === 1) entries.push({ kind: "activity", activity: compact[0] });
    else if (compact.length > 1) entries.push({ kind: "group", id: compact.map((activity) => activity.id).join("-"), summary: summarizeAgentActivities(compact), activities: compact });
    compact = [];
  };
  for (const activity of activities) {
    const isCompact = activity.kind === "tool" && activity.status === "done" && !activity.result && !activity.codeChange && !activity.execution;
    if (isCompact) compact.push(activity);
    else {
      flushCompact();
      entries.push({ kind: "activity", activity });
    }
  }
  flushCompact();
  return entries;
}

function agentToolCategory(toolName?: AiAgentToolName | "inspect_rendered_video"): AgentToolCategory {
  if (!toolName) return "other";
  if (["get_context", "list_scenes", "get_scene", "list_resources", "get_resource", "get_voiceover_context", "inspect_python_structure"].includes(toolName)) return "explore";
  if (["create_scene", "switch_scene", "rename_scene", "delete_scene", "replace_code", "edit_code", "insert_statements", "replace_function_body", "add_import", "add_voiceover", "add_synchronized_voiceover", "format_code", "undo_code", "redo_code"].includes(toolName)) return "edit";
  if (["validate_scene", "check_resources", "check_dependencies", "check_voiceover", "check_code", "inspect_rendered_output", "inspect_rendered_video"].includes(toolName)) return "verify";
  if (["run_project", "render_manim", "get_execution_state", "wait", "stop_execution"].includes(toolName)) return "execute";
  return "other";
}

export function summarizeAgentActivities(activities: AiAgentActivity[]): string {
  const counts = new Map<AgentToolCategory, number>();
  for (const activity of activities) {
    const category = agentToolCategory(activity.toolName);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const labels: Array<[AgentToolCategory, string]> = [
    ["explore", "查看"],
    ["edit", "修改"],
    ["verify", "检查"],
    ["execute", "执行"],
  ];
  const parts = labels.flatMap(([category, label]) => {
    const count = counts.get(category) ?? 0;
    return count ? [`${label} ${count} 项`] : [];
  });
  const other = counts.get("other") ?? 0;
  if (other) parts.push(`其他 ${other} 项`);
  return parts.length ? parts.join(" · ") : `完成 ${activities.length} 项操作`;
}

export function isNearLatestScroll(scrollTop: number, clientHeight: number, scrollHeight: number, threshold = 48): boolean {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}

export function formatAgentElapsed(startedAt?: number, finishedAt = Date.now()): string {
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt)) return "";
  const elapsedSeconds = Math.max(0, Math.floor((finishedAt - startedAt) / 1000));
  if (elapsedSeconds < 1) return "<1 秒";
  if (elapsedSeconds < 60) return `${elapsedSeconds} 秒`;
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`;
}

export function formatAiTokenCount(total?: number): string {
  if (typeof total !== "number" || !Number.isFinite(total) || total <= 0) return "";
  const rounded = Math.max(0, Math.floor(total));
  if (rounded < 10_000) return `${rounded.toLocaleString("zh-CN")} Token`;
  const tenThousands = rounded / 10_000;
  return `${tenThousands < 10 ? tenThousands.toFixed(1).replace(/\.0$/, "") : Math.round(tenThousands)} 万 Token`;
}

function agentRunMeta(run: AgentRun): string {
  const result = run.result;
  if (!result) return "";
  const elapsed = run.startedAt ? formatAgentElapsed(run.startedAt, run.finishedAt) : "";
  const tokenCount = formatAiTokenCount(result.tokenUsage?.total);
  if (result.clarification) return ["需要确认任务方向", tokenCount].filter(Boolean).join(" · ");
  if (result.intent === "chat") return [elapsed, tokenCount].filter(Boolean).join(" · ");
  const operation = result.mode === "plan" || result.intent === "inspect"
    ? `${result.toolCallCount} 次查看 · 当前 ${result.lineCount} 行`
    : `${result.toolCallCount} 次操作 · ${result.lineCount} 行代码`;
  return [operation, elapsed, tokenCount].filter(Boolean).join(" · ");
}

function ToolResult({ activity, onRevealCodeChange }: { activity: AiAgentActivity; onRevealCodeChange: (diff: string, line?: number) => void }) {
  const isCodeDiff = isCodeChangeTool(activity.toolName);
  if (!isCodeDiff) return <pre>{activity.result}</pre>;
  const startLine = codeDiffStartLine(activity.result);
  const displayedResult = stripManagedAudioMetadataForDisplay(activity.result || "");
  let removedOffset = 0;
  let addedOffset = 0;
  return <pre className="ai-code-diff" aria-label="代码修改差异">{displayedResult.split("\n").map((line, index) => {
    const kind = line.startsWith("+ ") ? "added" : line.startsWith("- ") ? "removed" : line.startsWith("@@") ? "location" : "context";
    const targetLine = startLine === null ? null : kind === "added" ? startLine + addedOffset++ : kind === "removed" ? startLine + removedOffset++ : kind === "location" ? startLine : null;
    return <span className={`ai-code-diff-line ${kind} ${targetLine ? "locatable" : ""}`} key={`${index}-${line}`} onClick={targetLine && activity.result ? () => onRevealCodeChange(activity.result!, targetLine) : undefined}><span className="ai-code-diff-marker" aria-hidden="true">{kind === "added" ? "+" : kind === "removed" ? "-" : ""}</span><span>{kind === "added" || kind === "removed" ? line.slice(2) : line}</span></span>;
  })}</pre>;
}

function activityIcon(toolName?: AiAgentToolName | "inspect_rendered_video"): ReactNode {
  if (!toolName) return <Sparkles size={15}/>;
  if (toolName === "list_scenes" || toolName === "get_scene" || toolName === "switch_scene" || toolName === "create_scene" || toolName === "rename_scene" || toolName === "delete_scene") return <Files size={15}/>;
  if (toolName === "check_code" || toolName === "format_code" || toolName === "replace_code" || toolName === "edit_code" || toolName === "inspect_python_structure" || toolName === "insert_statements" || toolName === "replace_function_body" || toolName === "add_import") return <Code2 size={15}/>;
  if (toolName === "validate_scene") return <Check size={15}/>;
  if (toolName === "list_resources" || toolName === "get_resource" || toolName === "check_resources") return <Box size={15}/>;
  if (toolName === "check_dependencies" || toolName === "install_dependencies") return <Plug size={15}/>;
  if (toolName === "run_project" || toolName === "stop_execution") return <Play size={15}/>;
  if (toolName === "render_manim" || toolName === "inspect_rendered_output" || toolName === "inspect_rendered_video") return <Film size={15}/>;
  if (toolName === "get_voiceover_context" || toolName === "add_voiceover" || toolName === "add_synchronized_voiceover" || toolName === "check_voiceover") return <Volume2 size={15}/>;
  if (toolName === "save_project") return <Save size={15}/>;
  if (toolName === "undo_code") return <Undo2 size={15}/>;
  if (toolName === "redo_code") return <Redo2 size={15}/>;
  if (toolName === "wait") return <Clock3 size={15}/>;
  if (toolName === "get_context" || toolName === "get_execution_state") return <Eye size={15}/>;
  return <Code2 size={15}/>;
}

function AgentExecutionResult({ execution, onRevealProblem }: { execution: AiAgentExecution; onRevealProblem: (line: number) => void }) {
  const elapsed = execution.elapsedSeconds === undefined ? "" : formatAgentElapsed(0, execution.elapsedSeconds * 1000);
  const renderOutput = execution.renderOutput ?? (execution.video ? { type: "video" as const, ...execution.video } : undefined);
  return <div className={`ai-agent-execution ${execution.kind} ${execution.state}`}>
    <div className="ai-agent-execution-header">
      <span>{execution.kind === "manim" ? <Film size={15}/> : <Terminal size={15}/>}</span>
      <span><strong>{execution.label}</strong>{execution.scene && <small>{execution.scene}</small>}</span>
      {elapsed && <time>{elapsed}</time>}
    </div>
    {execution.state === "running" && <div className={`ai-agent-execution-progress ${execution.percent === undefined ? "indeterminate" : ""}`} role="progressbar" aria-label={execution.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={execution.percent}><span style={execution.percent === undefined ? undefined : { width: `${execution.percent}%` }}/></div>}
    {execution.problems.length > 0 && <div className="ai-agent-execution-problems">{execution.problems.slice(0, 4).map((problem, index) => <button type="button" key={`${problem.line}-${index}`} className={problem.line > 0 ? "locatable" : ""} onClick={problem.line > 0 ? () => onRevealProblem(problem.line) : undefined} title={problem.line > 0 ? `定位到第 ${problem.line} 行` : undefined}><AlertCircle size={13}/><span><strong>{problem.message}</strong>{problem.suggestion && <small>{problem.suggestion}</small>}</span>{problem.line > 0 && <em>第 {problem.line} 行</em>}</button>)}</div>}
    {execution.output.length > 0 && <pre className="ai-agent-execution-output" aria-label="关键运行输出">{execution.output.map((line, index) => <span className={`output-${line.stream}`} key={`${index}-${line.data}`}>{line.data}{"\n"}</span>)}</pre>}
    {renderOutput && <div className="ai-agent-execution-video">{renderOutput.type === "image" ? <ImageIcon size={13}/> : <Film size={13}/>}<span><strong>{renderOutput.scene}</strong><code title={renderOutput.path}>{renderOutput.path}</code></span></div>}
  </div>;
}

function AgentActivityRow({ activity, runId, onRevealCodeChange, onRevealProblem, onUndoCodeChange, onApplyCodeChange, onUpdate }: {
  activity: AiAgentActivity;
  runId: number;
  onRevealCodeChange: (diff: string, line?: number) => void;
  onRevealProblem: (line: number) => void;
  onUndoCodeChange: (change: AiCodeChangeSnapshot) => boolean;
  onApplyCodeChange: (change: AiCodeChangeSnapshot) => boolean;
  onUpdate: (runId: number, activity: AiAgentActivity) => void;
}) {
  if (activity.kind === "message") return <div className={`ai-agent-narration ${activity.status}`}>
    {activity.status === "running" ? <LoaderCircle className="spin" size={15}/> : <Sparkles size={15}/>}<MarkdownContent>{activity.title}</MarkdownContent>
  </div>;
  if (activity.execution) return <AgentExecutionResult execution={activity.execution} onRevealProblem={onRevealProblem}/>;
  if (!activity.result) return <div className={`ai-agent-tool-line ${activity.status}`}>
    <span className="ai-agent-tool-icon">{activity.status === "running" ? <LoaderCircle className="spin" size={15}/> : activity.status === "error" ? <AlertCircle size={15}/> : activityIcon(activity.toolName)}</span>
    <strong>{activity.title}</strong>
    {activity.detail && <small>{activity.detail}</small>}
  </div>;
  return <details className={`ai-agent-tool ${activity.status}`}>
    <summary onClick={(event) => {
      if (event.target instanceof Element && event.target.closest(".ai-agent-tool-chevron")) return;
      const line = codeDiffStartLine(activity.result);
      if (!line || !isCodeChangeTool(activity.toolName)) return;
      event.preventDefault();
      onRevealCodeChange(activity.result!, line);
    }}>
      <ChevronRight className="ai-agent-tool-chevron" size={14}/>
      <span className="ai-agent-tool-icon">{activity.status === "running" ? <LoaderCircle className="spin" size={15}/> : activity.status === "error" ? <AlertCircle size={15}/> : activityIcon(activity.toolName)}</span>
      <strong>{activity.title}</strong>
      {activity.detail && <small>{activity.detail}</small>}
      {activity.codeChange && <span className="ai-agent-change-actions">
        <button disabled={!activity.undone} title={activity.undone ? "重新应用这次 AI 修改" : "修改已应用"} aria-label={activity.undone ? "重新应用这次 AI 修改" : "修改已应用"} onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (activity.codeChange && onApplyCodeChange(activity.codeChange)) onUpdate(runId, { ...activity, undone: false, detail: "已应用" });
        }}><Check size={14}/></button>
        <button disabled={activity.undone} title={activity.undone ? "已撤销" : "撤销这次 AI 修改"} aria-label={activity.undone ? "已撤销" : "撤销这次 AI 修改"} onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (activity.codeChange && onUndoCodeChange(activity.codeChange)) onUpdate(runId, { ...activity, undone: true, detail: "已撤销" });
        }}><Undo2 size={14}/></button>
      </span>}
    </summary>
    <ToolResult activity={activity} onRevealCodeChange={onRevealCodeChange}/>
  </details>;
}

function AgentTaskPlan({ steps, collapsed = false }: { steps: AiAgentPlanStep[]; collapsed?: boolean }) {
  if (!steps.length) return null;
  const completed = steps.filter(({ status }) => status === "completed").length;
  const list = <ol>{steps.map((item, index) => <li className={item.status} key={`${index}-${item.step}`}>
    <span className="ai-agent-task-marker" aria-hidden="true">{item.status === "completed" ? <Check size={11}/> : item.status === "in_progress" ? <LoaderCircle className="spin" size={11}/> : null}</span>
    <span>{item.step}</span>
    <small>{item.status === "completed" ? "完成" : item.status === "in_progress" ? "进行中" : "等待"}</small>
  </li>)}</ol>;
  if (collapsed) return <details className="ai-agent-task-plan completed">
    <summary><ChevronRight size={13}/><ListChecks size={14}/><strong>{completed}/{steps.length} 步骤完成</strong></summary>
    {list}
  </details>;
  return <div className="ai-agent-task-plan">
    <header><span><ListChecks size={14}/><strong>执行计划</strong></span><small>{completed}/{steps.length}</small></header>
    {list}
  </div>;
}

function AgentRunProgress({ progress, elapsed }: { progress?: AiAgentProgress; elapsed: string }) {
  const tokenCount = formatAiTokenCount(progress?.tokenUsage?.total);
  return <>
    {progress?.taskPlan?.length ? <AgentTaskPlan steps={progress.taskPlan}/> : null}
    <div className={`ai-agent-progress phase-${progress?.phase || "preparing"}`} role="status">
      <LoaderCircle className="spin" size={15}/>
      <strong>{progress?.label || "正在准备任务"}</strong>
      {(elapsed || tokenCount) && <time aria-hidden="true">{[elapsed, tokenCount].filter(Boolean).join(" · ")}</time>}
    </div>
  </>;
}

function AgentPermissionPrompt({ request, onRespond }: { request: AiAgentPermissionRequest; onRespond: (approved: boolean) => void }) {
  return <div className="ai-agent-permission" role="group" aria-label={request.title}>
    <ShieldQuestion size={17}/>
    <span><strong>{request.title}</strong><small>{request.detail}</small></span>
    <span><button type="button" className="approve" onClick={() => onRespond(true)}><Check size={14}/>允许</button><button type="button" onClick={() => onRespond(false)}><X size={14}/>拒绝</button></span>
  </div>;
}

export function AiAssistantPanel({ lineCount, sceneName, conversationScope, onOpenSettings, onClose, onRunAgent, onRevealCodeChange, onRevealProblem, onUndoCodeChange, onApplyCodeChange, onUndoTaskChange, onApplyTaskChange, onClearConversationConfirm }: AiAssistantPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [agentMode, setAgentMode] = useState<AiAgentMode>("agent");
  const [agentModeMenuOpen, setAgentModeMenuOpen] = useState(false);
  const [conversationMenuOpen, setConversationMenuOpen] = useState(false);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [conversationPersistenceFailed, setConversationPersistenceFailed] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [conversationState, setConversationState] = useState<AiConversationState>(() => loadConversationState(conversationScope));
  const activeConversation = conversationState.conversations.find((conversation) => conversation.id === conversationState.activeId) ?? conversationState.conversations[0];
  const runs = activeConversation?.runs ?? [];
  const runId = useRef(Math.max(0, ...conversationState.conversations.flatMap((conversation) => conversation.runs.map((run) => run.id))) + 1);
  const activeController = useRef<AbortController | null>(null);
  const redirectRef = useRef<{ request: string; prompt: string; mode: AiAgentMode; initialPlan?: AiAgentPlanStep[] } | null>(null);
  const permissionResolvers = useRef(new Map<number, (approved: boolean) => void>());
  const threadRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const conversationMenuRef = useRef<HTMLDivElement>(null);
  const agentModeMenuRef = useRef<HTMLDivElement>(null);
  const agentModeTriggerRef = useRef<HTMLButtonElement>(null);
  const runsRef = useRef(runs);
  const stickToLatestRef = useRef(true);
  const running = runs.some((run) => run.status === "running");
  const awaitingClarification = runs.at(-1)?.status === "done" && Boolean(runs.at(-1)?.result?.clarification);

  useEffect(() => {
    if (!running) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const setRuns = (update: (items: AgentRun[]) => AgentRun[]) => {
    const nextRuns = update(runsRef.current);
    runsRef.current = nextRuns;
    setConversationState((state) => ({
      ...state,
      conversations: state.conversations.map((conversation) => conversation.id === state.activeId
        ? { ...conversation, runs: nextRuns, updatedAt: Date.now() }
        : conversation),
    }));
  };

  useEffect(() => {
    setConversationPersistenceFailed(!storeConversationState(conversationScope, conversationState));
  }, [conversationScope, conversationState]);

  useEffect(() => {
    runsRef.current = runs;
    if (!runs.length) {
      stickToLatestRef.current = true;
      setShowScrollToLatest(false);
      return;
    }
    if (!stickToLatestRef.current) {
      setShowScrollToLatest(true);
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (!threadRef.current) return;
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
      setShowScrollToLatest(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [runs]);

  useEffect(() => {
    stickToLatestRef.current = true;
    setShowScrollToLatest(false);
    const frame = requestAnimationFrame(() => {
      if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [conversationState.activeId]);

  useEffect(() => {
    if (!conversationMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!conversationMenuRef.current?.contains(event.target as Node)) setConversationMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConversationMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [conversationMenuOpen]);

  useEffect(() => {
    if (!agentModeMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!agentModeMenuRef.current?.contains(event.target as Node)) setAgentModeMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAgentModeMenuOpen(false);
      agentModeTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [agentModeMenuOpen]);

  useEffect(() => {
    if (running) setAgentModeMenuOpen(false);
  }, [running]);

  const updateRun = (id: number, update: Partial<AgentRun>) => {
    setRuns((items) => items.map((run) => run.id === id ? { ...run, ...update } : run));
  };

  const updateActivity = (runIdValue: number, activity: AiAgentActivity) => {
    setRuns((items) => items.map((run) => {
      if (run.id !== runIdValue) return run;
      const index = run.activities.findIndex((item) => item.id === activity.id);
      const activities = index < 0
        ? [...run.activities, activity]
        : run.activities.map((item, itemIndex) => itemIndex === index ? activity : item);
      return { ...run, activities };
    }));
  };

  const runAgent = async (nextPrompt = prompt, excludedRunId?: number, existingRunId?: number, visiblePrompt = nextPrompt, runMode: AiAgentMode = agentMode, initialPlan: AiAgentPlanStep[] = []): Promise<void> => {
    const normalizedPrompt = nextPrompt.trim();
    const normalizedVisiblePrompt = visiblePrompt.trim() || normalizedPrompt;
    if (!normalizedPrompt || runsRef.current.some((run) => run.status === "running")) return;
    const id = existingRunId ?? runId.current++;
    const controller = new AbortController();
    const history = trimAiConversationHistory(runsRef.current
      .filter((run): run is AgentRun & { result: AiAgentResult } => run.id !== excludedRunId && run.status === "done" && Boolean(run.result))
      .map((run) => ({ user: run.request || run.prompt, assistant: run.result.summary, clarification: Boolean(run.result.clarification) })));
    activeController.current = controller;
    stickToLatestRef.current = true;
    setShowScrollToLatest(false);
    if (!runsRef.current.length) {
      setConversationState((state) => ({
        ...state,
        conversations: state.conversations.map((conversation) => conversation.id === state.activeId ? { ...conversation, title: conversationTitle(normalizedVisiblePrompt) } : conversation),
      }));
    }
    const nextRun: AgentRun = {
      id,
      prompt: normalizedVisiblePrompt,
      ...(normalizedPrompt !== normalizedVisiblePrompt ? { request: normalizedPrompt } : {}),
      mode: runMode,
      ...(initialPlan.length ? { initialPlan } : {}),
      activities: [],
      status: "running",
      progress: { phase: "preparing", label: "正在准备任务" },
      startedAt: Date.now(),
    };
    setRuns((items) => existingRunId === undefined
      ? [...items, nextRun]
      : items.map((run) => run.id === existingRunId ? nextRun : run));
    setPrompt("");
    let completedSuccessfully = false;
    try {
      const result = await onRunAgent({
        prompt: normalizedPrompt,
        history,
        agentMode: runMode,
        ...(initialPlan.length ? { initialPlan } : {}),
        onActivity: (activity) => updateActivity(id, activity),
        onProgress: (progress) => updateRun(id, { progress }),
        permissionMode: getAiAgentPermissionMode(),
        onPermissionRequest: (request) => new Promise<boolean>((resolve) => {
          let settled = false;
          const finish = (approved: boolean) => {
            if (settled) return;
            settled = true;
            controller.signal.removeEventListener("abort", cancel);
            permissionResolvers.current.delete(id);
            updateRun(id, { permission: undefined });
            resolve(approved);
          };
          const cancel = () => finish(false);
          permissionResolvers.current.set(id, finish);
          updateRun(id, { permission: request });
          controller.signal.addEventListener("abort", cancel, { once: true });
          if (controller.signal.aborted) cancel();
        }),
        signal: controller.signal,
      });
      const completedRuns: AgentRun[] = runsRef.current.map((run) => {
        if (run.id !== id) return run;
        const last = run.activities.at(-1);
        const activities = last?.kind === "message" && last.title.trim() === result.summary.trim()
          ? run.activities.slice(0, -1)
          : run.activities;
        return { ...run, status: "done", result, activities, progress: undefined, permission: undefined, finishedAt: Date.now() };
      });
      setRuns(() => completedRuns);
      completedSuccessfully = true;
      if (result.taskChange?.afterActiveSceneId && result.taskChange.afterActiveSceneId !== conversationScope) {
        const title = activeConversation?.title === "新对话" ? conversationTitle(normalizedVisiblePrompt) : activeConversation?.title || conversationTitle(normalizedVisiblePrompt);
        queueMicrotask(() => storeTransferredConversation(result.taskChange!.afterActiveSceneId, title, completedRuns));
      }
    } catch (error) {
      if (controller.signal.aborted) updateRun(id, { status: "stopped", error: undefined, permission: undefined, finishedAt: Date.now() });
      else updateRun(id, { status: "error", error: errorMessage(error), permission: undefined, finishedAt: Date.now() });
    } finally {
      if (activeController.current === controller) activeController.current = null;
      const redirect = redirectRef.current;
      if (redirect) {
        redirectRef.current = null;
        queueMicrotask(() => void runAgent(redirect.request, undefined, undefined, redirect.prompt, redirect.mode, redirect.initialPlan));
      } else if (completedSuccessfully) {
        const next = runsRef.current.find((run) => run.status === "queued");
        if (next) queueMicrotask(() => void runAgent(next.request || next.prompt, undefined, next.id, next.prompt, next.mode, next.initialPlan));
      }
    }
  };

  const enqueuePrompt = () => {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) return;
    if (!runsRef.current.some((run) => run.status === "running")) {
      void runAgent(normalizedPrompt);
      return;
    }
    setRuns((items) => [...items, { id: runId.current++, prompt: normalizedPrompt, mode: agentMode, activities: [], status: "queued" }]);
    setPrompt("");
  };

  const redirectAgent = () => {
    const correction = prompt.trim();
    const current = runsRef.current.find((run) => run.status === "running");
    if (!correction || !current || !activeController.current) return;
    redirectRef.current = {
      request: `${current.request || current.prompt}\n\n用户在任务执行过程中补充或更正：\n${correction}`,
      prompt: correction,
      mode: current.mode,
      ...(current.initialPlan?.length ? { initialPlan: current.initialPlan } : {}),
    };
    setPrompt("");
    activeController.current.abort();
  };

  const startQueuedRun = (run: AgentRun) => void runAgent(run.request || run.prompt, undefined, run.id, run.prompt, run.mode, run.initialPlan);
  const executePlan = (run: AgentRun) => {
    const result = run.result;
    if (running || result?.mode !== "plan" || !result.planPrompt || result.clarification) return;
    setAgentMode("agent");
    void runAgent(buildPlanExecutionRequest(result.planPrompt, result.summary), undefined, undefined, "执行计划", "agent", createInitialTaskPlan(extractPlanSteps(result.summary)));
  };
  const resumeRun = (run: AgentRun) => {
    const resumedPlan = prepareTaskPlanForResume(run.progress?.taskPlan || []);
    if (running || resumedPlan.length < 2) return;
    setAgentMode("agent");
    void runAgent(buildTaskResumeRequest(run.request || run.prompt, resumedPlan), undefined, undefined, "继续执行", "agent", resumedPlan);
  };
  const removeQueuedRun = (id: number) => setRuns((items) => items.filter((run) => run.id !== id || run.status !== "queued"));
  const respondToPermission = (id: number, approved: boolean) => permissionResolvers.current.get(id)?.(approved);

  const stopAgent = () => {
    redirectRef.current = null;
    activeController.current?.abort();
  };

  const handleThreadScroll = () => {
    const thread = threadRef.current;
    if (!thread) return;
    const atLatest = isNearLatestScroll(thread.scrollTop, thread.clientHeight, thread.scrollHeight);
    stickToLatestRef.current = atLatest;
    setShowScrollToLatest(!atLatest);
  };

  const scrollToLatest = () => {
    const thread = threadRef.current;
    if (!thread) return;
    stickToLatestRef.current = true;
    thread.scrollTop = thread.scrollHeight;
    setShowScrollToLatest(false);
  };

  const startConversation = () => {
    if (running) return;
    setConversationMenuOpen(false);
    if (!runs.length) {
      promptRef.current?.focus();
      return;
    }
    const conversation = createConversation();
    setConversationState((state) => ({
      activeId: conversation.id,
      conversations: [...state.conversations, conversation].slice(-maxStoredConversations),
    }));
    setPrompt("");
    requestAnimationFrame(() => promptRef.current?.focus());
  };

  const clearConversation = async () => {
    if (running || !runs.length || !(await onClearConversationConfirm())) return;
    setConversationState((state) => ({
      ...state,
      conversations: state.conversations.map((conversation) => conversation.id === state.activeId
        ? { ...conversation, title: "新对话", runs: [], updatedAt: Date.now() }
        : conversation),
    }));
    setPrompt("");
    setConversationMenuOpen(false);
    requestAnimationFrame(() => promptRef.current?.focus());
  };

  const switchConversation = (id: string) => {
    if (running || !conversationState.conversations.some((conversation) => conversation.id === id)) return;
    setConversationMenuOpen(false);
    if (id === conversationState.activeId) return;
    setConversationState((state) => ({ ...state, activeId: id }));
    setPrompt("");
    requestAnimationFrame(() => promptRef.current?.focus());
  };

  return <section className="ai-assistant" aria-label="AI 编程助手">
    <header className="ai-assistant-header">
      <div className="ai-assistant-title"><span className="ai-assistant-icon"><Sparkles size={16}/></span><strong>AI 编程助手</strong><small title={activeConversation?.title}>{activeConversation?.title || "新对话"}</small></div>
      <div className="ai-assistant-actions">
        {conversationPersistenceFailed && <span className="ai-conversation-persistence-warning" role="status" title="AI 对话记录未能保存，请清理部分历史记录后重试"><AlertCircle size={14}/><span>记录未保存</span></span>}
        <button type="button" disabled={running} onClick={startConversation} title="新建对话" aria-label="新建对话"><MessageSquarePlus size={16}/></button>
        <div className="ai-conversation-menu-anchor" ref={conversationMenuRef}>
          <button type="button" className={conversationMenuOpen ? "active" : ""} disabled={running} onClick={() => setConversationMenuOpen((open) => !open)} title="会话记录" aria-label="会话记录" aria-haspopup="menu" aria-expanded={conversationMenuOpen}><MessagesSquare size={16}/></button>
          {conversationMenuOpen && <div className="ai-conversation-menu" role="menu" aria-label="AI 会话记录">
            <div className="ai-conversation-menu-list">{conversationState.conversations.map((conversation) => {
              const selected = conversation.id === conversationState.activeId;
              return <button type="button" role="menuitemradio" aria-checked={selected} className={selected ? "selected" : ""} key={conversation.id} onClick={() => switchConversation(conversation.id)}><span>{conversation.title}</span>{selected && <Check size={14}/>}</button>;
            })}</div>
            <button type="button" className="ai-conversation-clear" role="menuitem" disabled={!runs.length} onClick={clearConversation}><Trash2 size={14}/><span>清空当前对话</span></button>
          </div>}
        </div>
        <button type="button" onClick={onOpenSettings} title="AI 模型设置" aria-label="AI 模型设置"><Settings size={16}/></button>
        <button type="button" onClick={onClose} title="关闭 AI 编程助手" aria-label="关闭 AI 编程助手"><X size={16}/></button>
      </div>
    </header>
    <div className="ai-thread-shell">
      <div ref={threadRef} className={`ai-thread ${runs.length ? "has-runs" : ""}`} aria-live="polite" onScroll={handleThreadScroll}>
        {!runs.length && <div className="ai-agent-empty" aria-label="指令示例">
          {suggestions.map((suggestion) => <button key={suggestion} onClick={() => void runAgent(suggestion)}><Sparkles size={15}/><span>{suggestion}</span></button>)}
        </div>}
        {runs.map((run) => <article className="ai-agent-run" key={run.id}>
          <p className="ai-agent-prompt">{run.prompt}</p>
          <div className="ai-agent-activity-list">
          {groupAgentActivities(run.activities).map((entry) => entry.kind === "group"
            ? <details className="ai-agent-tool-group" key={entry.id}>
              <summary><ChevronRight className="ai-agent-tool-chevron" size={14}/><Check size={14}/><strong>{entry.summary}</strong></summary>
              <div>{entry.activities.map((activity) => <span key={activity.id}><span className="ai-agent-tool-icon">{activityIcon(activity.toolName)}</span><strong>{activity.title}</strong>{activity.detail && <small>{activity.detail}</small>}</span>)}</div>
            </details>
            : <AgentActivityRow key={entry.activity.id} activity={entry.activity} runId={run.id} onRevealCodeChange={onRevealCodeChange} onRevealProblem={onRevealProblem} onUndoCodeChange={onUndoCodeChange} onApplyCodeChange={onApplyCodeChange} onUpdate={updateActivity}/>)}
          {run.status === "done" && run.result?.taskPlan?.length ? <AgentTaskPlan steps={run.result.taskPlan} collapsed/> : null}
          {(run.status === "error" || run.status === "stopped") && run.progress?.taskPlan?.length ? <AgentTaskPlan steps={run.progress.taskPlan}/> : null}
          {run.permission && <AgentPermissionPrompt request={run.permission} onRespond={(approved) => respondToPermission(run.id, approved)}/>}
          {run.status === "running" && <AgentRunProgress progress={run.progress} elapsed={formatAgentElapsed(run.startedAt, clock)}/>}
          {run.status === "done" && <div className={`ai-agent-response ${run.result?.clarification ? "awaiting-user" : ""}`}>
            <div className="ai-agent-response-header">
              <span>{run.result?.clarification
                ? <><MessagesSquare size={14}/>等待回复</>
                : run.result?.mode === "plan"
                  ? <><ListChecks size={14}/>计划完成</>
                  : run.result?.intent === "chat"
                    ? <><MessagesSquare size={14}/>回复</>
                    : run.result?.intent === "inspect"
                      ? <><Eye size={14}/>已分析</>
                  : <><Check size={14}/>完成</>}</span>
              <small>{agentRunMeta(run)}</small>
              {run.result?.taskChange && <span className="ai-task-change-actions">
                <button disabled={!run.taskUndone} title={run.taskUndone ? "重新应用本次任务" : "任务修改已应用"} aria-label={run.taskUndone ? "重新应用本次任务" : "任务修改已应用"} onClick={() => { if (run.result?.taskChange && onApplyTaskChange(run.result.taskChange)) updateRun(run.id, { taskUndone: false }); }}><Check size={13}/></button>
                <button disabled={run.taskUndone} title={run.taskUndone ? "任务修改已撤销" : "撤销本次任务"} aria-label={run.taskUndone ? "任务修改已撤销" : "撤销本次任务"} onClick={() => { if (run.result?.taskChange && onUndoTaskChange(run.result.taskChange)) updateRun(run.id, { taskUndone: true }); }}><Undo2 size={13}/></button>
              </span>}
              {run.result?.mode === "plan" && run.result.planPrompt && !run.result.clarification && <button type="button" className="ai-plan-execute" disabled={running} onClick={() => executePlan(run)} title="由 Agent 按此计划执行"><Play size={13}/><span>执行计划</span></button>}
              <AiResponseActions markdown={run.result?.summary || "完成"} disabled={running} onRetry={() => void runAgent(run.request || run.prompt, run.id, undefined, run.prompt, run.mode, run.initialPlan)}/>
            </div>
            <MarkdownContent>{run.result?.summary || "完成"}</MarkdownContent>
          </div>}
          {run.status === "queued" && <div className="ai-agent-queued"><Clock3 size={14}/><span>等待当前任务完成</span><span className="ai-agent-queued-actions"><button disabled={running} title="立即执行" aria-label="立即执行排队任务" onClick={() => startQueuedRun(run)}><Play size={13}/></button><button title="移出队列" aria-label="移出任务队列" onClick={() => removeQueuedRun(run.id)}><X size={14}/></button></span></div>}
          {run.status === "stopped" && <div className="ai-agent-finished stopped"><Square size={12}/><span>已停止{run.startedAt ? ` · ${formatAgentElapsed(run.startedAt, run.finishedAt)}` : ""}</span><span className="ai-run-failure-actions">{(run.progress?.taskPlan?.length || 0) >= 2 ? <button className="ai-run-resume" disabled={running} title={taskPlanResumeLabel(run.progress?.taskPlan || [])} aria-label={taskPlanResumeLabel(run.progress?.taskPlan || [])} onClick={() => resumeRun(run)}><Play size={13}/></button> : <button className="ai-run-retry" disabled={running} title="重新执行此任务" aria-label="重新执行此任务" onClick={() => void runAgent(run.request || run.prompt, run.id, undefined, run.prompt, run.mode, run.initialPlan)}><RefreshCw size={13}/></button>}</span></div>}
          </div>
          {run.error && <div className="ai-agent-error"><span>{run.error}{run.startedAt ? <small>{formatAgentElapsed(run.startedAt, run.finishedAt)}</small> : null}</span><span className="ai-agent-error-actions">{(run.progress?.taskPlan?.length || 0) >= 2 ? <button className="ai-run-resume" disabled={running} onClick={() => resumeRun(run)} title={taskPlanResumeLabel(run.progress?.taskPlan || [])} aria-label={taskPlanResumeLabel(run.progress?.taskPlan || [])}><Play size={14}/></button> : <button disabled={running} onClick={() => void runAgent(run.request || run.prompt, run.id, undefined, run.prompt, run.mode, run.initialPlan)} title="重新执行此任务" aria-label="重新执行此任务"><RefreshCw size={15}/></button>}<button onClick={onOpenSettings} title="AI 模型设置" aria-label="AI 模型设置"><Settings size={15}/></button></span></div>}
        </article>)}
      </div>
      {showScrollToLatest && runs.length > 0 && <button type="button" className="ai-scroll-to-latest" onClick={scrollToLatest} title="回到最新消息" aria-label="回到最新消息"><ArrowDown size={16}/></button>}
    </div>
    <div className="ai-composer">
      <div className="ai-composer-input">
        <textarea ref={promptRef} value={prompt} onChange={(event) => setPrompt(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); running ? enqueuePrompt() : void runAgent(); } }} placeholder={running ? "输入后续指令..." : awaitingClarification ? "输入序号或补充要求..." : agentMode === "plan" ? "描述需要规划的任务..." : "输入任务..."} aria-label="AI 指令" rows={2}/>
        <div className="ai-composer-footer">
          <div className="ai-agent-mode-menu" ref={agentModeMenuRef}>
            <button ref={agentModeTriggerRef} type="button" className={`ai-agent-mode-trigger ${agentModeMenuOpen ? "open" : ""}`} disabled={running} onClick={() => setAgentModeMenuOpen((open) => !open)} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setAgentModeMenuOpen(true); } }} title={agentMode === "plan" ? "只读分析并制定计划" : "直接执行任务"} aria-label={`智能体模式：${agentMode === "plan" ? "计划" : "智能体"}`} aria-haspopup="menu" aria-expanded={agentModeMenuOpen}>
              {agentMode === "plan" ? <ListChecks size={13}/> : <Sparkles size={13}/>}<span>{agentMode === "plan" ? "计划" : "智能体"}</span><ChevronDown size={13}/>
            </button>
            {agentModeMenuOpen && <div className="ai-agent-mode-options" role="menu" aria-label="选择智能体模式">
              <button type="button" role="menuitemradio" aria-checked={agentMode === "agent"} className={agentMode === "agent" ? "selected" : ""} onClick={() => { setAgentMode("agent"); setAgentModeMenuOpen(false); requestAnimationFrame(() => agentModeTriggerRef.current?.focus()); }}><Sparkles size={14}/><span>智能体</span>{agentMode === "agent" && <Check size={13}/>}</button>
              <button type="button" role="menuitemradio" aria-checked={agentMode === "plan"} className={agentMode === "plan" ? "selected" : ""} onClick={() => { setAgentMode("plan"); setAgentModeMenuOpen(false); requestAnimationFrame(() => agentModeTriggerRef.current?.focus()); }}><ListChecks size={14}/><span>计划</span>{agentMode === "plan" && <Check size={13}/>}</button>
            </div>}
          </div>
          <span className="ai-composer-scope" title={`${sceneName} · ${lineCount} 行代码`}><Code2 size={14}/><span>{sceneName}</span><small>{lineCount} 行</small></span>
          <span className="ai-composer-footer-spacer"/>
          {running
            ? <><button className="queue" onClick={enqueuePrompt} disabled={!prompt.trim()} title="当前任务完成后执行" aria-label="将指令加入队列"><Send size={15}/></button><button className="redirect" onClick={redirectAgent} disabled={!prompt.trim()} title="停止并按此要求重新执行当前任务" aria-label="调整当前任务"><CornerDownLeft size={15}/></button><button className="stop" onClick={stopAgent} title="停止智能体" aria-label="停止智能体"><Square size={13}/></button></>
            : <button onClick={() => void runAgent()} disabled={!prompt.trim()} title="发送" aria-label="发送"><Send size={16}/></button>}
        </div>
      </div>
    </div>
  </section>;
}
