import { getAiModelConfig } from "./aiConfig";
import { selectAiProviderProtocol } from "./aiProtocol";
import { CodexAgentClient, mapCodexServerRequest, type CodexDynamicTool, type CodexRunTurnOptions, type CodexServerRequest, type CodexTurnResult } from "./codexAgentClient";
import type { AgentModelEvent } from "./agentEvents";
import { compactAgentToolResult } from "./agentV2/context";
import { parseAgentFollowUpSuggestions } from "./agentV2/followUps";
import { publishLiveStream } from "./agentV2/liveStream";
import { coreAgentTools } from "./agentV2/toolRegistry";
import { buildCodexPrompt } from "./codexPrompt";
import { getCodexThread } from "./codexThreadStore";
import type { AgentActivityEvent, AgentClarification, AgentProgress, AgentRunResult, AgentTokenUsage, AgentTool, RunVisualPythonAgentArgs } from "./agentV2/types";

export type CodexAgentTransport = {
  runTurn: (prompt: string, options: CodexRunTurnOptions) => Promise<CodexTurnResult>;
  respondToServerRequest: (requestId: string | number, result: unknown) => Promise<void>;
  rejectServerRequest: (requestId: string | number, message: string, code?: number) => Promise<void>;
};

export class CodexAgentUnavailableError extends Error {
  readonly cause?: unknown;
  readonly allowProtocolFallback: boolean;

  constructor(message: string, cause?: unknown, allowProtocolFallback = false) {
    super(message);
    this.name = "CodexAgentUnavailableError";
    this.cause = cause;
    this.allowProtocolFallback = allowProtocolFallback;
  }
}

const baseInstructions = `你是 Visual Python 内置的专业编程智能体。你必须通过宿主提供的工具读取和修改当前工程，不能只在聊天中粘贴代码并声称完成。优先定点修改已有代码；只有空文件或用户明确要求整体重写时才能整体替换。修改后必须取得真实检查结果。运行、渲染、保存、安装依赖和删除文档只在用户目标需要时调用，并接受宿主的唯一权限确认。工具失败后根据真实错误调整方案，不要重复相同调用。最终使用简洁 Markdown 总结真实结果，并附加最多三个与当前结果相关的隐藏建议：<!-- visual-python-followups: [{"label":"按钮文字","prompt":"下一步指令"}] -->。`;

function createUsage(): AgentTokenUsage {
  return { prompt: 0, completion: 0, total: 0, requests: 1, rounds: 1, inputCharacters: 0, toolSchemaCharacters: 0, toolResultCharacters: 0, cached: 0, uncachedPrompt: 0, cacheCreation: 0, cacheReportedRequests: 0 };
}

function uniqueTools(tools: AgentTool[]): AgentTool[] {
  const result = new Map<string, AgentTool>();
  for (const tool of tools) result.set(tool.definition.function.name, tool);
  return [...result.values()];
}

function toolsForRun(args: RunVisualPythonAgentArgs): AgentTool[] {
  const snapshot = args.host.getSnapshot();
  const workspaceMode = snapshot.workspaceMode === "visual" || snapshot.workspaceMode === "split" ? snapshot.workspaceMode : "code";
  return uniqueTools([...coreAgentTools, ...(args.host.getTools?.() || [])])
    .filter((tool) => !tool.workspaceModes?.length || tool.workspaceModes.includes(workspaceMode))
    .filter((tool) => args.mode !== "plan" || tool.readOnly);
}

function toDynamicTool(tool: AgentTool): CodexDynamicTool {
  return {
    type: "function",
    name: tool.definition.function.name,
    description: tool.definition.function.description,
    inputSchema: tool.definition.function.parameters,
  };
}

function resultFailed(result: Record<string, unknown>): boolean {
  if (result.ok === false || result.valid === false || result.success === false || result.saved === false || result.installed === false) return true;
  const validation = result.validation;
  return Boolean(validation && typeof validation === "object" && !Array.isArray(validation) && (validation as Record<string, unknown>).valid === false);
}

function responseText(toolName: string, result: Record<string, unknown>): string {
  try {
    return compactAgentToolResult(toolName, result);
  } catch {
    return JSON.stringify({ ok: false, error: "工具结果无法序列化" });
  }
}

export async function runCodexVisualPythonAgent(
  args: RunVisualPythonAgentArgs,
  transport: CodexAgentTransport = new CodexAgentClient(),
): Promise<AgentRunResult> {
  if (!args.prompt.trim()) throw new Error("请输入任务");
  if (args.host.getSnapshot().workspaceMode !== "code") throw new CodexAgentUnavailableError("Codex App Server 当前仅接入纯代码模式", undefined, true);
  const config = getAiModelConfig();
  const protocol = selectAiProviderProtocol(config);
  if (protocol.protocol === "chat-completions") {
    throw new CodexAgentUnavailableError("当前模型服务使用 Chat Completions，改用 Chat Completions Agent", undefined, true);
  }
  const tools = toolsForRun(args);
  const toolsByName = new Map(tools.map((tool) => [tool.definition.function.name, tool]));
  const usage = createUsage();
  const snapshot = args.host.getSnapshot();
  const existingThread = args.conversationTargetId ? getCodexThread(args.conversationTargetId, config) : undefined;
  const prompt = buildCodexPrompt({ prompt: args.prompt, history: args.history || [], snapshot }, !existingThread);
  const fallbackPrompt = buildCodexPrompt({ prompt: args.prompt, history: args.history || [], snapshot }, true);
  usage.inputCharacters = prompt.length;
  usage.toolSchemaCharacters = JSON.stringify(tools.map((tool) => tool.definition)).length;
  const messages = new Map<string, string>();
  const reasoning = new Map<string, string>();
  let toolCallCount = 0;
  let stateChanged = false;
  let executionStarted = false;
  let clarification: AgentClarification | undefined;
  let sequence = 0;

  const emit = (event: Omit<AgentActivityEvent, "id"> & { id?: string }) => args.onEvent({ ...event, id: event.id || `codex-${Date.now().toString(36)}-${sequence++}` });
  const progress = (value: AgentProgress) => args.onProgress?.({ ...value, tokenUsage: usage });
  const lastUiUpdate = new Map<string, number>();
  const shouldEmitUi = (key: string) => {
    const now = Date.now();
    const previous = lastUiUpdate.get(key) ?? Number.NEGATIVE_INFINITY;
    if (now - previous < 200) return false;
    lastUiUpdate.set(key, now);
    return true;
  };
  const handleEvent = (event: AgentModelEvent) => {
    if (event.type === "textDelta") {
      const itemId = event.itemId || "assistant";
      const content = `${messages.get(itemId) || ""}${event.delta}`;
      messages.set(itemId, content);
      publishLiveStream(`message-${itemId}`, content);
      if (!shouldEmitUi(`message-${itemId}`)) return;
      emit({ id: `message-${itemId}`, kind: "message", status: "running", title: content, markdown: content });
    } else if (event.type === "reasoningDelta") {
      const itemId = event.itemId || "reasoning";
      const content = `${reasoning.get(itemId) || ""}${event.delta}`;
      reasoning.set(itemId, content);
      publishLiveStream(`thinking-${itemId}`, content);
      if (!shouldEmitUi(`thinking-${itemId}`)) return;
      emit({ id: `thinking-${itemId}`, kind: "thinking", status: "running", title: "思考过程", markdown: content });
    } else if (event.type === "tokenUsage") {
      usage.prompt = event.inputTokens;
      usage.completion = event.outputTokens;
      usage.total = event.totalTokens;
      usage.cached = event.cachedInputTokens;
      usage.uncachedPrompt = Math.max(0, event.inputTokens - event.cachedInputTokens);
      usage.cacheReportedRequests = 1;
      usage.cacheHitRate = event.inputTokens > 0 ? event.cachedInputTokens / event.inputTokens : 0;
      progress({ phase: "thinking", label: "处理模型响应", tokenUsage: usage });
    } else if (event.type === "turnCompleted") {
      for (const [id, content] of messages) emit({ id: `message-${id}`, kind: "message", status: "done", title: content, markdown: content });
      for (const [id, content] of reasoning) emit({ id: `thinking-${id}`, kind: "thinking", status: "done", title: "思考过程", markdown: content });
    }
  };

  const handleServerRequest = async (request: CodexServerRequest) => {
    const toolRequest = mapCodexServerRequest(request);
    if (!toolRequest) {
      await transport.rejectServerRequest(request.id, "Visual Python 不允许 Codex 直接执行宿主文件或命令操作");
      return;
    }
    const toolName = toolRequest.name;
    const callId = toolRequest.callId;
    const tool = toolsByName.get(toolName);
    const toolId = `tool-${callId}`;
    if (!tool) {
      await transport.respondToServerRequest(request.id, { success: false, contentItems: [{ type: "inputText", text: JSON.stringify({ ok: false, error: `未知工具：${toolName}` }) }] });
      return;
    }
    toolCallCount += 1;
    emit({ id: toolId, kind: "tool", status: "running", title: tool.label, toolName });
    const permissionAllowed = !tool.requiresPermission || Boolean(args.onPermissionRequest && await args.onPermissionRequest({
      id: toolId,
      toolName,
      title: `需要确认：${tool.label}`,
      detail: "该操作会修改工程或启动任务。",
    }));
    if (!permissionAllowed) {
      const denied = { ok: false, error: "用户拒绝了这次操作" };
      emit({ id: toolId, kind: "tool", status: "error", title: tool.label, detail: denied.error, toolName, result: denied, resultText: denied.error });
      await transport.respondToServerRequest(request.id, { success: false, contentItems: [{ type: "inputText", text: JSON.stringify(denied) }] });
      return;
    }
    const toolArgs = toolRequest.arguments;
    try {
      let result: Record<string, unknown>;
      if (toolName === "ask_user") {
        const question = typeof toolArgs.question === "string" ? toolArgs.question : "需要你的选择";
        const options = Array.isArray(toolArgs.options) ? toolArgs.options.filter((item): item is string => typeof item === "string").slice(0, 4) : [];
        clarification = { question, options };
        result = { ok: true, question, options };
      } else {
        executionStarted = true;
        result = await args.host.executeTool(toolName, toolArgs, args.signal);
      }
      if (tool.longRunning && args.host.observeExecution && !resultFailed(result)) {
        result = { ...result, observation: await args.host.observeExecution(toolName, args.signal) };
      }
      if (tool.verificationTool && !resultFailed(result)) {
        result = { ...result, verification: await args.host.executeTool(tool.verificationTool, {}, args.signal) };
      }
      const failed = resultFailed(result);
      if (tool.changesState && !failed && result.changed !== false) stateChanged = true;
      const resultText = responseText(toolName, result);
      usage.toolResultCharacters += resultText.length;
      const codeChange = result.__codeChange && typeof result.__codeChange === "object" ? result.__codeChange as AgentActivityEvent["codeChange"] : undefined;
      emit({ id: toolId, kind: "tool", status: failed ? "error" : "done", title: tool.label, detail: failed ? "失败" : undefined, toolName, result, resultText, codeChange });
      await transport.respondToServerRequest(request.id, { success: !failed, contentItems: [{ type: "inputText", text: resultText }] });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emit({ id: toolId, kind: "tool", status: "error", title: tool.label, detail: message, toolName, resultText: message });
      await transport.respondToServerRequest(request.id, { success: false, contentItems: [{ type: "inputText", text: JSON.stringify({ ok: false, error: message }) }] });
    }
  };

  progress({ phase: "preparing", label: "准备当前工程上下文", tokenUsage: usage });
  try {
    const turn = await transport.runTurn(prompt, {
      config,
      effort: args.reasoningEffort,
      dynamicTools: tools.map(toDynamicTool),
      baseInstructions,
      developerInstructions: args.mode === "plan" ? "当前是计划模式，只能读取和分析，不得修改、运行或保存工程。" : "当前是智能体模式。所有工程操作必须使用 Visual Python 动态工具。",
      signal: args.signal,
      conversationTargetId: args.conversationTargetId,
      fallbackPrompt,
      onEvent: handleEvent,
      onServerRequest: handleServerRequest,
    });
    if (turn.status !== "completed") throw new Error(`Codex Agent 回合未完成：${turn.status || "unknown"}`);
  } catch (error) {
    if (args.signal.aborted) throw new Error("任务已停止");
    if (!stateChanged && !executionStarted) throw new CodexAgentUnavailableError(error instanceof Error ? error.message : String(error), error);
    throw error;
  }
  const finalRaw = [...messages.values()].filter(Boolean).at(-1) || clarification?.question || "任务已完成。";
  const finalResponse = parseAgentFollowUpSuggestions(finalRaw);
  progress({ phase: "completed", label: "任务完成", tokenUsage: usage });
  return {
    summary: finalResponse.content || "任务已完成。",
    toolCallCount,
    tokenUsage: usage,
    clarification,
    ...(finalResponse.suggestions.length ? { followUpSuggestions: finalResponse.suggestions } : {}),
  };
}
