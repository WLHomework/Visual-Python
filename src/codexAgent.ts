import { getAiModelConfig } from "./aiConfig";
import { selectAiProviderProtocol } from "./aiProtocol";
import { CodexAgentClient, mapCodexServerRequest, type CodexDynamicTool, type CodexRunTurnOptions, type CodexServerRequest, type CodexTurnResult } from "./codexAgentClient";
import type { AgentModelEvent } from "./agentEvents";
import { compactAgentToolResult, compactBlockCatalogForPrompt, graphicalCatalogInstructions } from "./agentV2/context";
import { parseAgentFollowUpSuggestions } from "./agentV2/followUps";
import { publishLiveStream } from "./agentV2/liveStream";
import { coreAgentTools } from "./agentV2/toolRegistry";
import { buildCodexPrompt } from "./codexPrompt";
import { createDynamicToolsSignature, getCodexThreadWithTools } from "./codexThreadStore";
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

export class CodexAgentLoopGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodexAgentLoopGuardError";
  }
}

export class CodexAgentToolFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodexAgentToolFailureError";
  }
}

const baseInstructions = `你是 Visual Python 内置的专业编程智能体。你必须通过宿主提供的工具读取和修改当前工程，不能只在聊天中粘贴代码并声称完成。优先定点修改已有代码；只有空文件或用户明确要求整体重写时才能整体替换。修改后必须取得真实检查结果。运行、渲染、保存、安装依赖和删除文档只在用户目标需要时调用，并接受宿主的唯一权限确认。工具失败后根据真实错误调整方案，不要重复相同调用。最终使用简洁 Markdown 总结真实结果，并附加最多三个与当前结果相关的隐藏建议：<!-- visual-python-followups: [{"label":"按钮文字","prompt":"下一步指令"}] -->。`;

function graphicalInstructions(blockCatalog?: string): string {
  return `This is a graphical workspace. First classify the user's intent as animation, static drawing, turtle tracing, data processing, mathematical computation, file/CSV work, or general Python. Choose blocks from purpose, capabilities, intentTags, input/output types, and the live Blockly contract; never choose Matplotlib merely because the request says draw or graphical. Treat registered Blockly definitions and connection contracts as the source of truth; the task catalog is a compact summary, not the full block tree. ${graphicalCatalogInstructions(blockCatalog)} Compatible same-level statement blocks created in one plan are automatically chained in create order and placed automatically, so do not emit redundant connect operations for chaining or placement, and never switch to replace to fix placement; use {refs:[...]} for nested statement inputs such as loop or branch bodies. A failed plan changes nothing: repair only the operations listed in issues and do not rebuild the workspace.`;
}

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
  if (Boolean(validation && typeof validation === "object" && !Array.isArray(validation) && (validation as Record<string, unknown>).valid === false)) return true;
  const verification = result.verification;
  return Boolean(verification && typeof verification === "object" && !Array.isArray(verification) && resultFailed(verification as Record<string, unknown>));
}

function responseText(toolName: string, result: Record<string, unknown>): string {
  try {
    return compactAgentToolResult(toolName, result);
  } catch {
    return JSON.stringify({ ok: false, error: "工具结果无法序列化" });
  }
}

function stableToolArguments(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableToolArguments).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableToolArguments((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function toolCallFingerprint(toolName: string, args: Record<string, unknown>): string {
  return `${toolName}:${stableToolArguments(args)}`;
}

function failureFingerprint(toolName: string, result: Record<string, unknown>): string {
  const relevant = {
    error: result.error,
    message: result.message,
    issues: result.issues,
    validation: result.validation,
  };
  return `${toolName}:${stableToolArguments(relevant)}`;
}

export async function runCodexVisualPythonAgent(
  args: RunVisualPythonAgentArgs,
  transport: CodexAgentTransport = new CodexAgentClient(),
): Promise<AgentRunResult> {
  if (!args.prompt.trim()) throw new Error("请输入任务");
  const config = getAiModelConfig();
  const protocol = selectAiProviderProtocol(config);
  if (protocol.protocol === "chat-completions") {
    throw new CodexAgentUnavailableError("当前模型服务使用 Chat Completions，改用 Chat Completions Agent", undefined, true);
  }
  const tools = toolsForRun(args);
  const toolsByName = new Map(tools.map((tool) => [tool.definition.function.name, tool]));
  const dynamicTools = tools.map(toDynamicTool);
  const dynamicToolsSignature = createDynamicToolsSignature(dynamicTools);
  const usage = createUsage();
  const snapshot = args.host.getSnapshot();
  const workspaceMode = snapshot.workspaceMode === "visual" || snapshot.workspaceMode === "split" ? snapshot.workspaceMode : "code";
  const graphicalWorkspace = workspaceMode === "visual" || workspaceMode === "split";
  const existingThread = args.conversationTargetId
    ? getCodexThreadWithTools(args.conversationTargetId, config, dynamicToolsSignature)
    : undefined;
  // A resumed Thread retains conversation context, not the current Blockly
  // toolbox state. Recompute the task-scoped catalog for every graphical turn.
  const blockCatalog = graphicalWorkspace ? args.host.getBlockCatalog?.(args.prompt) : undefined;
  // Keep the catalog state used by the developer instructions identical to the
  // catalog that is actually injected into the prompt. Otherwise truncation can
  // hide the omitted-count marker from the model's discovery policy.
  const promptBlockCatalog = blockCatalog?.trim()
    ? compactBlockCatalogForPrompt(blockCatalog.trim()) || undefined
    : undefined;
  const prompt = buildCodexPrompt({ prompt: args.prompt, history: args.history || [], snapshot, blockCatalog: promptBlockCatalog }, !existingThread);
  const fallbackPrompt = buildCodexPrompt({ prompt: args.prompt, history: args.history || [], snapshot, blockCatalog: promptBlockCatalog }, true);
  usage.inputCharacters = prompt.length;
  usage.toolSchemaCharacters = JSON.stringify(tools.map((tool) => tool.definition)).length;
  const messages = new Map<string, string>();
  const messageOrder: string[] = [];
  const reasoning = new Map<string, string>();
  let toolCallCount = 0;
  let stateChanged = false;
  let stateVersion = 0;
  let executionStarted = false;
  let clarification: AgentClarification | undefined;
  let sequence = 0;
  const readOnlyToolCache = new Map<string, { stateVersion: number; result: Record<string, unknown>; resultText: string }>();
  const repeatedFailures = new Map<string, number>();
  const unresolvedFailures = new Map<string, { toolName: string; message: string; stateVersion: number }>();
  const maxRepeatedFailures = 3;

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
      if (!messages.has(itemId)) messageOrder.push(itemId);
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
      unresolvedFailures.set(`unknown:${toolName}`, { toolName, message: `Unknown tool: ${toolName}`, stateVersion });
      await transport.respondToServerRequest(request.id, { success: false, contentItems: [{ type: "inputText", text: JSON.stringify({ ok: false, error: `未知工具：${toolName}` }) }] });
      return;
    }
    toolCallCount += 1;
    const toolArgs = toolRequest.arguments;
    const callFingerprint = toolCallFingerprint(toolName, toolArgs);
    const cachedRead = tool.readOnly ? readOnlyToolCache.get(callFingerprint) : undefined;
    if (cachedRead?.stateVersion === stateVersion) {
      const cachedResult = { ...cachedRead.result, cached: true, stateUnchanged: true };
      const cachedText = responseText(toolName, cachedResult);
      usage.toolResultCharacters += cachedText.length;
      emit({ id: toolId, kind: "tool", status: "done", title: tool.label, detail: "复用未变化的读取结果", toolName, result: cachedResult, resultText: cachedText });
      await transport.respondToServerRequest(request.id, { success: true, contentItems: [{ type: "inputText", text: cachedText }] });
      return;
    }
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
      const resultText = responseText(toolName, result);
      const failed = resultFailed(result);
      if (failed) {
        const failureKey = failureFingerprint(toolName, result);
        unresolvedFailures.set(failureKey, {
          toolName,
          message: typeof result.error === "string" ? result.error : resultText,
          stateVersion,
        });
      } else {
        for (const [failureKey, failure] of unresolvedFailures) {
          if (failure.toolName === toolName && failure.stateVersion === stateVersion) unresolvedFailures.delete(failureKey);
        }
      }
      if (tool.changesState && !failed && result.changed !== false) stateChanged = true;
      if (tool.changesState && !failed && result.changed !== false) {
        stateVersion += 1;
        readOnlyToolCache.clear();
      }
      usage.toolResultCharacters += resultText.length;
      const codeChange = result.__codeChange && typeof result.__codeChange === "object" ? result.__codeChange as AgentActivityEvent["codeChange"] : undefined;
      emit({ id: toolId, kind: "tool", status: failed ? "error" : "done", title: tool.label, detail: failed ? "失败" : undefined, toolName, result, resultText, codeChange });
      if (!failed && tool.readOnly) readOnlyToolCache.set(callFingerprint, { stateVersion, result, resultText });
      if (failed) {
        const failureKey = failureFingerprint(toolName, result);
        const attempts = (repeatedFailures.get(failureKey) || 0) + 1;
        repeatedFailures.set(failureKey, attempts);
        if (attempts >= maxRepeatedFailures) {
          const guardedMessage = `${typeof result.error === "string" ? result.error : resultText}\n同一工具以相同原因连续失败 ${attempts} 次，已停止继续重复调用。请根据上述具体错误修改方案后再继续。`;
          await transport.respondToServerRequest(request.id, { success: false, contentItems: [{ type: "inputText", text: JSON.stringify({ ok: false, error: guardedMessage, terminal: true }) }] });
          throw new CodexAgentLoopGuardError(guardedMessage);
        }
      }
      await transport.respondToServerRequest(request.id, { success: !failed, contentItems: [{ type: "inputText", text: resultText }] });
    } catch (error) {
      if (error instanceof CodexAgentLoopGuardError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const failureKey = `${toolName}:${message}`;
      unresolvedFailures.set(failureKey, { toolName, message, stateVersion });
      const attempts = (repeatedFailures.get(failureKey) || 0) + 1;
      repeatedFailures.set(failureKey, attempts);
      const guardedMessage = attempts >= maxRepeatedFailures
        ? `${message}\n同一工具以相同原因连续失败 ${attempts} 次，已停止继续重复调用。请根据上述具体错误修改方案后再继续。`
        : message;
      emit({ id: toolId, kind: "tool", status: "error", title: tool.label, detail: guardedMessage, toolName, resultText: guardedMessage });
      await transport.respondToServerRequest(request.id, { success: false, contentItems: [{ type: "inputText", text: JSON.stringify({ ok: false, error: guardedMessage, ...(attempts >= maxRepeatedFailures ? { terminal: true } : {}) }) }] });
      if (attempts >= maxRepeatedFailures) throw new CodexAgentLoopGuardError(guardedMessage);
    }
  };

  progress({ phase: "preparing", label: "准备当前工程上下文", tokenUsage: usage });
  try {
    const developerInstructions = args.mode === "plan"
      ? "当前是计划模式，只能读取和分析，不得修改、运行或保存工程。"
      : `当前是智能体模式。所有工程操作必须使用 Visual Python 动态工具。${graphicalWorkspace ? `\n${graphicalInstructions(promptBlockCatalog)}` : ""}`;
    const turn = await transport.runTurn(prompt, {
      config,
      effort: args.reasoningEffort,
      dynamicTools,
      baseInstructions,
      developerInstructions,
      signal: args.signal,
      conversationTargetId: args.conversationTargetId,
      fallbackPrompt,
      onEvent: handleEvent,
      onServerRequest: handleServerRequest,
    });
    if (turn.status !== "completed") throw new Error(`Codex Agent 回合未完成：${turn.status || "unknown"}`);
    const failures = [...unresolvedFailures.values()]
      .filter((failure) => failure.stateVersion === stateVersion)
      .map((failure) => `${failure.toolName}: ${failure.message}`)
      .join("\n");
    if (failures) throw new CodexAgentToolFailureError(`任务未完成，工具执行失败：\n${failures}`);
  } catch (error) {
    if (args.signal.aborted) throw new Error("任务已停止");
    if (error instanceof CodexAgentLoopGuardError) throw error;
    if (error instanceof CodexAgentToolFailureError) throw error;
    if (!stateChanged && !executionStarted) throw new CodexAgentUnavailableError(error instanceof Error ? error.message : String(error), error);
    throw error;
  }
  const finalRaw = messageOrder
    .map((id) => messages.get(id))
    .filter((content): content is string => Boolean(content?.trim()))
    .join("\n\n")
    || clarification?.question
    || "任务已完成。";
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
