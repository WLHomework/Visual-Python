import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Box, Check, ChevronRight, Clock3, Code2, Eye, Files, Film, LoaderCircle, Play, Plug, Redo2, Save, Send, Settings, Sparkles, Square, Undo2, Volume2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AiAgentActivity, AiAgentResult, AiAgentToolName, AiCodeChangeSnapshot, AiConversationTurn, AiTaskChangeSnapshot } from "./aiAgent";

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

const legacyAiHistoryStorageKey = "visual-python:ai-conversation-history";
const maxStoredRuns = 30;
const maxStoredHistoryCharacters = 1_500_000;

const aiHistoryStorageKey = (scope: string) => `${legacyAiHistoryStorageKey}:${encodeURIComponent(scope)}`;

function loadStoredRuns(scope: string): AgentRun[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(aiHistoryStorageKey(scope)) || "[]");
    if (!Array.isArray(value)) return [];
    return value.slice(-maxStoredRuns).flatMap((candidate): AgentRun[] => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
      const run = candidate as Partial<AgentRun>;
      if (typeof run.id !== "number" || typeof run.prompt !== "string" || !Array.isArray(run.activities)) return [];
      const status = run.status === "running" ? "stopped" : run.status;
      if (status !== "done" && status !== "error" && status !== "stopped") return [];
      return [{ ...run, id: run.id, prompt: run.prompt, activities: run.activities, status } as AgentRun];
    });
  } catch {
    return [];
  }
}

function storeRuns(scope: string, runs: AgentRun[]) {
  let stored = runs.slice(-maxStoredRuns).map((run) => run.status === "running" ? { ...run, status: "stopped" as const } : run);
  try {
    let serialized = JSON.stringify(stored);
    if (serialized.length > maxStoredHistoryCharacters) {
      stored = stored.map((run) => run.result?.taskChange ? { ...run, result: { ...run.result, taskChange: undefined } } : run);
      serialized = JSON.stringify(stored);
    }
    while (stored.length > 1 && serialized.length > maxStoredHistoryCharacters) {
      stored = stored.slice(1);
      serialized = JSON.stringify(stored);
    }
    localStorage.setItem(aiHistoryStorageKey(scope), serialized);
  } catch {
    // Conversation persistence must never interrupt the active agent.
  }
}

const suggestions = [
  "创建勾股定理动画",
  "让图形沿圆形路径移动",
  "添加标题和入场动画",
];

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

function MarkdownContent({ children, className = "" }: { children: string; className?: string }) {
  return <div className={`ai-markdown ${className}`}><ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown></div>;
}

function codeDiffStartLine(result?: string): number | null {
  const line = Number(result?.match(/^@@ 第 (\d+) 行 @@/)?.[1]);
  return Number.isInteger(line) && line > 0 ? line : null;
}

function isCodeChangeTool(toolName?: AiAgentToolName) {
  return toolName === "rename_scene" || toolName === "replace_code" || toolName === "edit_code" || toolName === "insert_statements" || toolName === "replace_function_body" || toolName === "add_import" || toolName === "add_voiceover" || toolName === "add_synchronized_voiceover";
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

export function AiAssistantPanel({ lineCount, sceneName, conversationScope, onOpenSettings, onRunAgent, onRevealCodeChange, onUndoCodeChange, onApplyCodeChange, onUndoTaskChange, onApplyTaskChange }: AiAssistantPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [runs, setRuns] = useState<AgentRun[]>(() => loadStoredRuns(conversationScope));
  const runId = useRef(Math.max(0, ...runs.map((run) => run.id)) + 1);
  const activeController = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const running = runs.some((run) => run.status === "running");

  useEffect(() => {
    if (running && threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [running, runs]);

  useEffect(() => {
    storeRuns(conversationScope, runs);
  }, [conversationScope, runs]);

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

  const runAgent = async (nextPrompt = prompt) => {
    const normalizedPrompt = nextPrompt.trim();
    if (!normalizedPrompt || running) return;
    const id = runId.current++;
    const controller = new AbortController();
    const history = runs
      .filter((run): run is AgentRun & { result: AiAgentResult } => run.status === "done" && Boolean(run.result))
      .map((run) => ({ user: run.prompt, assistant: run.result.summary }));
    activeController.current = controller;
    setRuns((items) => [...items, { id, prompt: normalizedPrompt, activities: [], status: "running" }]);
    setPrompt("");
    try {
      const result = await onRunAgent({
        prompt: normalizedPrompt,
        history,
        onActivity: (activity) => updateActivity(id, activity),
        signal: controller.signal,
      });
      setRuns((items) => {
        const completedRuns: AgentRun[] = items.map((run) => {
          if (run.id !== id) return run;
          const last = run.activities.at(-1);
          const activities = last?.kind === "message" && last.title.trim() === result.summary.trim()
            ? run.activities.slice(0, -1)
            : run.activities;
          return { ...run, status: "done", result, activities };
        });
        if (result.taskChange?.afterActiveSceneId && result.taskChange.afterActiveSceneId !== conversationScope) {
          queueMicrotask(() => storeRuns(result.taskChange!.afterActiveSceneId, completedRuns));
        }
        return completedRuns;
      });
    } catch (error) {
      if (controller.signal.aborted) updateRun(id, { status: "stopped", error: undefined });
      else updateRun(id, { status: "error", error: errorMessage(error) });
    } finally {
      if (activeController.current === controller) activeController.current = null;
    }
  };

  const stopAgent = () => activeController.current?.abort();

  return <section className="ai-assistant" aria-label="AI 编程助手">
    <div ref={threadRef} className={`ai-thread ${runs.length ? "has-runs" : ""}`} aria-live="polite">
      {!runs.length && <div className="ai-agent-empty" aria-label="指令示例">
        {suggestions.map((suggestion) => <button key={suggestion} onClick={() => void runAgent(suggestion)}><Sparkles size={15}/><span>{suggestion}</span></button>)}
      </div>}
      {runs.map((run) => <article className="ai-agent-run" key={run.id}>
        <p className="ai-agent-prompt">{run.prompt}</p>
        <div className="ai-agent-activity-list">
          {run.activities.map((activity) => activity.kind === "message"
            ? <div className={`ai-agent-narration ${activity.status}`} key={activity.id}>
              {activity.status === "running" ? <LoaderCircle className="spin" size={15}/> : <Sparkles size={15}/>}<MarkdownContent>{activity.title}</MarkdownContent>
            </div>
            : activity.result
              ? <details className={`ai-agent-tool ${activity.status}`} key={activity.id}>
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
                      if (activity.codeChange && onApplyCodeChange(activity.codeChange)) updateActivity(run.id, { ...activity, undone: false, detail: "已应用" });
                    }}><Check size={14}/></button>
                    <button disabled={activity.undone} title={activity.undone ? "已撤销" : "撤销这次 AI 修改"} aria-label={activity.undone ? "已撤销" : "撤销这次 AI 修改"} onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (activity.codeChange && onUndoCodeChange(activity.codeChange)) updateActivity(run.id, { ...activity, undone: true, detail: "已撤销" });
                    }}><Undo2 size={14}/></button>
                  </span>}
                </summary>
                <ToolResult activity={activity} onRevealCodeChange={onRevealCodeChange}/>
              </details>
              : <div className={`ai-agent-tool-line ${activity.status}`} key={activity.id}>
                <span className="ai-agent-tool-icon">{activity.status === "running" ? <LoaderCircle className="spin" size={15}/> : activity.status === "error" ? <AlertCircle size={15}/> : activityIcon(activity.toolName)}</span>
                <strong>{activity.title}</strong>
                {activity.detail && <small>{activity.detail}</small>}
              </div>)}
          {run.status === "done" && <div className="ai-agent-finished"><Check size={15}/><MarkdownContent>{run.result?.summary || "完成"}</MarkdownContent><small>{run.result?.toolCallCount} 次操作 · {run.result?.lineCount} 行代码</small>{run.result?.taskChange && <span className="ai-task-change-actions"><button disabled={!run.taskUndone} title="重新应用本次任务" onClick={() => { if (run.result?.taskChange && onApplyTaskChange(run.result.taskChange)) updateRun(run.id, { taskUndone: false }); }}><Check size={13}/>应用</button><button disabled={run.taskUndone} title="撤销本次任务对所有场景的修改" onClick={() => { if (run.result?.taskChange && onUndoTaskChange(run.result.taskChange)) updateRun(run.id, { taskUndone: true }); }}><Undo2 size={13}/>撤销任务</button></span>}</div>}
          {run.status === "stopped" && <div className="ai-agent-finished stopped"><Square size={12}/><span>已停止</span></div>}
        </div>
        {run.error && <div className="ai-agent-error"><span>{run.error}</span><button onClick={onOpenSettings} title="AI 模型设置" aria-label="AI 模型设置"><Settings size={15}/></button></div>}
      </article>)}
    </div>
    <div className="ai-composer">
      <div className="ai-composer-context"><Code2 size={14}/><span>{sceneName}</span><em>{lineCount}</em></div>
      <div className="ai-composer-input">
        <textarea value={prompt} onChange={(event) => setPrompt(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void runAgent(); } }} placeholder="输入任务..." aria-label="AI 指令" rows={3}/>
        {running
          ? <button className="stop" onClick={stopAgent} title="停止智能体" aria-label="停止智能体"><Square size={14}/></button>
          : <button onClick={() => void runAgent()} disabled={!prompt.trim()} title="发送" aria-label="发送"><Send size={17}/></button>}
      </div>
    </div>
  </section>;
}
