import { isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, ArrowDown, Box, Check, ChevronRight, Clock3, Code2, Copy, Eye, Files, Film, LoaderCircle, MessageSquarePlus, MessagesSquare, Play, Plug, Redo2, RefreshCw, Save, Send, Settings, Sparkles, Square, Trash2, Undo2, Volume2, X } from "lucide-react";
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
import remarkGfm from "remark-gfm";
import type { AiAgentActivity, AiAgentResult, AiAgentToolName, AiCodeChangeSnapshot, AiConversationTurn, AiTaskChangeSnapshot } from "./aiAgent";

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
  onActivity: (activity: AiAgentActivity) => void;
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
  onUndoCodeChange: (change: AiCodeChangeSnapshot) => boolean;
  onApplyCodeChange: (change: AiCodeChangeSnapshot) => boolean;
  onUndoTaskChange: (change: AiTaskChangeSnapshot) => boolean;
  onApplyTaskChange: (change: AiTaskChangeSnapshot) => boolean;
};

type AgentRun = {
  id: number;
  prompt: string;
  activities: AiAgentActivity[];
  status: "running" | "done" | "error" | "stopped";
  result?: AiAgentResult;
  error?: string;
  taskUndone?: boolean;
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

type AgentActivityEntry =
  | { kind: "activity"; activity: AiAgentActivity }
  | { kind: "group"; id: string; activities: AiAgentActivity[] };

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
    if (status !== "done" && status !== "error" && status !== "stopped") return [];
    return [{ ...run, id: run.id, prompt: run.prompt, activities: run.activities, status } as AgentRun];
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

function storeConversationState(scope: string, state: AiConversationState) {
  try {
    let conversations = state.conversations.slice(-maxStoredConversations).map((conversation) => ({
      ...conversation,
      runs: conversation.runs.slice(-maxStoredRuns).map((run) => run.status === "running" ? { ...run, status: "stopped" as const } : run),
    }));
    let serialized = JSON.stringify({ activeId: state.activeId, conversations });
    if (serialized.length > maxStoredHistoryCharacters) {
      conversations = conversations.map((conversation) => ({
        ...conversation,
        runs: conversation.runs.map((run) => run.result?.taskChange ? { ...run, result: { ...run.result, taskChange: undefined } } : run),
      }));
      serialized = JSON.stringify({ activeId: state.activeId, conversations });
    }
    while (conversations.length > 1 && serialized.length > maxStoredHistoryCharacters) {
      const removable = conversations.findIndex((conversation) => conversation.id !== state.activeId);
      if (removable < 0) break;
      conversations = conversations.filter((_, index) => index !== removable);
      serialized = JSON.stringify({ activeId: state.activeId, conversations });
    }
    const activeIndex = conversations.findIndex((conversation) => conversation.id === state.activeId);
    while (activeIndex >= 0 && conversations[activeIndex].runs.length > 1 && serialized.length > maxStoredHistoryCharacters) {
      conversations = conversations.map((conversation, index) => index === activeIndex ? { ...conversation, runs: conversation.runs.slice(1) } : conversation);
      serialized = JSON.stringify({ activeId: state.activeId, conversations });
    }
    localStorage.setItem(aiConversationsStorageKey(scope), serialized);
    localStorage.removeItem(aiHistoryStorageKey(scope));
  } catch {
    // Conversation persistence must never interrupt the active agent.
  }
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
  return <div className={`ai-markdown ${className}`}><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: MarkdownCodeBlock, a: MarkdownLink }}>{normalizeAssistantMarkdown(children)}</ReactMarkdown></div>;
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
    else if (compact.length > 1) entries.push({ kind: "group", id: compact.map((activity) => activity.id).join("-"), activities: compact });
    compact = [];
  };
  for (const activity of activities) {
    const isCompact = activity.kind === "tool" && activity.status === "done" && !activity.result && !activity.codeChange;
    if (isCompact) compact.push(activity);
    else {
      flushCompact();
      entries.push({ kind: "activity", activity });
    }
  }
  flushCompact();
  return entries;
}

export function isNearLatestScroll(scrollTop: number, clientHeight: number, scrollHeight: number, threshold = 48): boolean {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}

function ToolResult({ activity, onRevealCodeChange }: { activity: AiAgentActivity; onRevealCodeChange: (diff: string, line?: number) => void }) {
  const isCodeDiff = isCodeChangeTool(activity.toolName);
  if (!isCodeDiff) return <pre>{activity.result}</pre>;
  const startLine = codeDiffStartLine(activity.result);
  let removedOffset = 0;
  let addedOffset = 0;
  return <pre className="ai-code-diff" aria-label="代码修改差异">{activity.result?.split("\n").map((line, index) => {
    const kind = line.startsWith("+ ") ? "added" : line.startsWith("- ") ? "removed" : line.startsWith("@@") ? "location" : "context";
    const targetLine = startLine === null ? null : kind === "added" ? startLine + addedOffset++ : kind === "removed" ? startLine + removedOffset++ : kind === "location" ? startLine : null;
    return <span className={`ai-code-diff-line ${kind} ${targetLine ? "locatable" : ""}`} key={`${index}-${line}`} onClick={targetLine && activity.result ? () => onRevealCodeChange(activity.result!, targetLine) : undefined}><span className="ai-code-diff-marker" aria-hidden="true">{kind === "added" ? "+" : kind === "removed" ? "-" : ""}</span><span>{kind === "added" || kind === "removed" ? line.slice(2) : line}</span></span>;
  })}</pre>;
}

function activityIcon(toolName?: AiAgentToolName): ReactNode {
  if (!toolName) return <Sparkles size={15}/>;
  if (toolName === "list_scenes" || toolName === "get_scene" || toolName === "switch_scene" || toolName === "create_scene" || toolName === "rename_scene" || toolName === "delete_scene") return <Files size={15}/>;
  if (toolName === "check_code" || toolName === "format_code" || toolName === "replace_code" || toolName === "edit_code" || toolName === "inspect_python_structure" || toolName === "insert_statements" || toolName === "replace_function_body" || toolName === "add_import") return <Code2 size={15}/>;
  if (toolName === "validate_scene") return <Check size={15}/>;
  if (toolName === "list_resources" || toolName === "get_resource" || toolName === "check_resources") return <Box size={15}/>;
  if (toolName === "check_dependencies" || toolName === "install_dependencies") return <Plug size={15}/>;
  if (toolName === "run_project" || toolName === "stop_execution") return <Play size={15}/>;
  if (toolName === "render_manim" || toolName === "inspect_rendered_video") return <Film size={15}/>;
  if (toolName === "get_voiceover_context" || toolName === "add_voiceover" || toolName === "add_synchronized_voiceover" || toolName === "check_voiceover") return <Volume2 size={15}/>;
  if (toolName === "save_project") return <Save size={15}/>;
  if (toolName === "undo_code") return <Undo2 size={15}/>;
  if (toolName === "redo_code") return <Redo2 size={15}/>;
  if (toolName === "wait") return <Clock3 size={15}/>;
  if (toolName === "get_context" || toolName === "get_execution_state") return <Eye size={15}/>;
  return <Code2 size={15}/>;
}

function AgentActivityRow({ activity, runId, onRevealCodeChange, onUndoCodeChange, onApplyCodeChange, onUpdate }: {
  activity: AiAgentActivity;
  runId: number;
  onRevealCodeChange: (diff: string, line?: number) => void;
  onUndoCodeChange: (change: AiCodeChangeSnapshot) => boolean;
  onApplyCodeChange: (change: AiCodeChangeSnapshot) => boolean;
  onUpdate: (runId: number, activity: AiAgentActivity) => void;
}) {
  if (activity.kind === "message") return <div className={`ai-agent-narration ${activity.status}`}>
    {activity.status === "running" ? <LoaderCircle className="spin" size={15}/> : <Sparkles size={15}/>}<MarkdownContent>{activity.title}</MarkdownContent>
  </div>;
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

export function AiAssistantPanel({ lineCount, sceneName, conversationScope, onOpenSettings, onClose, onRunAgent, onRevealCodeChange, onUndoCodeChange, onApplyCodeChange, onUndoTaskChange, onApplyTaskChange }: AiAssistantPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [conversationMenuOpen, setConversationMenuOpen] = useState(false);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [conversationState, setConversationState] = useState<AiConversationState>(() => loadConversationState(conversationScope));
  const activeConversation = conversationState.conversations.find((conversation) => conversation.id === conversationState.activeId) ?? conversationState.conversations[0];
  const runs = activeConversation?.runs ?? [];
  const runId = useRef(Math.max(0, ...conversationState.conversations.flatMap((conversation) => conversation.runs.map((run) => run.id))) + 1);
  const activeController = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const conversationMenuRef = useRef<HTMLDivElement>(null);
  const runsRef = useRef(runs);
  const stickToLatestRef = useRef(true);
  const running = runs.some((run) => run.status === "running");
  const contextTurns = trimAiConversationHistory(runs
    .filter((run): run is AgentRun & { result: AiAgentResult } => run.status === "done" && Boolean(run.result))
    .map((run) => ({ user: run.prompt, assistant: run.result.summary, clarification: Boolean(run.result.clarification) })));
  const awaitingClarification = runs.at(-1)?.status === "done" && Boolean(runs.at(-1)?.result?.clarification);

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
    storeConversationState(conversationScope, conversationState);
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

  const runAgent = async (nextPrompt = prompt, excludedRunId?: number) => {
    const normalizedPrompt = nextPrompt.trim();
    if (!normalizedPrompt || running) return;
    const id = runId.current++;
    const controller = new AbortController();
    const history = trimAiConversationHistory(runs
      .filter((run): run is AgentRun & { result: AiAgentResult } => run.id !== excludedRunId && run.status === "done" && Boolean(run.result))
      .map((run) => ({ user: run.prompt, assistant: run.result.summary, clarification: Boolean(run.result.clarification) })));
    activeController.current = controller;
    stickToLatestRef.current = true;
    setShowScrollToLatest(false);
    if (!runs.length) {
      setConversationState((state) => ({
        ...state,
        conversations: state.conversations.map((conversation) => conversation.id === state.activeId ? { ...conversation, title: conversationTitle(normalizedPrompt) } : conversation),
      }));
    }
    setRuns((items) => [...items, { id, prompt: normalizedPrompt, activities: [], status: "running" }]);
    setPrompt("");
    try {
      const result = await onRunAgent({
        prompt: normalizedPrompt,
        history,
        onActivity: (activity) => updateActivity(id, activity),
        signal: controller.signal,
      });
      const completedRuns: AgentRun[] = runsRef.current.map((run) => {
        if (run.id !== id) return run;
        const last = run.activities.at(-1);
        const activities = last?.kind === "message" && last.title.trim() === result.summary.trim()
          ? run.activities.slice(0, -1)
          : run.activities;
        return { ...run, status: "done", result, activities };
      });
      setRuns(() => completedRuns);
      if (result.taskChange?.afterActiveSceneId && result.taskChange.afterActiveSceneId !== conversationScope) {
        const title = activeConversation?.title === "新对话" ? conversationTitle(normalizedPrompt) : activeConversation?.title || conversationTitle(normalizedPrompt);
        queueMicrotask(() => storeTransferredConversation(result.taskChange!.afterActiveSceneId, title, completedRuns));
      }
    } catch (error) {
      if (controller.signal.aborted) updateRun(id, { status: "stopped", error: undefined });
      else updateRun(id, { status: "error", error: errorMessage(error) });
    } finally {
      if (activeController.current === controller) activeController.current = null;
    }
  };

  const stopAgent = () => activeController.current?.abort();

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

  const clearConversation = () => {
    if (running || !runs.length || !window.confirm("确定清空当前 AI 对话吗？此操作无法撤销。")) return;
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
              <summary><ChevronRight className="ai-agent-tool-chevron" size={14}/><Check size={14}/><strong>完成 {entry.activities.length} 项操作</strong><small>{entry.activities.at(-1)?.title}</small></summary>
              <div>{entry.activities.map((activity) => <span key={activity.id}><span className="ai-agent-tool-icon">{activityIcon(activity.toolName)}</span><strong>{activity.title}</strong>{activity.detail && <small>{activity.detail}</small>}</span>)}</div>
            </details>
            : <AgentActivityRow key={entry.activity.id} activity={entry.activity} runId={run.id} onRevealCodeChange={onRevealCodeChange} onUndoCodeChange={onUndoCodeChange} onApplyCodeChange={onApplyCodeChange} onUpdate={updateActivity}/>)}
          {run.status === "done" && <div className={`ai-agent-response ${run.result?.clarification ? "awaiting-user" : ""}`}>
            <div className="ai-agent-response-header">
              <span>{run.result?.clarification ? <><MessagesSquare size={14}/>等待回复</> : <><Check size={14}/>完成</>}</span>
              <small>{run.result?.clarification ? "需要确认任务方向" : `${run.result?.toolCallCount} 次操作 · ${run.result?.lineCount} 行代码`}</small>
              {run.result?.taskChange && <span className="ai-task-change-actions">
                <button disabled={!run.taskUndone} title={run.taskUndone ? "重新应用本次任务" : "任务修改已应用"} aria-label={run.taskUndone ? "重新应用本次任务" : "任务修改已应用"} onClick={() => { if (run.result?.taskChange && onApplyTaskChange(run.result.taskChange)) updateRun(run.id, { taskUndone: false }); }}><Check size={13}/></button>
                <button disabled={run.taskUndone} title={run.taskUndone ? "任务修改已撤销" : "撤销本次任务"} aria-label={run.taskUndone ? "任务修改已撤销" : "撤销本次任务"} onClick={() => { if (run.result?.taskChange && onUndoTaskChange(run.result.taskChange)) updateRun(run.id, { taskUndone: true }); }}><Undo2 size={13}/></button>
              </span>}
              <AiResponseActions markdown={run.result?.summary || "完成"} disabled={running} onRetry={() => void runAgent(run.prompt, run.id)}/>
            </div>
            <MarkdownContent>{run.result?.summary || "完成"}</MarkdownContent>
          </div>}
          {run.status === "stopped" && <div className="ai-agent-finished stopped"><Square size={12}/><span>已停止</span><button className="ai-run-retry" disabled={running} title="重新执行此任务" aria-label="重新执行此任务" onClick={() => void runAgent(run.prompt, run.id)}><RefreshCw size={13}/></button></div>}
          </div>
          {run.error && <div className="ai-agent-error"><span>{run.error}</span><span className="ai-agent-error-actions"><button disabled={running} onClick={() => void runAgent(run.prompt, run.id)} title="重新执行此任务" aria-label="重新执行此任务"><RefreshCw size={15}/></button><button onClick={onOpenSettings} title="AI 模型设置" aria-label="AI 模型设置"><Settings size={15}/></button></span></div>}
        </article>)}
      </div>
      {showScrollToLatest && runs.length > 0 && <button type="button" className="ai-scroll-to-latest" onClick={scrollToLatest} title="回到最新消息" aria-label="回到最新消息"><ArrowDown size={16}/></button>}
    </div>
    <div className="ai-composer">
      <div className="ai-composer-input">
        <textarea ref={promptRef} value={prompt} onChange={(event) => setPrompt(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void runAgent(); } }} placeholder={awaitingClarification ? "输入序号或补充要求..." : "输入任务..."} aria-label="AI 指令" rows={2}/>
        <div className="ai-composer-footer">
          <span className="ai-composer-scope" title={`${sceneName} · ${lineCount} 行代码`}><Code2 size={14}/><span>{sceneName}</span><small>{lineCount} 行</small></span>
          <span className="ai-composer-footer-spacer"/>
          <span className="ai-context-turns" title={`发送时携带最近 ${contextTurns.length} 轮对话`} aria-label={`${contextTurns.length} 轮上下文`}><MessagesSquare size={13}/><small>{contextTurns.length}</small></span>
          {running
            ? <button className="stop" onClick={stopAgent} title="停止智能体" aria-label="停止智能体"><Square size={13}/></button>
            : <button onClick={() => void runAgent()} disabled={!prompt.trim()} title="发送" aria-label="发送"><Send size={16}/></button>}
        </div>
      </div>
    </div>
  </section>;
}
