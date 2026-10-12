import { isValidElement, memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, ArrowDown, Bug, Check, ChevronDown, ChevronRight, Clock3, Code2, Compass, Copy, Film, Hammer, ImageIcon, ListChecks, LoaderCircle, MessageSquarePlus, MessagesSquare, Play, RefreshCw, SearchCheck, Send, Settings, ShieldQuestion, Sparkles, Square, Terminal, Trash2, Undo2, X } from "lucide-react";
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
import rehypeKatex, { type Options as RehypeKatexOptions } from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { createCodeChangePreview } from "./agentV2/codeChanges";
import type { AgentTokenUsage, AiAgentActivity, AiAgentExecution, AiAgentMode, AiAgentPermissionRequest, AiAgentPlanStep, AiAgentProgress, AiAgentResult, AiAgentToolName, AiCodeChangeSnapshot, AiConversationTurn, AiFollowUpSuggestion, AiTaskChangeSnapshot } from "./agentV2/types";
import { getAiAgentPermissionMode, getAiReasoningEffort, saveAiReasoningEffort, type AiAgentPermissionMode, type AiReasoningEffort } from "./aiConfig";
import { buildAiConversationHistory } from "./aiConversationContext";
import { stripManagedAudioMetadataForDisplay } from "./managedAudioMetadata";
import { stripAgentFollowUpMarkup } from "./agentV2/followUps";
import { nextStreamRevealLength, subscribeLiveStream } from "./agentV2/liveStream";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);

const markdownKatexOptions: RehypeKatexOptions = {
  strict: (errorCode) => ["unicodeTextInMathMode", "unknownSymbol"].includes(errorCode) ? "ignore" : "warn",
};

type RunAgentArgs = {
  prompt: string;
  history: AiConversationTurn[];
  conversationId: string;
  agentMode: AiAgentMode;
  reasoningEffort: AiReasoningEffort;
  initialPlan?: AiAgentPlanStep[];
  onActivity: (activity: AiAgentActivity) => void;
  onProgress: (progress: AiAgentProgress) => void;
  permissionMode: AiAgentPermissionMode;
  onPermissionRequest: (request: AiAgentPermissionRequest) => Promise<boolean>;
  signal: AbortSignal;
};

type AiAssistantPanelProps = {
  lineCount: number;
  contextName: string;
  conversationScope: string;
  conversationMigrationScopes?: string[];
  workspaceEpoch: number;
  onOpenSettings: () => void;
  onClose: () => void;
  onRunAgent: (args: RunAgentArgs) => Promise<AiAgentResult>;
  onRevealCodeChange: (diff: string, line?: number, change?: AiCodeChangeSnapshot) => void;
  onRevealProblem: (line: number) => void;
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

export type AiConversationState = {
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
const reasoningEffortLabels: Record<AiReasoningEffort, string> = {
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "极高",
};

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

function readConversationState(scope: string): AiConversationState {
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

export function mergeAiConversationStates(primary: AiConversationState, imported: AiConversationState[]): AiConversationState {
  const candidates = [
    ...primary.conversations.filter((conversation) => conversation.runs.length),
    ...imported.flatMap((state) => state.conversations.filter((conversation) => conversation.runs.length)),
  ];
  const seen = new Set<string>();
  const conversations = candidates
    .filter((conversation) => {
      if (seen.has(conversation.id)) return false;
      seen.add(conversation.id);
      return true;
    })
    .sort((left, right) => left.updatedAt - right.updatedAt)
    .slice(-maxStoredConversations);
  if (!conversations.length) return primary;
  const primaryActive = conversations.some((conversation) => conversation.id === primary.activeId);
  return { activeId: primaryActive ? primary.activeId : conversations.at(-1)!.id, conversations };
}

function loadConversationState(scope: string, migrationScopes: string[] = []): AiConversationState {
  const primary = readConversationState(scope);
  const imported = [...new Set(migrationScopes.filter((migrationScope) => migrationScope && migrationScope !== scope))].map(readConversationState);
  return imported.length ? mergeAiConversationStates(primary, imported) : primary;
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

export const aiAssistantSuggestions = [
  { label: "探索并理解当前代码", prompt: "探索并理解当前代码" },
  { label: "创建程序或动画", prompt: "创建一个新的程序或动画" },
  { label: "检查代码并提出改进", prompt: "检查当前代码并提出可执行的改进建议" },
  { label: "修复问题和错误", prompt: "检查并修复当前代码中的问题和错误" },
] as const;

export function buildAiFollowUpSuggestions(run: Pick<AgentRun, "activities">, contextName: string): AiFollowUpSuggestion[] {
  const context = contextName.trim() || "当前工作区";
  const toolNames = new Set(run.activities.flatMap((activity) => activity.toolName ? [activity.toolName] : []));
  if (["render_manim", "render_image", "inspect_rendered_output"].some((name) => toolNames.has(name))) {
    return [
      { label: `检查 ${context} 的渲染结果`, prompt: `检查 ${context} 的渲染结果` },
      { label: `继续优化 ${context} 的动画`, prompt: `继续优化 ${context} 的动画效果` },
      { label: `修改 ${context} 的视觉效果`, prompt: `修改 ${context} 的视觉效果` },
    ];
  }
  if (["add_workspace_block", "apply_workspace", "search_blocks", "get_workspace"].some((name) => toolNames.has(name))) {
    return [
      { label: `检查 ${context} 的积木连接`, prompt: `检查 ${context} 的积木连接和生成代码` },
      { label: `继续完善 ${context}`, prompt: `继续完善 ${context} 的图形化程序` },
      { label: `查看 ${context} 的可用积木`, prompt: `查看 ${context} 中还可以使用的相关积木` },
    ];
  }
  if (["edit_code", "insert_statements", "replace_function_body", "add_import", "replace_code"].some((name) => toolNames.has(name)) || run.activities.some((activity) => activity.codeChange)) {
    return [
      { label: `检查 ${context} 的代码`, prompt: `检查 ${context} 的代码是否还有问题` },
      { label: `运行 ${context} 验证结果`, prompt: `运行 ${context} 验证刚才的修改` },
      { label: `继续完善 ${context}`, prompt: `继续完善 ${context} 的当前实现` },
    ];
  }
  return [
    { label: `检查 ${context}`, prompt: `检查 ${context} 的当前状态` },
    { label: `继续完善 ${context}`, prompt: `继续完善 ${context}` },
    { label: `查看 ${context} 的可用能力`, prompt: `查看 ${context} 当前可用的工具和能力` },
  ];
}

export function getAiFollowUpSuggestions(run: Pick<AgentRun, "activities" | "result">, contextName: string): AiFollowUpSuggestion[] {
  const fallback = buildAiFollowUpSuggestions(run, contextName);
  const generated = run.result?.followUpSuggestions || [];
  const seen = new Set<string>();
  return [...generated, ...fallback].filter((suggestion) => {
    if (!suggestion.prompt || seen.has(suggestion.prompt)) return false;
    seen.add(suggestion.prompt);
    return true;
  }).slice(0, 3);
}

export function applyAiAssistantSuggestion(prompt: string, setPrompt: (value: string) => void, focusPrompt: () => void, submitPrompt?: (value: string) => void) {
  setPrompt(prompt);
  if (submitPrompt) submitPrompt(prompt);
  else focusPrompt();
}

export function shouldShowAiFollowUpSuggestions(runs: Array<Pick<AgentRun, "status">>) {
  const status = runs.at(-1)?.status;
  return status === "done" || status === "error" || status === "stopped";
}

export function AiAssistantSuggestionButtons({ onSelect, suggestions = aiAssistantSuggestions, className = "" }: { onSelect: (prompt: string) => void; suggestions?: readonly AiFollowUpSuggestion[]; className?: string }) {
  const isWelcome = className.split(/\s+/).includes("welcome");
  const icons = [Compass, Hammer, SearchCheck, Bug] as const;
  return <div className={`ai-agent-suggestions${className ? ` ${className}` : ""}`} aria-label="建议任务">
    {suggestions.map((suggestion, index) => {
      const Icon = icons[index % icons.length];
      return <button type="button" key={suggestion.prompt} onClick={() => onSelect(suggestion.prompt)}>{isWelcome && <Icon className="ai-agent-suggestion-icon" size={15}/>}<span>{suggestion.label}</span></button>;
    })}
  </div>;
}

export function AiAssistantWelcome({ onSelect, contextName, lineCount }: { onSelect: (prompt: string) => void; contextName?: string; lineCount?: number }) {
  const documentName = contextName?.trim() || "当前文档";
  const documentSize = lineCount && lineCount > 0 ? `${lineCount} 行代码` : "空文档";
  return <div className="ai-agent-empty" aria-label="AI 助手初始化" title={`${documentName} · ${documentSize}`}>
    <span className="ai-agent-empty-mark" aria-hidden="true"><Sparkles size={18}/></span>
    <h2 className="ai-agent-empty-title">今天想完成什么？</h2>
    <AiAssistantSuggestionButtons onSelect={onSelect} className="welcome"/>
  </div>;
}

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

const autoHighlightLanguages = ["bash", "css", "javascript", "json", "markdown", "python", "typescript", "xml"];
const highlightMaxChars = 20_000;
const highlightCacheLimit = 48;
const highlightCache = new Map<string, string | null>();

function codeLanguage(className?: string): { id: string; label: string } {
  const requested = className?.match(/(?:^|\s)language-([^\s]+)/)?.[1]?.toLowerCase() || "";
  const id = codeLanguageAliases[requested] || requested;
  return { id, label: codeLanguageLabels[id] || requested || "Text" };
}

export function highlightAssistantCode(code: string, language: string): string | null {
  const normalizedLanguage = language.trim().toLowerCase();
  if (code.length > highlightMaxChars) return null;
  const cacheKey = `${normalizedLanguage}\0${code}`;
  const cached = highlightCache.get(cacheKey);
  if (cached !== undefined) {
    highlightCache.delete(cacheKey);
    highlightCache.set(cacheKey, cached);
    return cached;
  }
  let value: string | null = null;
  if (normalizedLanguage) {
    if (hljs.getLanguage(normalizedLanguage)) value = hljs.highlight(code, { language: normalizedLanguage, ignoreIllegals: true }).value;
  } else {
    const detected = hljs.highlightAuto(code, autoHighlightLanguages);
    value = detected.relevance > 0 ? detected.value : null;
  }
  highlightCache.set(cacheKey, value);
  if (highlightCache.size > highlightCacheLimit) {
    const oldest = highlightCache.keys().next().value;
    if (oldest !== undefined) highlightCache.delete(oldest);
  }
  return value;
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
  return stripAgentFollowUpMarkup(outerFence?.[2] ?? markdown);
}

export const MarkdownContent = memo(function MarkdownContent({ children, className = "" }: { children: string; className?: string }) {
  return <div className={`ai-markdown ${className}`}><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, markdownKatexOptions]]} components={{ pre: MarkdownCodeBlock, a: MarkdownLink }}>{normalizeAssistantMarkdown(children)}</ReactMarkdown></div>;
});

export function activityDisplayText(activity: Pick<AiAgentActivity, "title" | "markdown">): string {
  return stripAgentFollowUpMarkup(activity.markdown?.trim() || activity.title || "");
}

const LiveStreamText = memo(function LiveStreamText({ id }: { id: string }) {
  const nodeRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    let shown = "";
    let target = "";
    let frame: number | null = null;
    const paint = () => {
      frame = null;
      const next = stripAgentFollowUpMarkup(target);
      if (shown.startsWith(next) || !next.startsWith(shown)) shown = next;
      else shown = next.slice(0, nextStreamRevealLength(shown.length, next.length));
      node.textContent = shown;
      if (shown.length < next.length) frame = requestAnimationFrame(paint);
    };
    const unsubscribe = subscribeLiveStream(id, (value) => {
      target = value;
      if (frame === null) frame = requestAnimationFrame(paint);
    });
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [id]);
  return <div ref={nodeRef} className="ai-markdown ai-markdown-live ai-markdown-stream" />;
});

export function StreamingRichText({ id, text, live = false }: { id?: string; text: string; live?: boolean }) {
  if (!live) {
    if (!text.trim()) return null;
    return <MarkdownContent>{text}</MarkdownContent>;
  }
  if (!id) return <div className="ai-markdown ai-markdown-live ai-markdown-stream">{stripAgentFollowUpMarkup(text)}</div>;
  return <LiveStreamText id={id} />;
}

function codeDiffStartLine(result?: string): number | null {
  const line = Number(result?.match(/^@@ 第 (\d+) 行 @@/)?.[1]);
  return Number.isInteger(line) && line > 0 ? line : null;
}

function isCodeChangeTool(toolName?: AiAgentToolName) {
  return toolName === "rename_scene" || toolName === "replace_code" || toolName === "edit_code" || toolName === "insert_statements" || toolName === "replace_function_body" || toolName === "add_import" || toolName === "add_voiceover" || toolName === "add_synchronized_voiceover";
}

function isAssistantReplyActivity(activity: AiAgentActivity) {
  return activity.kind === "message" && (!activity.channel || activity.channel === "message");
}

export type AgentRunBodyBlock =
  | { kind: "timeline"; id: string; entries: AgentActivityEntry[] }
  | { kind: "reply"; activity: AiAgentActivity };

export function composeAgentRunBody(activities: AiAgentActivity[], hiddenToolName?: AiAgentToolName): AgentRunBodyBlock[] {
  const blocks: AgentRunBodyBlock[] = [];
  let timeline: AgentActivityEntry[] = [];
  const flushTimeline = () => {
    if (!timeline.length) return;
    blocks.push({ kind: "timeline", id: `timeline-${timeline.map((entry) => entry.kind === "group" ? entry.id : entry.activity.id).join("-").slice(0, 80)}`, entries: timeline });
    timeline = [];
  };
  for (const entry of groupAgentActivities(activities, hiddenToolName)) {
    if (entry.kind === "activity" && isAssistantReplyActivity(entry.activity)) {
      flushTimeline();
      blocks.push({ kind: "reply", activity: entry.activity });
    } else {
      timeline.push(entry);
    }
  }
  flushTimeline();
  return blocks;
}

export function groupAgentActivities(activities: AiAgentActivity[], hiddenToolName?: AiAgentToolName): AgentActivityEntry[] {
  const entries: AgentActivityEntry[] = [];
  let compact: AiAgentActivity[] = [];
  const flushCompact = () => {
    if (compact.length === 1) entries.push({ kind: "activity", activity: compact[0] });
    else if (compact.length > 1) entries.push({ kind: "group", id: compact.map((activity) => activity.id).join("-"), summary: summarizeAgentActivities(compact), activities: compact });
    compact = [];
  };
  const observedToolNames = new Set(activities
    .filter((activity) => (activity.channel === "observation" || activity.channel === "verification") && activity.toolName)
    .map((activity) => activity.toolName));
  const orderedActivities = activities.filter((activity) => activity.channel !== "decision"
    && activity.toolName !== "activate_tool_group"
    && !(activity.kind === "tool" && activity.status === "done" && activity.toolName && observedToolNames.has(activity.toolName))
    && !(hiddenToolName && activity.kind === "tool" && activity.status === "running" && activity.toolName === hiddenToolName));
  for (const thinking of orderedActivities.filter((activity) => activity.channel === "thinking")) {
    const round = thinking.id.match(/^thinking-(.+)$/)?.[1];
    if (!round) continue;
    const thinkingIndex = orderedActivities.indexOf(thinking);
    const messageIndex = orderedActivities.findIndex((activity) => activity.id === `message-${round}` && (!activity.channel || activity.channel === "message"));
    if (thinkingIndex < 0 || messageIndex < 0 || thinkingIndex < messageIndex) continue;
    orderedActivities.splice(thinkingIndex, 1);
    orderedActivities.splice(orderedActivities.findIndex((activity) => activity.id === `message-${round}`), 0, thinking);
  }
  for (const activity of orderedActivities) {
    const isCompact = activity.kind === "tool" && activity.status === "done" && !successfulToolVerificationTitle(activity) && !formatAgentToolResult(activity) && !activity.codeChange && !activity.execution;
    if (isCompact) compact.push(activity);
    else {
      flushCompact();
      entries.push({ kind: "activity", activity });
    }
  }
  flushCompact();
  return entries;
}

export function finalizeAgentRunActivities(activities: AiAgentActivity[], status: "error" | "stopped"): AiAgentActivity[] {
  return activities.map((activity) => activity.status === "running" ? { ...activity, status } : activity);
}

export function removeFinalMessageActivity(activities: AiAgentActivity[], summary: string): AiAgentActivity[] {
  const normalizedSummary = summary.replace(/\r\n/g, "\n").trim();
  if (!normalizedSummary) return activities;
  return activities.filter((activity) => {
    const isAssistantMessage = activity.kind === "message" && (!activity.channel || activity.channel === "message");
    return !isAssistantMessage || activity.title.replace(/\r\n/g, "\n").trim() !== normalizedSummary;
  });
}

function agentToolCategory(toolName?: AiAgentToolName | "inspect_rendered_video"): AgentToolCategory {
  if (!toolName) return "other";
  if (["get_context", "list_scenes", "get_scene", "list_resources", "get_resource", "get_voiceover_context", "inspect_python_structure", "inspect_plugin_api", "list_installed_plugins", "read_plugin_draft_file"].includes(toolName)) return "explore";
  if (["create_document", "switch_document", "rename_document", "delete_document", "create_scene", "switch_scene", "rename_scene", "delete_scene", "replace_code", "edit_code", "insert_statements", "replace_function_body", "add_import", "add_voiceover", "add_synchronized_voiceover", "format_code", "undo_code", "redo_code", "create_plugin_plan", "create_plugin_draft", "update_plugin_draft", "import_installed_plugin_draft"].includes(toolName)) return "edit";
  if (["validate_scene", "check_resources", "check_dependencies", "check_voiceover", "check_code", "inspect_rendered_output", "inspect_rendered_video", "validate_plugin_draft", "run_plugin_draft_checks"].includes(toolName)) return "verify";
  if (["run_project", "render_manim", "get_execution_state", "wait", "stop_execution", "install_plugin_draft"].includes(toolName)) return "execute";
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

export function nextAiThreadScrollTop(scrollTop: number, deltaY: number, clientHeight: number, scrollHeight: number): number {
  const maximum = Math.max(0, scrollHeight - clientHeight);
  const next = scrollTop + deltaY;
  return Math.max(0, Math.min(maximum, Number.isFinite(next) ? next : scrollTop));
}

export type AiThreadScrollbarInput = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  trackHeight: number;
};

export function getAiThreadScrollbarMetrics(input: AiThreadScrollbarInput): { visible: boolean; thumbHeight: number; thumbTop: number; maxThumbTop: number } {
  const trackHeight = Math.max(0, input.trackHeight);
  const scrollHeight = Math.max(0, input.scrollHeight);
  const clientHeight = Math.max(0, input.clientHeight);
  const maximumScrollTop = Math.max(0, scrollHeight - clientHeight);
  if (trackHeight <= 0 || maximumScrollTop <= 0) return { visible: false, thumbHeight: trackHeight, thumbTop: 0, maxThumbTop: 0 };
  const thumbHeight = Math.max(28, Math.min(trackHeight, trackHeight * clientHeight / scrollHeight));
  const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
  const progress = Math.max(0, Math.min(1, input.scrollTop / maximumScrollTop));
  return { visible: true, thumbHeight, thumbTop: maxThumbTop * progress, maxThumbTop };
}

type AiThreadWheelTarget = Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight"> & {
  addEventListener: (type: "wheel", listener: (event: WheelEvent) => void, options: AddEventListenerOptions) => void;
  removeEventListener: (type: "wheel", listener: (event: WheelEvent) => void) => void;
};

type AiNestedScrollTarget = Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight">;

function findNestedAiScrollTarget(target: EventTarget | null): AiNestedScrollTarget | null {
  if (!target || typeof (target as { closest?: unknown }).closest !== "function") return null;
  const candidate = (target as Element).closest(".ai-agent-thinking > .ai-markdown, .ai-agent-thinking > .ai-markdown-stream");
  return candidate ? candidate as AiNestedScrollTarget : null;
}

export function attachAiThreadWheelHandler(thread: AiThreadWheelTarget, onLeaveLatest: () => void): () => void {
  const handleWheel = (event: WheelEvent) => {
    event.stopPropagation();
    if (event.deltaY === 0) return;
    const deltaY = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * thread.clientHeight : event.deltaY;
    const nestedTarget = findNestedAiScrollTarget(event.target);
    if (nestedTarget) {
      const nextNestedScrollTop = nextAiThreadScrollTop(nestedTarget.scrollTop, deltaY, nestedTarget.clientHeight, nestedTarget.scrollHeight);
      if (nextNestedScrollTop !== nestedTarget.scrollTop) {
        event.preventDefault();
        nestedTarget.scrollTop = nextNestedScrollTop;
      }
      return;
    }
    const next = nextAiThreadScrollTop(thread.scrollTop, deltaY, thread.clientHeight, thread.scrollHeight);
    if (next === thread.scrollTop) {
      if (thread.scrollHeight > thread.clientHeight) event.preventDefault();
      return;
    }
    event.preventDefault();
    thread.scrollTop = next;
    onLeaveLatest();
  };
  thread.addEventListener("wheel", handleWheel, { passive: false });
  return () => thread.removeEventListener("wheel", handleWheel);
}

export function scrollThreadToLatest(thread: Pick<HTMLElement, "scrollTop" | "scrollHeight">, enabled: boolean): boolean {
  if (!enabled) return false;
  thread.scrollTop = thread.scrollHeight;
  return true;
}

export function shouldPersistConversationRuns(runs: Array<{ status: AgentRun["status"] }>): boolean {
  return !runs.some((run) => run.status === "running");
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
  return [elapsed, tokenCount].filter(Boolean).join(" · ");
}

export function agentTokenUsageTitle(usage?: AgentTokenUsage): string {
  if (!usage) return "";
  const parts = [
    `输入 ${Math.max(0, Math.floor(usage.prompt)).toLocaleString("zh-CN")} Token`,
    usage.cacheReportedRequests > 0
      ? `缓存命中 ${Math.max(0, Math.floor(usage.cached)).toLocaleString("zh-CN")} Token（${Math.round((usage.cacheHitRate || 0) * 100)}%）`
      : "供应商未提供缓存统计",
  ];
  if (usage.cacheReportedRequests > 0) parts.push(`未缓存 ${Math.max(0, Math.floor(usage.uncachedPrompt)).toLocaleString("zh-CN")} Token`);
  parts.push(`输出 ${Math.max(0, Math.floor(usage.completion)).toLocaleString("zh-CN")} Token`, `${usage.requests} 次请求`);
  return parts.join(" · ");
}

function parseAgentToolResult(value?: string): Record<string, unknown> | null {
  if (!value?.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function malformedStructuredMessage(text: string): string | null {
  const match = text.match(/"(?:error|message|diagnostic|warning)"\s*:\s*"((?:\\.|[^"\\])*)"/i)
    || text.match(/"(?:issues|errors)"\s*:\s*\[\s*"((?:\\.|[^"\\])*)"/i);
  if (!match) return null;
  try {
    const decoded = JSON.parse(`"${match[1]}"`) as unknown;
    return typeof decoded === "string" && decoded.trim() ? decoded.trim() : null;
  } catch {
    return match[1]?.trim() || null;
  }
}

function sanitizeAgentDisplayText(value?: string): string | null {
  const text = value?.trim();
  if (!text) return null;
  if (/[<＜][|｜]DSML[|｜]/i.test(text) || /[<＜][|｜](?:tool_calls?|invoke|parameter)[|｜]/i.test(text)) return "工具返回格式无效";
  if ((text.startsWith("{") || text.startsWith("[")) && !parseAgentToolResult(text)) {
    const message = malformedStructuredMessage(text);
    if (message) return message;
    if (text.includes("[结果已截断]") && /"(?:updated|created|installed|changed)"\s*:\s*true/i.test(text)) return null;
    return "工具返回格式无效";
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (/^Traceback \(most recent call last\):/i.test(lines[0] || "")) {
    const exception = [...lines].reverse().find((line) => /^[A-Za-z_][\w.]*(?:Error|Exception):\s*\S/.test(line));
    return exception || lines.at(-1) || "执行失败";
  }
  if (/^用户拒绝了(?:这次)?操作[。.]?$/.test(text)) return "已取消";
  return text;
}

function structuredAgentMessage(value: unknown): string | null {
  if (typeof value === "string") return sanitizeAgentDisplayText(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return structuredAgentMessage(record.message) || structuredAgentMessage(record.error);
}

const pluginWorkflowLabels: Record<string, string> = {
  create_plugin_plan: "\u63d2\u4ef6\u8ba1\u5212\u5df2\u5efa\u7acb",
  create_plugin_draft: "\u63d2\u4ef6\u8349\u7a3f\u5df2\u521b\u5efa",
  update_plugin_draft: "\u63d2\u4ef6\u8349\u7a3f\u5df2\u66f4\u65b0",
  validate_plugin_draft: "\u63d2\u4ef6\u9759\u6001\u68c0\u67e5\u901a\u8fc7",
  run_plugin_draft_checks: "\u63d2\u4ef6\u8fd0\u884c\u68c0\u67e5\u901a\u8fc7",
  install_plugin_draft: "\u63d2\u4ef6\u5df2\u5b89\u88c5\u5e76\u542f\u7528",
};

function formatPluginWorkflowResult(toolName: string | undefined, parsed: Record<string, unknown>): string | null {
  if (!toolName || !Object.prototype.hasOwnProperty.call(pluginWorkflowLabels, toolName)) return null;
  const validation = parsed.validation && typeof parsed.validation === "object" && !Array.isArray(parsed.validation)
    ? parsed.validation as Record<string, unknown>
    : undefined;
  const valid = parsed.valid === true || validation?.valid === true;
  if (parsed.installed === true) return pluginWorkflowLabels.install_plugin_draft;
  if (parsed.planned === true) return pluginWorkflowLabels.create_plugin_plan;
  if (parsed.created === true) return pluginWorkflowLabels.create_plugin_draft;
  if (parsed.updated === true) return pluginWorkflowLabels.update_plugin_draft;
  if (valid) return pluginWorkflowLabels[toolName];
  const issueSource = Array.isArray(parsed.issues) ? parsed.issues : Array.isArray(validation?.issues) ? validation.issues : [];
  const issues = issueSource
    .map(structuredAgentMessage).filter((item): item is string => Boolean(item));
  if (issues.length) return issues.join("\n");
  return null;
}

export function formatAgentRunError(value: string): string {
  const text = value.trim();
  if (/assistant message with ['"]tool_calls['"].*followed by tool messages/i.test(text)) return "模型返回的工具调用响应不完整，请重试。";
  const parsed = parseAgentToolResult(text);
  if (parsed) return structuredAgentMessage(parsed.error) || structuredAgentMessage(parsed.message) || "任务执行失败";
  const jsonStart = text.indexOf("{");
  if (jsonStart > 0) {
    try {
      const suffix = JSON.parse(text.slice(jsonStart)) as unknown;
      const message = structuredAgentMessage(suffix);
      if (message) return `${text.slice(0, jsonStart).trim()}${message}`;
    } catch {
      // Keep the original message when the suffix is not a complete JSON value.
    }
  }
  return sanitizeAgentDisplayText(text) || "任务执行失败";
}

export function formatAgentToolResult(activity: AiAgentActivity): string | null {
  const raw = activity.result?.trim();
  if (!raw) return null;
  const parsed = parseAgentToolResult(raw);
  if (isCodeChangeTool(activity.toolName)) {
    if (!parsed) return sanitizeAgentDisplayText(raw);
    if (parsed.ok === false) return structuredAgentMessage(parsed.error) || "修改失败";
    if (typeof parsed?.diff !== "string") return null;
    return stripManagedAudioMetadataForDisplay(parsed.diff).trim() || null;
  }
  if (!parsed) return sanitizeAgentDisplayText(raw);
  const pluginResult = formatPluginWorkflowResult(activity.toolName, parsed);
  if (pluginResult) return pluginResult;
  if (activity.toolName === "check_dependencies") {
    const missing = Array.isArray(parsed.missing)
      ? parsed.missing.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    return missing.length ? `未安装：${missing.join("、")}` : null;
  }
  if (parsed.ok === false) return structuredAgentMessage(parsed.error) || "执行失败";
  const validation = parsed.validation && typeof parsed.validation === "object" && !Array.isArray(parsed.validation)
    ? parsed.validation as Record<string, unknown>
    : null;
  if (parsed.installed === false || validation?.valid === false) {
    const error = structuredAgentMessage(validation?.error) || structuredAgentMessage(parsed.error);
    if (error) return error;
    const issues = Array.isArray(validation?.issues) ? validation.issues : Array.isArray(validation?.errors) ? validation.errors : [];
    const messages = issues.map(structuredAgentMessage).filter((message): message is string => Boolean(message));
    return messages.join("\n") || "插件未安装";
  }
  if (parsed.valid === false) {
    const diagnostic = structuredAgentMessage(parsed.diagnostic);
    if (diagnostic) return diagnostic;
    const error = structuredAgentMessage(parsed.error);
    if (error) return error;
    const warning = structuredAgentMessage(parsed.warning);
    if (warning) return warning;
    const issues = Array.isArray(parsed.issues) ? parsed.issues : Array.isArray(parsed.errors) ? parsed.errors : [];
    const messages = issues.map(structuredAgentMessage).filter((message): message is string => Boolean(message));
    return messages.join("\n") || "检查未通过";
  }
  return null;
}

function formatAgentFailure(activity: AiAgentActivity): string | null {
  const result = formatAgentToolResult(activity);
  if (result) return result;
  const detail = sanitizeAgentDisplayText(activity.detail);
  if (!detail || detail === "失败") return activity.status === "error" ? "执行失败" : null;
  return detail;
}

function successfulToolVerificationTitle(activity: AiAgentActivity): string | null {
  if (activity.kind !== "tool" || activity.status !== "done" || activity.toolName !== "validate_scene") return null;
  const parsed = parseAgentToolResult(activity.result);
  if (!parsed || parsed.ok === false || parsed.valid === false || formatAgentToolResult(activity)) return null;
  return "验证场景结构通过";
}

export function formatCodeChangeStats(diff: string): { added: number; removed: number } {
  const lines = diff.split(/\r?\n/);
  return {
    added: lines.filter((line) => line.startsWith("+ ")).length,
    removed: lines.filter((line) => line.startsWith("- ")).length,
  };
}

function codeChangeSceneName(change: AiCodeChangeSnapshot): string {
  const name = change.documentName?.trim() || change.sceneName?.trim() || "当前文档";
  return name.replace(/\.py$/i, "");
}

export function CodeChangeSummary({ activity, onRevealCodeChange }: { activity: AiAgentActivity; onRevealCodeChange: (diff: string, line?: number, change?: AiCodeChangeSnapshot) => void }) {
  if (!activity.codeChange) return null;
  const diff = formatAgentToolResult(activity) || createCodeChangePreview(activity.codeChange.before, activity.codeChange.after);
  const startLine = codeDiffStartLine(diff);
  const stats = formatCodeChangeStats(diff);
  const sceneName = codeChangeSceneName(activity.codeChange);
  return <button type="button" className={`ai-agent-code-change ${activity.status}`} disabled={!startLine} onClick={() => onRevealCodeChange(diff, startLine || undefined, activity.codeChange)}>
    <span className="ai-agent-code-change-file" title={sceneName}><strong>{sceneName}</strong></span>
    <span className="ai-agent-code-change-stats" aria-label={`增加 ${stats.added} 行，删除 ${stats.removed} 行`}><b className="added">+{stats.added}</b><b className="removed">-{stats.removed}</b></span>
    <span className="ai-agent-code-change-view">查看变更</span>
  </button>;
}

function ToolResult({ activity, onRevealCodeChange }: { activity: AiAgentActivity; onRevealCodeChange: (diff: string, line?: number, change?: AiCodeChangeSnapshot) => void }) {
  const displayedResult = formatAgentToolResult(activity);
  if (!displayedResult) return null;
  const isCodeDiff = isCodeChangeTool(activity.toolName);
  if (!isCodeDiff) return <pre>{displayedResult}</pre>;
  const lines = displayedResult.split("\n");
  if (lines.length > 240) return <pre className="ai-code-diff" aria-label="代码修改差异">{displayedResult}</pre>;
  const startLine = codeDiffStartLine(displayedResult);
  let removedOffset = 0;
  let addedOffset = 0;
  return <pre className="ai-code-diff" aria-label="代码修改差异">{lines.map((line, index) => {
    const kind = line.startsWith("+ ") ? "added" : line.startsWith("- ") ? "removed" : line.startsWith("@@") ? "location" : "context";
    const targetLine = startLine === null ? null : kind === "added" ? startLine + addedOffset++ : kind === "removed" ? startLine + removedOffset++ : kind === "location" ? startLine : null;
    return <span className={`ai-code-diff-line ${kind} ${targetLine ? "locatable" : ""}`} key={`${index}-${line}`} onClick={targetLine ? () => onRevealCodeChange(displayedResult, targetLine) : undefined}><span className="ai-code-diff-marker" aria-hidden="true">{kind === "added" ? "+" : kind === "removed" ? "-" : ""}</span><span>{kind === "added" || kind === "removed" ? line.slice(2) : line}</span></span>;
  })}</pre>;
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

export function AgentResponseFooter({ meta, metaTitle, children }: { status: ReactNode; meta: string; metaTitle?: string; children?: ReactNode }) {
  return <div className="ai-agent-response-footer">{meta && <small title={metaTitle}>{meta}</small>}{children && <span className="ai-agent-response-footer-actions">{children}</span>}</div>;
}

export const AgentActivityRow = memo(function AgentActivityRow({ activity, onRevealCodeChange, onRevealProblem }: {
  activity: AiAgentActivity;
  onRevealCodeChange: (diff: string, line?: number, change?: AiCodeChangeSnapshot) => void;
  onRevealProblem: (line: number) => void;
}) {
  if (activity.channel === "thinking") return <details className={`ai-agent-thinking ${activity.status}`} open={activity.status === "running"}>
    <summary><ChevronRight className="ai-agent-tool-chevron" size={14}/><strong>思考过程</strong>{activity.status === "running" && <LoaderCircle className="spin" size={13}/>}</summary>
    <StreamingRichText id={activity.id} text={activityDisplayText(activity)} live={activity.status === "running"}/>
  </details>;
  const verificationTitle = successfulToolVerificationTitle(activity);
  if (verificationTitle) return <div className={`ai-agent-event verification ${activity.status}`}>
    <div className="ai-agent-event-header"><strong>{verificationTitle}</strong></div>
  </div>;
  const failure = activity.status === "error" ? formatAgentFailure(activity) : null;
  if (activity.channel === "decision" || activity.channel === "observation" || activity.channel === "verification" || activity.channel === "question") return <div className={`ai-agent-event ${activity.channel} ${activity.status}`}>
    <div className="ai-agent-event-header"><strong>{activity.channel === "question" ? "需要你的选择" : activity.title}</strong>{activity.status === "running" && <LoaderCircle className="spin" size={13}/>}</div>
    {activity.title && activity.channel === "question" ? <MarkdownContent>{activity.title}</MarkdownContent> : null}
    {(failure || (activity.status !== "error" && sanitizeAgentDisplayText(activity.detail))) && <small title={failure || sanitizeAgentDisplayText(activity.detail) || undefined}>{failure || sanitizeAgentDisplayText(activity.detail)}</small>}
  </div>;
  if (activity.kind === "message") {
    const messageText = activityDisplayText(activity);
    if (activity.status !== "running" && !messageText) return null;
    return <div className={`ai-agent-narration ${activity.status}`}>
      <StreamingRichText id={activity.id} text={messageText} live={activity.status === "running"}/>
    </div>;
  }
  if (activity.execution) return <AgentExecutionResult execution={activity.execution} onRevealProblem={onRevealProblem}/>;
  if (activity.codeChange) return <CodeChangeSummary activity={activity} onRevealCodeChange={onRevealCodeChange}/>;
  const displayResult = formatAgentToolResult(activity);
  if (activity.status === "error") {
    const denied = failure === "已取消";
    return <div className={`ai-agent-tool-line ${denied ? "denied" : "error"}`} title={[activity.title, failure].filter(Boolean).join("\n")}><strong>{activity.title}</strong><small>{failure}</small></div>;
  }
  if (!displayResult) return <div className={`ai-agent-tool-line ${activity.status}`}>
    {activity.status === "running" && <LoaderCircle className="spin" size={13}/>}<strong>{activity.title}</strong>
    {activity.detail && <small>{activity.detail}</small>}
  </div>;
  return <details className={`ai-agent-tool ${activity.status}`}>
    <summary onClick={(event) => {
      if (event.target instanceof Element && event.target.closest(".ai-agent-tool-chevron")) return;
      const line = codeDiffStartLine(displayResult);
      if (!line || !isCodeChangeTool(activity.toolName)) return;
      event.preventDefault();
      onRevealCodeChange(displayResult, line);
    }}>
      <ChevronRight className="ai-agent-tool-chevron" size={14}/>
      <strong>{activity.title}</strong>
      {activity.detail && <small>{activity.detail}</small>}
    </summary>
    <ToolResult activity={activity} onRevealCodeChange={onRevealCodeChange}/>
  </details>;
});

function AgentTaskPlan({ steps, collapsed = false }: { steps: AiAgentPlanStep[]; collapsed?: boolean }) {
  if (!steps.length) return null;
  const completed = steps.filter(({ status }) => status === "completed").length;
  const list = <ol>{steps.map((item, index) => <li className={item.status} aria-label={`${item.step}：${item.status === "completed" ? "完成" : item.status === "in_progress" ? "进行中" : "等待"}`} key={`${index}-${item.step}`}>
    <span className="ai-agent-task-marker" aria-hidden="true">{item.status === "completed" ? <Check size={11}/> : item.status === "in_progress" ? <LoaderCircle className="spin" size={11}/> : null}</span>
    <span>{item.step}</span>
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

function AgentRunProgress({ progress }: { progress?: AiAgentProgress }) {
  return progress?.taskPlan?.length ? <AgentTaskPlan steps={progress.taskPlan}/> : null;
}

function AgentPermissionPrompt({ request, onRespond }: { request: AiAgentPermissionRequest; onRespond: (approved: boolean) => void }) {
  return <div className="ai-agent-permission" role="group" aria-label={request.title}>
    <div className="ai-agent-permission-header"><ShieldQuestion size={17}/><strong>{request.title}</strong></div>
    <p>{request.detail}</p>
    <div className="ai-agent-permission-actions">
      <button type="button" className="secondary" onClick={() => onRespond(false)}><X size={14}/>拒绝</button>
      <button type="button" className="primary" onClick={() => onRespond(true)}><Check size={14}/>允许</button>
    </div>
  </div>;
}

export function settlePermissionResolvers(resolvers: Map<number, (approved: boolean) => void>, approved = false) {
  for (const resolve of resolvers.values()) resolve(approved);
  resolvers.clear();
}

export function AiAssistantPanel({ lineCount, contextName, conversationScope, conversationMigrationScopes = [], workspaceEpoch, onOpenSettings, onClose, onRunAgent, onRevealCodeChange, onRevealProblem, onUndoTaskChange, onApplyTaskChange, onClearConversationConfirm }: AiAssistantPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [agentMode, setAgentMode] = useState<AiAgentMode>("agent");
  const [agentModeMenuOpen, setAgentModeMenuOpen] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<AiReasoningEffort>(() => getAiReasoningEffort());
  const [reasoningEffortMenuOpen, setReasoningEffortMenuOpen] = useState(false);
  const [conversationMenuOpen, setConversationMenuOpen] = useState(false);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [conversationPersistenceFailed, setConversationPersistenceFailed] = useState(false);
  const conversationMigrationKey = conversationMigrationScopes.join("|");
  const [conversationState, setConversationState] = useState<AiConversationState>(() => loadConversationState(conversationScope, conversationMigrationScopes));
  const activeConversation = conversationState.conversations.find((conversation) => conversation.id === conversationState.activeId) ?? conversationState.conversations[0];
  const runs = activeConversation?.runs ?? [];
  const runId = useRef(Math.max(0, ...conversationState.conversations.flatMap((conversation) => conversation.runs.map((run) => run.id))) + 1);
  const activeController = useRef<AbortController | null>(null);
  const permissionResolvers = useRef(new Map<number, (approved: boolean) => void>());
  const mountedRef = useRef(true);
  const threadRef = useRef<HTMLDivElement>(null);
  const threadContentRef = useRef<HTMLDivElement>(null);
  const threadScrollbarRef = useRef<HTMLDivElement>(null);
  const threadScrollbarThumbRef = useRef<HTMLDivElement>(null);
  const threadScrollbarDragRef = useRef<{ startY: number; startScrollTop: number; maxScrollTop: number; maxThumbTop: number } | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const conversationMenuRef = useRef<HTMLDivElement>(null);
  const agentModeMenuRef = useRef<HTMLDivElement>(null);
  const agentModeTriggerRef = useRef<HTMLButtonElement>(null);
  const reasoningEffortMenuRef = useRef<HTMLDivElement>(null);
  const reasoningEffortTriggerRef = useRef<HTMLButtonElement>(null);
  const runsRef = useRef(runs);
  const stickToLatestRef = useRef(true);
  const running = runs.some((run) => run.status === "running");
  const awaitingClarification = runs.at(-1)?.status === "done" && Boolean(runs.at(-1)?.result?.clarification);

  useEffect(() => {
    if (!conversationMigrationScopes.length) return;
    const imported = [...new Set(conversationMigrationScopes.filter((scope) => scope && scope !== conversationScope))].map(readConversationState);
    if (!imported.length) return;
    setConversationState((current) => mergeAiConversationStates(current, imported));
  }, [conversationMigrationKey, conversationScope]);

  const setRuns = (update: (items: AgentRun[]) => AgentRun[]) => {
    if (!mountedRef.current) return;
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
    if (running || !shouldPersistConversationRuns(runs)) return;
    const failed = !storeConversationState(conversationScope, conversationState);
    setConversationPersistenceFailed((current) => current === failed ? current : failed);
  }, [conversationScope, conversationState, running, runs]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeController.current?.abort();
      activeController.current = null;
      settlePermissionResolvers(permissionResolvers.current);
    };
  }, [workspaceEpoch]);

  useEffect(() => {
    runsRef.current = runs;
    if (!runs.length) {
      stickToLatestRef.current = true;
      setShowScrollToLatest(false);
      return;
    }
    if (!stickToLatestRef.current) return;
    const frame = requestAnimationFrame(() => {
      if (!threadRef.current) return;
      scrollThreadToLatest(threadRef.current, stickToLatestRef.current);
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
    const thread = threadRef.current;
    if (!thread) return;
    return attachAiThreadWheelHandler(thread, () => {
      stickToLatestRef.current = false;
      setShowScrollToLatest(true);
    });
  }, [workspaceEpoch]);

  useEffect(() => {
    const thread = threadRef.current;
    const content = threadContentRef.current;
    const track = threadScrollbarRef.current;
    const thumb = threadScrollbarThumbRef.current;
    if (!thread || !content || !track || !thumb) return;
    let frame: number | null = null;
    const update = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const metrics = getAiThreadScrollbarMetrics({ scrollTop: thread.scrollTop, scrollHeight: thread.scrollHeight, clientHeight: thread.clientHeight, trackHeight: track.clientHeight });
        track.classList.toggle("has-overflow", metrics.visible);
        thumb.style.height = `${metrics.thumbHeight}px`;
        thumb.style.transform = `translateY(${metrics.thumbTop}px)`;
        track.setAttribute("aria-valuemax", String(Math.max(0, thread.scrollHeight - thread.clientHeight)));
        track.setAttribute("aria-valuenow", String(Math.round(thread.scrollTop)));
      });
    };
    const mutationObserver = new MutationObserver(update);
    const resizeObserver = new ResizeObserver(update);
    thread.addEventListener("scroll", update, { passive: true });
    mutationObserver.observe(thread, { childList: true, subtree: true, characterData: true });
    resizeObserver.observe(thread);
    resizeObserver.observe(content);
    resizeObserver.observe(track);
    update();
    return () => {
      thread.removeEventListener("scroll", update);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [workspaceEpoch]);

  const handleAiScrollbarPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const thread = threadRef.current;
    const track = threadScrollbarRef.current;
    const thumb = threadScrollbarThumbRef.current;
    if (!thread || !track || !thumb || !track.classList.contains("has-overflow")) return;
    const metrics = getAiThreadScrollbarMetrics({ scrollTop: thread.scrollTop, scrollHeight: thread.scrollHeight, clientHeight: thread.clientHeight, trackHeight: track.clientHeight });
    if (!metrics.visible || metrics.maxThumbTop <= 0) return;
    event.preventDefault();
    const trackRect = track.getBoundingClientRect();
    if (event.target !== thumb) {
      const targetTop = Math.max(0, Math.min(metrics.maxThumbTop, event.clientY - trackRect.top - metrics.thumbHeight / 2));
      thread.scrollTop = targetTop / metrics.maxThumbTop * (thread.scrollHeight - thread.clientHeight);
      return;
    }
    threadScrollbarDragRef.current = { startY: event.clientY, startScrollTop: thread.scrollTop, maxScrollTop: thread.scrollHeight - thread.clientHeight, maxThumbTop: metrics.maxThumbTop };
    track.classList.add("dragging");
    const move = (moveEvent: PointerEvent) => {
      const drag = threadScrollbarDragRef.current;
      if (!drag) return;
      thread.scrollTop = Math.max(0, Math.min(drag.maxScrollTop, drag.startScrollTop + (moveEvent.clientY - drag.startY) / drag.maxThumbTop * drag.maxScrollTop));
    };
    const end = () => {
      threadScrollbarDragRef.current = null;
      track.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", end, { once: true });
  };

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
    if (!reasoningEffortMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!reasoningEffortMenuRef.current?.contains(event.target as Node)) setReasoningEffortMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setReasoningEffortMenuOpen(false);
      reasoningEffortTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [reasoningEffortMenuOpen]);

  useEffect(() => {
    if (running) {
      setAgentModeMenuOpen(false);
      setReasoningEffortMenuOpen(false);
    }
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
    const history = trimAiConversationHistory(buildAiConversationHistory(
      runsRef.current.filter((run) => run.id !== excludedRunId),
    ));
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
        conversationId: conversationState.activeId,
        agentMode: runMode,
        reasoningEffort,
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
        const activities = removeFinalMessageActivity(run.activities, result.summary);
        return { ...run, status: "done", result, activities, progress: undefined, permission: undefined, finishedAt: Date.now() };
      });
      setRuns(() => completedRuns);
      completedSuccessfully = true;
    } catch (error) {
      const failedStatus = controller.signal.aborted ? "stopped" : "error";
      const failedActivities = runsRef.current.find((run) => run.id === id)?.activities || [];
      updateRun(id, {
        status: failedStatus,
        activities: finalizeAgentRunActivities(failedActivities, failedStatus),
        error: controller.signal.aborted ? undefined : errorMessage(error),
        permission: undefined,
        finishedAt: Date.now(),
      });
    } finally {
      if (activeController.current === controller) activeController.current = null;
      if (completedSuccessfully) {
        const next = runsRef.current.find((run) => run.status === "queued");
        if (next) queueMicrotask(() => void runAgent(next.request || next.prompt, undefined, next.id, next.prompt, next.mode, next.initialPlan));
      }
    }
  };

  const enqueuePrompt = (nextPrompt = prompt) => {
    const normalizedPrompt = nextPrompt.trim();
    if (!normalizedPrompt) return;
    if (!runsRef.current.some((run) => run.status === "running")) {
      void runAgent(normalizedPrompt);
      return;
    }
    setRuns((items) => [...items, { id: runId.current++, prompt: normalizedPrompt, mode: agentMode, activities: [], status: "queued" }]);
    setPrompt("");
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

  const selectSuggestion = (suggestion: string) => {
    applyAiAssistantSuggestion(suggestion, setPrompt, () => promptRef.current?.focus(), enqueuePrompt);
  };

  return <section className="ai-assistant" aria-label="AI 编程助手">
    <header className="ai-assistant-header">
      <div className="ai-assistant-title"><span className="ai-assistant-icon"><Sparkles size={16}/></span><strong>AI 编程助手</strong><small title={activeConversation?.title}>{activeConversation?.title || "新对话"}</small></div>
      <div className="ai-assistant-actions">
        {conversationPersistenceFailed && <span className="ai-conversation-persistence-warning" role="status" title="AI 对话记录未能保存，请清理部分历史记录后重试"><AlertCircle size={14}/><span>记录未保存</span></span>}
        <div className="ai-conversation-menu-anchor" ref={conversationMenuRef}>
          <button type="button" className={conversationMenuOpen ? "active" : ""} disabled={running} onClick={() => setConversationMenuOpen((open) => !open)} title="会话记录" aria-label="会话记录" aria-haspopup="menu" aria-expanded={conversationMenuOpen}><MessagesSquare size={16}/></button>
          {conversationMenuOpen && <div className="ai-conversation-menu" role="menu" aria-label="AI 会话记录">
            <div className="ai-conversation-menu-list">
              <button type="button" className="ai-conversation-new" role="menuitem" onClick={startConversation}><MessageSquarePlus size={14}/><span>新建对话</span></button>
              {conversationState.conversations.map((conversation) => {
              const selected = conversation.id === conversationState.activeId;
              return <button type="button" role="menuitemradio" aria-checked={selected} className={selected ? "selected" : ""} key={conversation.id} onClick={() => switchConversation(conversation.id)}><span>{conversation.title}</span>{selected && <Check size={14}/>}</button>;
              })}
            </div>
            <button type="button" className="ai-conversation-clear" role="menuitem" disabled={!runs.length} onClick={clearConversation}><Trash2 size={14}/><span>清空当前对话</span></button>
          </div>}
        </div>
        <button type="button" onClick={onOpenSettings} title="AI 模型设置" aria-label="AI 模型设置"><Settings size={16}/></button>
        <button type="button" onClick={onClose} title="关闭 AI 编程助手" aria-label="关闭 AI 编程助手"><X size={16}/></button>
      </div>
    </header>
    <div className="ai-thread-shell">
      <div ref={threadRef} className={`ai-thread ${runs.length ? "has-runs" : ""}`} aria-live="polite" onScroll={handleThreadScroll}>
        <div ref={threadContentRef} className="ai-thread-content">
        {!runs.length && <AiAssistantWelcome onSelect={selectSuggestion} contextName={contextName} lineCount={lineCount}/>}
        {runs.map((run) => <article className="ai-agent-run" key={run.id}>
          <div className="ai-agent-user-message"><p className="ai-agent-prompt">{run.prompt}</p></div>
          <div className="ai-agent-worklog" aria-label="任务活动">
            <div className="ai-agent-activity-list">
          {groupAgentActivities(run.activities, run.permission?.toolName).map((entry) => entry.kind === "group"
            ? <details className="ai-agent-tool-group" key={entry.id}>
              <summary><ChevronRight className="ai-agent-tool-chevron" size={14}/><strong>{entry.summary}</strong></summary>
              <div>{entry.activities.map((activity) => <span key={activity.id}><strong>{activity.title}</strong>{activity.detail && <small>{activity.detail}</small>}</span>)}</div>
            </details>
            : <AgentActivityRow key={entry.activity.id} activity={entry.activity} onRevealCodeChange={onRevealCodeChange} onRevealProblem={onRevealProblem}/>)}
          {run.status === "done" && run.result?.taskPlan?.length ? <AgentTaskPlan steps={run.result.taskPlan} collapsed/> : null}
          {(run.status === "error" || run.status === "stopped") && run.progress?.taskPlan?.length ? <AgentTaskPlan steps={run.progress.taskPlan}/> : null}
          {run.permission && <AgentPermissionPrompt request={run.permission} onRespond={(approved) => respondToPermission(run.id, approved)}/>}
          {run.status === "running" && <AgentRunProgress progress={run.progress}/>}
            </div>
          </div>
          {run.status === "done" && !run.result?.clarification && <div className="ai-agent-response">
            <MarkdownContent>{run.result?.summary || "完成"}</MarkdownContent>
            <AgentResponseFooter status={run.result?.clarification
              ? "等待回复"
              : run.result?.mode === "plan"
                ? "计划完成"
                : run.result?.intent === "chat"
                  ? "回复"
                  : run.result?.intent === "inspect"
                    ? "已分析"
                    : "完成"} meta={agentRunMeta(run)} metaTitle={agentTokenUsageTitle(run.result?.tokenUsage)}>
              {run.result?.taskChange && <span className="ai-task-change-actions">
                <button disabled={!run.taskUndone} title={run.taskUndone ? "重新应用本次任务" : "任务修改已应用"} aria-label={run.taskUndone ? "重新应用本次任务" : "任务修改已应用"} onClick={() => { if (run.result?.taskChange && onApplyTaskChange(run.result.taskChange)) updateRun(run.id, { taskUndone: false }); }}><Check size={13}/></button>
                <button disabled={run.taskUndone} title={run.taskUndone ? "任务修改已撤销" : "撤销本次任务"} aria-label={run.taskUndone ? "任务修改已撤销" : "撤销本次任务"} onClick={() => { if (run.result?.taskChange && onUndoTaskChange(run.result.taskChange)) updateRun(run.id, { taskUndone: true }); }}><Undo2 size={13}/></button>
              </span>}
              {run.result?.mode === "plan" && run.result.planPrompt && !run.result.clarification && <button type="button" className="ai-plan-execute" disabled={running} onClick={() => executePlan(run)} title="由 Agent 按此计划执行"><Play size={13}/><span>执行计划</span></button>}
              <AiResponseActions markdown={run.result?.summary || "完成"} disabled={running} onRetry={() => void runAgent(run.request || run.prompt, run.id, undefined, run.prompt, run.mode, run.initialPlan)}/>
            </AgentResponseFooter>
          </div>}
          {run.status === "queued" && <div className="ai-agent-run-state queued"><Clock3 size={14}/><span>等待当前任务完成</span><span className="ai-agent-queued-actions"><button disabled={running} title="立即执行" aria-label="立即执行排队任务" onClick={() => startQueuedRun(run)}><Play size={13}/></button><button title="移出队列" aria-label="移出任务队列" onClick={() => removeQueuedRun(run.id)}><X size={14}/></button></span></div>}
          {run.status === "stopped" && <div className="ai-agent-run-state stopped"><Square size={12}/><span>已停止{run.startedAt ? ` · ${formatAgentElapsed(run.startedAt, run.finishedAt)}` : ""}</span><span className="ai-run-failure-actions">{(run.progress?.taskPlan?.length || 0) >= 2 ? <button className="ai-run-resume" disabled={running} title={taskPlanResumeLabel(run.progress?.taskPlan || [])} aria-label={taskPlanResumeLabel(run.progress?.taskPlan || [])} onClick={() => resumeRun(run)}><Play size={13}/></button> : <button className="ai-run-retry" disabled={running} title="重新执行此任务" aria-label="重新执行此任务" onClick={() => void runAgent(run.request || run.prompt, run.id, undefined, run.prompt, run.mode, run.initialPlan)}><RefreshCw size={13}/></button>}</span></div>}
          {run.error && <div className="ai-agent-error"><span className="ai-agent-error-content"><strong>任务未完成</strong><span title={run.error}>{formatAgentRunError(run.error)}</span>{run.startedAt ? <small>{formatAgentElapsed(run.startedAt, run.finishedAt)}</small> : null}</span><span className="ai-agent-error-actions">{(run.progress?.taskPlan?.length || 0) >= 2 ? <button className="ai-run-resume" disabled={running} onClick={() => resumeRun(run)} title={taskPlanResumeLabel(run.progress?.taskPlan || [])} aria-label={taskPlanResumeLabel(run.progress?.taskPlan || [])}><Play size={14}/></button> : <button disabled={running} onClick={() => void runAgent(run.request || run.prompt, run.id, undefined, run.prompt, run.mode, run.initialPlan)} title="重新执行此任务" aria-label="重新执行此任务"><RefreshCw size={15}/></button>}<button onClick={onOpenSettings} title="AI 模型设置" aria-label="AI 模型设置"><Settings size={15}/></button></span></div>}
        </article>)}
        {runs.length > 0 && shouldShowAiFollowUpSuggestions(runs) && !runs.at(-1)?.result?.clarification && <div className="ai-agent-followups"><AiAssistantSuggestionButtons onSelect={selectSuggestion} suggestions={getAiFollowUpSuggestions(runs.at(-1)!, contextName)} className="followups"/></div>}
        </div>
      </div>
      <div ref={threadScrollbarRef} className="ai-thread-scrollbar" role="scrollbar" aria-label="AI 消息滚动条" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={0} aria-valuenow={0} onPointerDown={handleAiScrollbarPointerDown}>
        <div ref={threadScrollbarThumbRef} className="ai-thread-scrollbar-thumb" />
      </div>
      {showScrollToLatest && runs.length > 0 && <button type="button" className="ai-scroll-to-latest" onClick={scrollToLatest} title="回到最新消息" aria-label="回到最新消息"><ArrowDown size={16}/></button>}
    </div>
    <div className="ai-composer">
      <div className="ai-composer-input">
        <textarea ref={promptRef} value={prompt} onChange={(event) => setPrompt(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); running ? enqueuePrompt() : void runAgent(); } }} placeholder={running ? "输入后续指令..." : awaitingClarification ? "输入序号或补充要求..." : agentMode === "plan" ? "描述需要规划的任务..." : "输入任务..."} aria-label="AI 指令" rows={2}/>
        <div className="ai-composer-footer">
          <div className="ai-agent-mode-menu" ref={agentModeMenuRef}>
            <button ref={agentModeTriggerRef} type="button" className={`ai-agent-mode-trigger ${agentModeMenuOpen ? "open" : ""}`} disabled={running} onClick={() => { setReasoningEffortMenuOpen(false); setAgentModeMenuOpen((open) => !open); }} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setReasoningEffortMenuOpen(false); setAgentModeMenuOpen(true); } }} title={agentMode === "plan" ? "只读分析并制定计划" : "直接执行任务"} aria-label={`智能体模式：${agentMode === "plan" ? "计划" : "智能体"}`} aria-haspopup="menu" aria-expanded={agentModeMenuOpen}>
              {agentMode === "plan" ? <ListChecks size={13}/> : <Sparkles size={13}/>}<span>{agentMode === "plan" ? "计划" : "智能体"}</span><ChevronDown size={13}/>
            </button>
            {agentModeMenuOpen && <div className="ai-agent-mode-options" role="menu" aria-label="选择智能体模式">
              <button type="button" role="menuitemradio" aria-checked={agentMode === "agent"} className={agentMode === "agent" ? "selected" : ""} onClick={() => { setAgentMode("agent"); setAgentModeMenuOpen(false); requestAnimationFrame(() => agentModeTriggerRef.current?.focus()); }}><Sparkles size={14}/><span>智能体</span>{agentMode === "agent" && <Check size={13}/>}</button>
              <button type="button" role="menuitemradio" aria-checked={agentMode === "plan"} className={agentMode === "plan" ? "selected" : ""} onClick={() => { setAgentMode("plan"); setAgentModeMenuOpen(false); requestAnimationFrame(() => agentModeTriggerRef.current?.focus()); }}><ListChecks size={14}/><span>计划</span>{agentMode === "plan" && <Check size={13}/>}</button>
            </div>}
          </div>
          <div className="ai-agent-mode-menu ai-reasoning-effort-menu" ref={reasoningEffortMenuRef}>
            <button ref={reasoningEffortTriggerRef} type="button" className={`ai-agent-mode-trigger ai-reasoning-effort-trigger ${reasoningEffortMenuOpen ? "open" : ""}`} disabled={running} onClick={() => { setAgentModeMenuOpen(false); setReasoningEffortMenuOpen((open) => !open); }} title={`思考强度：${reasoningEffortLabels[reasoningEffort]}`} aria-label={`思考强度：${reasoningEffortLabels[reasoningEffort]}`} aria-haspopup="menu" aria-expanded={reasoningEffortMenuOpen}>
              <span>{reasoningEffortLabels[reasoningEffort]}</span><ChevronDown size={13}/>
            </button>
            {reasoningEffortMenuOpen && <div className="ai-agent-mode-options ai-reasoning-effort-options" role="menu" aria-label="选择思考强度">
              <span className="ai-reasoning-effort-heading">思考强度</span>
              {(Object.keys(reasoningEffortLabels) as AiReasoningEffort[]).map((effort) => <button type="button" role="menuitemradio" aria-checked={reasoningEffort === effort} className={reasoningEffort === effort ? "selected" : ""} key={effort} onClick={() => { setReasoningEffort(saveAiReasoningEffort(effort)); setReasoningEffortMenuOpen(false); requestAnimationFrame(() => reasoningEffortTriggerRef.current?.focus()); }}><span>{reasoningEffortLabels[effort]}</span>{reasoningEffort === effort && <Check size={13}/>}</button>)}
            </div>}
          </div>
          <span className="ai-composer-scope" title={`${contextName} · ${lineCount} 行代码`}><Code2 size={14}/><span>{contextName}</span><small>{lineCount} 行</small></span>
          <span className="ai-composer-footer-spacer"/>
          {running
            ? <button className="stop" onClick={stopAgent} title="停止智能体" aria-label="停止智能体"><Square size={13}/></button>
            : <button onClick={() => void runAgent()} disabled={!prompt.trim()} title="发送" aria-label="发送"><Send size={16}/></button>}
        </div>
      </div>
    </div>
  </section>;
}
