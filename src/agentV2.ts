import { streamAiChat, type AiChatMessage, type AiChatToolCall } from "./aiConfig";
import { changesAgentState, isCacheableTool, isLongRunningTool, requiresPermission, toolLabel, toolsForAgentMode } from "./agentV2/toolRegistry";
import { createAgentMemory, rememberAgentDecision, rememberAgentEvidence, serializeAgentMemory } from "./agentV2/memory";
import { appendAgentTurn, buildAgentRequestMessages, compactAgentAssistantMessage, compactAgentToolResult, createAgentRequestContext } from "./agentV2/context";
import { createAgentTokenUsage, mergeProviderTokenUsage, recordAgentRequest, recordAgentToolResult } from "./agentV2/tokenLedger";
import type { AgentActivityEvent, AgentClarification, AgentProgress, AgentRunResult, RunVisualPythonAgentArgs } from "./agentV2/types";

export type { AgentActivityEvent, AgentCodeChange, AgentConversationTurn, AgentHost, AgentMode, AgentProgress, AgentRunResult, AgentTokenUsage, RunVisualPythonAgentArgs, AiAgentActivity, AiAgentExecution, AiAgentMode, AiAgentPermissionRequest, AiAgentPlanStep, AiAgentProgress, AiAgentResult, AiAgentToolName, AiCodeChangeSnapshot, AiCodeEdit, AiConversationTurn, AiTaskChangeSnapshot } from "./agentV2/types";
export { toolsForAgentMode, visualPythonTools } from "./agentV2/toolRegistry";
export { createAgentMemory, rememberAgentDecision, rememberAgentEvidence, serializeAgentMemory } from "./agentV2/memory";
export { createVisualPythonHostAdapter, type VisualPythonHostServices } from "./agentV2/hostAdapter";
export { applyExactCodeEdits, createCodeChangePreview, restoreMissingBaseIndent } from "./agentV2/codeChanges";

const maxRounds = 12;
// Keep each decision turn bounded. This is the portable Chat Completions control;
// provider-specific reasoning fields are intentionally not sent.
const maxTokensPerRequest = 8_192;
const maxToolResultCharacters = 6000;
const stopError = "任务已停止";
const mutationTools = new Set(["replace_code", "edit_code", "insert_statements", "replace_function_body", "add_import", "add_voiceover", "add_synchronized_voiceover", "format_code", "undo_code", "redo_code"]);

const systemRules = `你是 Visual Python 的专业软件智能体。你通过工具直接操控当前工程，而不是只在聊天中给出代码。

你必须遵守：
1. 先读取必要的当前状态，再决定下一步；不要猜测场景、文件、对象或资源的 ID。
2. 用户要求修改、创建、运行、渲染或保存时，必须通过工具完成，不能只回复一段代码并声称完成。
3. 代码修改优先使用定点编辑工具；只有空文件或用户明确要求整体重写时才使用 replace_code。
4. 每次修改后调用 check_code；涉及 Manim 场景时还要调用 validate_scene。
5. 运行或渲染由你根据任务目标判断。用户明确禁止时绝不执行；用户要求交付可视结果时必须验证真实输出。
6. 工具返回失败时，读取错误并改变修复方案；不要重复相同的错误调用。
7. 只有取得工具结果和验证证据后，才能宣称任务完成。
8. 普通回复使用清晰的 Markdown。工具调用前可以用一句简短说明，避免重复规划和冗长解释。
9. 需要用户决定时调用 ask_user，并提供 2 到 4 个简洁编号选项；不确定的关键选择不要擅自执行。
10. run_project、render_manim、install_dependencies、delete_scene 和 save_project 都由宿主提供唯一的执行确认。不要再用 ask_user 询问“是否执行”或“是否渲染”；用户已经明确提出操作时直接调用对应工具，只有场景、输出类型等真正影响结果的选择存在歧义时才询问。
11. 不要输出 XML、DSML、伪工具标签或原始 JSON 作为用户可见回复。

平台工作方式：
- 每个场景是完整、独立的 Python 文件，通常包含 from manim import * 和一个 Scene 子类；不要假定存在公共代码文件。
- 当前编辑器状态由宿主管理。get_context 用于读取当前场景摘要，get_scene 用于按 ID 读取其他场景；场景切换前先用 list_scenes 取得真实 ID。
- 代码修改首选 edit_code、insert_statements、replace_function_body 和 add_import。oldText 必须来自当前真实代码且精确匹配；修改失败后重新读取相关代码，不要猜测缩进或文本。
- replace_code 只适用于空场景、全新场景或用户明确要求整体重写。已有代码的局部需求不得整文件替换。
- 修改工具由宿主自动执行 Python 语法检查；仍需根据任务调用 validate_scene 检查 Manim 场景结构。检查成功后不要重复检查同一版本。
- Manim 对象不能直接传给 Scene.play。对象使用 self.add，动画使用 Create、Write、FadeIn 等 Animation。渲染失败时依据真实问题修复，不要把纯代码错误描述为积木连接错误。
- 工程资源通过 list_resources 和 get_resource 获取可用路径；不要虚构图片、音频、字体或资源 ID。资源引用后调用 check_resources。
- 配音前调用 get_voiceover_context 获取真实配置和角色。使用 add_voiceover 或 add_synchronized_voiceover 后调用 check_voiceover；配置缺失时说明需要用户配置，不要伪造音频。
- 依赖操作先用 check_dependencies。missing 为空表示已经安装；只有确实缺失且用户允许时才调用 install_dependencies。
- run_project 和 render_manim 是长任务，宿主会等待并返回真实观察结果。不要轮询，不要在成功观察后重复执行。
- render_manim 支持视频和图片。用户未指定输出类型且选择会显著影响结果时才询问；用户明确要求时直接调用，由宿主负责唯一确认。
- save_project 只在用户当前请求明确包含保存要求时执行。代码修改成功不等于需要保存工程。
- 删除场景、安装依赖、运行、渲染和保存由宿主确认。用户拒绝后视为已取消，不要重复请求相同操作。
- ask_user 只用于会显著改变结果的真实歧义。颜色、布局、动画节奏等普通实现细节由你专业判断，避免不必要的往返。
- 最终回复只总结实际完成内容、验证结果和需要用户决定的事项。不要复述全部工具调用或输出未经处理的内部数据。`;

function createId(prefix: string, index: number): string {
  return `${prefix}-${Date.now().toString(36)}-${index}`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}\n[结果已截断]` : value;
}

function serializeResult(result: Record<string, unknown>): string {
  try {
    return truncate(JSON.stringify(result), maxToolResultCharacters);
  } catch {
    return "工具返回了无法序列化的结果";
  }
}

function parseDsmlAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(/([A-Za-z_][\w-]*)\s*=\s*(["'])([\s\S]*?)\2/g)) attributes[match[1]] = match[3];
  return attributes;
}

function parseDsmlToolCalls(content: string): AiChatToolCall[] {
  const invokePattern = /<\s*[|｜]DSML[|｜]invoke\b([^>]*)>/gi;
  const invokes = [...content.matchAll(invokePattern)];
  return invokes.flatMap((invoke, index) => {
    const invokeAttributes = parseDsmlAttributes(invoke[1] || "");
    const name = invokeAttributes.name?.trim();
    if (!name) return [];
    const start = (invoke.index ?? 0) + invoke[0].length;
    const end = invokes[index + 1]?.index ?? content.length;
    const body = content.slice(start, end);
    const parameterPattern = /<\s*[|｜]DSML[|｜]parameter\b([^>]*)>/gi;
    const parameters: Record<string, unknown> = {};
    const parameterStarts = [...body.matchAll(parameterPattern)];
    parameterStarts.forEach((parameter, parameterIndex) => {
      const attributes = parseDsmlAttributes(parameter[1] || "");
      const parameterName = attributes.name?.trim();
      if (!parameterName) return;
      const valueStart = (parameter.index ?? 0) + parameter[0].length;
      const valueEnd = parameterStarts[parameterIndex + 1]?.index ?? body.length;
      const rawValue = body.slice(valueStart, valueEnd)
        .replace(/<\s*\/?\s*[|｜]DSML[|｜](?:parameter|tool_calls|invoke)[^>]*>/gi, "")
        .trim();
      if (attributes.string?.toLowerCase() === "false") {
        try {
          parameters[parameterName] = JSON.parse(rawValue);
          return;
        } catch {
          // Keep malformed values as strings so the tool loop can report the error.
        }
      }
      parameters[parameterName] = rawValue;
    });
    return [{ id: `compat-${index}`, type: "function" as const, function: { name, arguments: JSON.stringify(parameters) } }];
  });
}

export function normalizeAiToolCalls(calls: AiChatToolCall[]): AiChatToolCall[] {
  const used = new Set<string>();
  return calls.map((call, index) => {
    const base = (typeof call.id === "string" ? call.id.trim() : "") || `compat-${index}`;
    let id = base;
    let suffix = 2;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    return { ...call, id };
  });
}

export function parseTextToolCalls(content: string): AiChatToolCall[] {
  const dsmlCalls = parseDsmlToolCalls(content);
  if (dsmlCalls.length) return normalizeAiToolCalls(dsmlCalls);
  const stripped = content.replace(/<\s*[|｜]DSML[|｜][^>]*>/gi, "").replace(/<\s*\/\s*[|｜]DSML[|｜][^>]*>/gi, "").trim();
  const candidates = [stripped, stripped.match(/\{[\s\S]*\}/)?.[0] || ""];
  for (const candidate of candidates) {
    try {
      const value: unknown = JSON.parse(candidate);
      const raw = Array.isArray(value) ? value : typeof value === "object" && value !== null && "tool_calls" in value ? (value as { tool_calls?: unknown }).tool_calls : [value];
      if (!Array.isArray(raw)) continue;
      const calls = raw.flatMap((item, index) => {
        if (!item || typeof item !== "object") return [];
        const record = item as Record<string, unknown>;
        const functionValue = record.function && typeof record.function === "object" ? record.function as Record<string, unknown> : record;
        const name = typeof record.name === "string" ? record.name : typeof functionValue.name === "string" ? functionValue.name : "";
        const args = functionValue.arguments ?? record.arguments ?? record.parameters ?? {};
        if (!name) return [];
        return [{ id: typeof record.id === "string" ? record.id : `compat-${index}`, type: "function" as const, function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } }];
      });
      if (calls.length) return normalizeAiToolCalls(calls);
    } catch {
      // Plain Markdown is a normal assistant response.
    }
  }
  return [];
}

function hasCompleteToolCalls(calls: AiChatToolCall[]): boolean {
  return calls.length > 0 && calls.every((call) => {
    try {
      const value: unknown = JSON.parse(call.function.arguments.trim() || "{}");
      return Boolean(value && typeof value === "object" && !Array.isArray(value));
    } catch {
      return false;
    }
  });
}

function explicitlyRequestsProjectSave(prompt: string): boolean {
  const normalized = prompt.trim();
  if (!normalized || /(不要|无需|不需要|禁止|勿).{0,12}(保存|存储|写入|持久化|save|persist)/i.test(normalized)) return false;
  return /(保存|存储|写入|持久化|\bsave\b|\bpersist\b)/i.test(normalized);
}

function getClarification(result: Record<string, unknown>): AgentClarification | undefined {
  if (typeof result.question !== "string" || !Array.isArray(result.options)) return undefined;
  const options = result.options.filter((option): option is string => typeof option === "string").slice(0, 4);
  return options.length >= 2 ? { question: result.question, options } : undefined;
}

function isExecutionStarted(result: Record<string, unknown>): boolean {
  return result.started === true || result.running === true || result.rendering === true;
}

function observationFailureDetail(observation: Record<string, unknown>): string | undefined {
  const problems = Array.isArray(observation.problems) ? observation.problems : [];
  const problemMessages = problems.map((problem) => {
    if (typeof problem === "string") return problem;
    if (!problem || typeof problem !== "object") return "";
    const message = (problem as Record<string, unknown>).message;
    return typeof message === "string" ? message : "";
  }).filter(Boolean);
  if (problemMessages.length) return problemMessages.join("\n");
  if (typeof observation.error === "string" && observation.error.trim()) return observation.error;
  const inspection = observation.inspection;
  if (inspection && typeof inspection === "object") {
    const warning = (inspection as Record<string, unknown>).warning;
    if (typeof warning === "string" && warning.trim()) return warning;
    const error = (inspection as Record<string, unknown>).error;
    if (typeof error === "string" && error.trim()) return error;
  }
  return undefined;
}

function isSuccessfulObservation(toolName: string, observation: Record<string, unknown>): boolean {
  if (observation.success === false || observation.failed === true) return false;
  if (Array.isArray(observation.problems) && observation.problems.length > 0) return false;
  if (toolName !== "render_manim") return observation.running !== true && observation.rendering !== true;
  const renderOutput = observation.renderOutput;
  if (!renderOutput || typeof renderOutput !== "object" || typeof (renderOutput as Record<string, unknown>).path !== "string") return false;
  const inspection = observation.inspection;
  return !inspection || typeof inspection !== "object" || (inspection as Record<string, unknown>).valid !== false;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}

function toolCallFingerprint(name: string, args: Record<string, unknown>): string {
  return `${name}:${stableSerialize(args)}`;
}

function failureDetail(result: Record<string, unknown>): string | undefined {
  for (const key of ["error", "warning", "detail", "message"]) {
    const value = result[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

export async function runVisualPythonAgent({ prompt, history = [], mode = "agent", host, onEvent, onProgress, onPermissionRequest, signal }: RunVisualPythonAgentArgs): Promise<AgentRunResult> {
  if (!prompt.trim()) throw new Error("请输入任务");
  const memory = createAgentMemory(history);
  const requestContext = createAgentRequestContext({
    system: `${systemRules}\n\n当前模式：${mode === "plan" ? "计划模式，只能读取和分析，不得修改工程" : "智能体模式，可以执行必要的工程操作"}`,
    history,
    prompt,
    snapshot: host.getSnapshot(),
    memory: serializeAgentMemory(memory),
  });
  const usage = createAgentTokenUsage();
  let requestMessages = buildAgentRequestMessages(requestContext);
  const taskTools = toolsForAgentMode(mode);
  let toolCallCount = 0;
  let sequence = 0;
  let truncatedContinuations = 0;
  let finalSummary = "";
  let clarification: AgentClarification | undefined;
  let stateVersion = 0;
  let consecutiveNoProgress = 0;
  const failedToolCalls = new Map<string, { toolName: string; message: string; blocksCompletion: boolean; stateVersion: number; attempts: number; lastAttempt: number }>();
  const successfulReadCache = new Map<string, { stateVersion: number; result: Record<string, unknown>; resultText: string; modelResult: string }>();
  const recordFailure = (fingerprint: string, toolName: string, message: string, blocksCompletion = true) => {
    const previous = failedToolCalls.get(fingerprint);
    const attempts = previous?.stateVersion === stateVersion ? previous.attempts + 1 : 1;
    failedToolCalls.set(fingerprint, { toolName, message, blocksCompletion, stateVersion, attempts, lastAttempt: toolCallCount });
  };
  const clearFailuresFor = (toolName: string) => {
    for (const [fingerprint, failure] of failedToolCalls) {
      if (failure.toolName === toolName) failedToolCalls.delete(fingerprint);
    }
  };

  const emit = (event: Omit<AgentActivityEvent, "id"> & { id?: string }) => {
    onEvent({ ...event, id: event.id || createId(event.kind, sequence++) });
  };
  const reportProgress = (progress: AgentProgress) => onProgress?.({ ...progress, tokenUsage: progress.tokenUsage || usage });
  const pushToolResponse = (messages: AiChatMessage[], toolCallId: string, content: string) => {
    messages.push({ role: "tool", toolCallId, content });
    recordAgentToolResult(usage, content);
  };

  for (let round = 1; round <= maxRounds; round += 1) {
    if (signal.aborted) throw new Error(stopError);
    const messageId = `message-${round}`;
    let content = "";
    let reasoning = "";
    let thinkingEmitted = false;
    recordAgentRequest(usage, requestMessages, taskTools, round);
    reportProgress({ phase: "thinking", label: round === 1 ? "分析当前请求和工程状态" : "根据执行结果决定下一步" });
    emit({ id: messageId, kind: "message", status: "running", title: "", markdown: "" });
    const completion = await streamAiChat(requestMessages, (delta) => {
      content += delta;
      emit({ id: messageId, kind: "message", status: "running", title: content, markdown: content });
    }, {
      maxTokens: maxTokensPerRequest,
      signal,
      tools: taskTools,
      toolChoice: "auto",
      onReasoningDelta: (delta) => {
        reasoning += delta;
        if (!thinkingEmitted) {
          thinkingEmitted = true;
          emit({ id: `thinking-${round}`, kind: "thinking", status: "running", title: "思考过程", markdown: reasoning });
          return;
        }
        emit({ id: `thinking-${round}`, kind: "thinking", status: "running", title: "思考过程", markdown: reasoning });
      },
    });
    mergeProviderTokenUsage(usage, completion);
    reportProgress({ phase: "thinking", label: "已收到模型决策" });
    if (reasoning) emit({ id: `thinking-${round}`, kind: "thinking", status: "done", title: "思考过程", markdown: reasoning });
    const parsedCalls = completion.toolCalls.length ? completion.toolCalls : parseTextToolCalls(content);
    const calls = normalizeAiToolCalls(parsedCalls).filter((call) => taskTools.some((tool) => tool.function.name === call.function.name));
    if (completion.truncated && (!calls.length || !hasCompleteToolCalls(calls))) {
      truncatedContinuations += 1;
      if (truncatedContinuations > 3) throw new Error("模型连续多轮达到输出上限，已停止重复生成");
      requestMessages = appendAgentTurn(requestMessages, [
        { role: "assistant", content: content.trim() || "本轮响应尚未完成。" },
        { role: "user", content: "上一轮响应达到本轮输出上限。请从中断位置继续，不要重复已经完成的内容；如果需要调用工具，请输出完整的工具调用。" },
      ]);
      reportProgress({ phase: "thinking", label: "继续整理响应" });
      continue;
    }
    if (!calls.length) {
        const unresolvedFailures = [...failedToolCalls.values()].filter((failure) => failure.blocksCompletion && failure.stateVersion === stateVersion);
      if (unresolvedFailures.length > 0) {
        const unresolved = unresolvedFailures
          .slice(-4)
          .map((failure) => `${toolLabel(failure.toolName)}：${failure.message}`)
          .join("\n");
        requestMessages = appendAgentTurn(requestMessages, [
          { role: "assistant", content: content.trim() || "上一轮响应未完成。" },
          { role: "user", content: `工具结果中仍有未解决的问题，不能结束任务。请读取以下失败原因，调整参数或方案并继续执行；只有取得成功验证后才能回复完成：\n${unresolved}` },
        ]);
        reportProgress({ phase: "thinking", label: "根据失败结果继续处理" });
        continue;
      }
      finalSummary = content.trim() || "任务已完成。";
      reportProgress({ phase: "responding", label: "整理已验证的结果" });
      emit({ id: messageId, kind: "message", status: "done", title: finalSummary, markdown: finalSummary });
      reportProgress({ phase: "completed", label: "任务完成" });
      return { summary: finalSummary, toolCallCount, tokenUsage: usage };
    }
    emit({ id: messageId, kind: "message", status: "done", title: content.trim(), markdown: content.trim() });
    const turnMessages: AiChatMessage[] = [{ role: "assistant", content: compactAgentAssistantMessage(content), toolCalls: calls }];

    for (const call of calls) {
      if (signal.aborted) throw new Error(stopError);
      toolCallCount += 1;
      let args: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(call.function.arguments.trim() || "{}");
        args = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
      } catch (error) {
        const message = `工具参数无法解析：${error instanceof Error ? error.message : String(error)}`;
        emit({ kind: "tool", status: "error", title: `执行 ${toolLabel(call.function.name)} 失败`, detail: message, toolName: call.function.name, resultText: message });
        pushToolResponse(turnMessages, call.id, JSON.stringify({ ok: false, error: message }));
        continue;
      }
      const toolId = `tool-${round}-${toolCallCount}`;
      const fingerprint = toolCallFingerprint(call.function.name, args);
      rememberAgentDecision(memory, toolLabel(call.function.name));
      reportProgress({ phase: "executing", label: toolLabel(call.function.name) });
      emit({ id: toolId, kind: "tool", status: "running", title: toolLabel(call.function.name), toolName: call.function.name });
      const previousFailure = failedToolCalls.get(fingerprint);
      if (previousFailure?.stateVersion === stateVersion && (previousFailure.attempts >= 2 || previousFailure.lastAttempt === toolCallCount - 1)) {
        const message = `相同工具调用已失败：${previousFailure.message}。请先调整参数或方案后再继续。`;
        consecutiveNoProgress += 1;
        emit({ id: toolId, kind: "tool", status: "error", title: toolLabel(call.function.name), detail: message, toolName: call.function.name, result: { ok: false, error: message, repeated: true }, resultText: message });
        pushToolResponse(turnMessages, call.id, JSON.stringify({ ok: false, error: message, repeated: true }));
        if (consecutiveNoProgress >= 3) throw new Error("智能体连续重复无效工具调用，任务已停止");
        continue;
      }
      if (call.function.name === "save_project" && !explicitlyRequestsProjectSave(prompt)) {
        const message = "用户没有明确要求保存工程，本次未执行保存";
        emit({ id: toolId, kind: "tool", status: "done", title: toolLabel(call.function.name), detail: "未执行", toolName: call.function.name, result: { ok: true, skipped: true, reason: message }, resultText: message });
        pushToolResponse(turnMessages, call.id, JSON.stringify({ ok: true, skipped: true, reason: message }));
        continue;
      }
      const cachedRead = isCacheableTool(call.function.name) ? successfulReadCache.get(fingerprint) : undefined;
      if (cachedRead?.stateVersion === stateVersion) {
        const cachedResponse = `${cachedRead.modelResult}\n\n状态未变化，已复用最近一次读取结果；不要重复读取，请继续下一步。`;
        consecutiveNoProgress += 1;
        emit({ id: toolId, kind: "tool", status: "done", title: toolLabel(call.function.name), detail: "状态未变化", toolName: call.function.name, result: cachedRead.result, resultText: cachedRead.resultText });
        pushToolResponse(turnMessages, call.id, cachedResponse);
        if (consecutiveNoProgress >= 3) throw new Error("智能体连续重复读取未变化的状态，任务已停止");
        continue;
      }
      consecutiveNoProgress = 0;
      const permissionDenied = requiresPermission(call.function.name)
        && (!onPermissionRequest || !(await onPermissionRequest({ id: toolId, toolName: call.function.name, title: `需要确认：${toolLabel(call.function.name)}`, detail: "该操作会修改工程或启动任务。" })));
      if (mode === "plan" || permissionDenied) {
        const denied = { ok: false, error: mode === "plan" ? "计划模式禁止执行修改或运行操作" : "用户拒绝了这次操作" };
        recordFailure(fingerprint, call.function.name, denied.error, false);
        emit({ id: toolId, kind: "tool", status: "error", title: toolLabel(call.function.name), detail: denied.error, toolName: call.function.name, result: denied, resultText: JSON.stringify(denied) });
        pushToolResponse(turnMessages, call.id, JSON.stringify(denied));
        continue;
      }
      try {
        let result: Record<string, unknown>;
        if (call.function.name === "ask_user") result = { ok: true, question: args.question, options: args.options };
        else result = await host.executeTool(call.function.name, args, signal);
        const resultText = serializeResult(result);
        let combinedToolResponse = compactAgentToolResult(call.function.name, result);
        rememberAgentEvidence(memory, toolLabel(call.function.name), combinedToolResponse);
        const resultFailed = result.ok === false || result.valid === false || result.success === false || result.saved === false;
        if (resultFailed) recordFailure(fingerprint, call.function.name, failureDetail(result) || "工具返回失败");
        else {
          clearFailuresFor(call.function.name);
          if (changesAgentState(call.function.name) && result.changed !== false) {
            stateVersion += 1;
            successfulReadCache.clear();
          } else if (isCacheableTool(call.function.name)) {
            successfulReadCache.set(fingerprint, { stateVersion, result, resultText, modelResult: combinedToolResponse });
          }
        }
        emit({ id: toolId, kind: "tool", status: resultFailed ? "error" : "done", title: toolLabel(call.function.name), detail: resultFailed ? "失败" : undefined, toolName: call.function.name, result, resultText, codeChange: result.__codeChange && typeof result.__codeChange === "object" ? result.__codeChange as AgentActivityEvent["codeChange"] : undefined });
        if (mutationTools.has(call.function.name) && result.ok !== false) {
          const verificationId = `verification-${round}-${toolCallCount}`;
          const validation = await host.executeTool("check_code", {}, signal);
          const validationText = serializeResult(validation);
          const compactValidation = compactAgentToolResult("check_code", validation);
          rememberAgentEvidence(memory, "代码检查", compactValidation);
          const valid = validation.valid !== false;
          if (!valid) recordFailure(fingerprint, "check_code", failureDetail(validation) || "代码检查未通过");
          else clearFailuresFor("check_code");
          emit({ id: verificationId, kind: "verification", status: valid ? "done" : "error", title: valid ? "代码检查通过" : "代码检查发现问题", result: validation, resultText: validationText });
          combinedToolResponse = `${combinedToolResponse}\n\nCode check result: ${compactValidation}`;
        }
        const question = call.function.name === "ask_user" ? getClarification(result) : undefined;
        if (question) {
          pushToolResponse(turnMessages, call.id, combinedToolResponse);
          clarification = question;
          emit({ kind: "question", status: "done", title: question.question, markdown: `${question.question}\n\n${question.options.map((item, index) => `${index + 1}. ${item}`).join("\n")}`, result: question as unknown as Record<string, unknown> });
          reportProgress({ phase: "completed", label: "等待用户选择" });
          return { summary: question.question, toolCallCount, tokenUsage: usage, clarification };
        }
        if (isLongRunningTool(call.function.name) && isExecutionStarted(result) && host.observeExecution) {
          const observationId = `observation-${round}-${toolCallCount}`;
          reportProgress({ phase: "observing", label: "等待宿主任务完成并读取真实结果" });
          emit({ id: observationId, kind: "observation", status: "running", title: call.function.name === "render_manim" ? "渲染 Manim" : "运行 Python 工程", toolName: call.function.name });
          try {
            const observation = await host.observeExecution(call.function.name, signal);
            const observationText = serializeResult(observation);
            const compactObservation = compactAgentToolResult(call.function.name, observation);
            rememberAgentEvidence(memory, "后台任务观察", compactObservation);
            const observationSucceeded = isSuccessfulObservation(call.function.name, observation);
            const isManimRender = call.function.name === "render_manim";
            const detail = observationSucceeded ? undefined : observationFailureDetail(observation);
            emit({ id: observationId, kind: isManimRender || !observationSucceeded ? "verification" : "observation", status: observationSucceeded ? "done" : "error", title: observationSucceeded ? (isManimRender ? "渲染 Manim 通过" : "任务已完成并取得输出") : (isManimRender ? "渲染 Manim 发现问题" : "任务完成，但验证发现问题"), detail, toolName: call.function.name, result: observation, resultText: observationText });
            combinedToolResponse = `${combinedToolResponse}\n\nBackground task observation: ${compactObservation}`;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            emit({ id: observationId, kind: "observation", status: "error", title: `${call.function.name === "render_manim" ? "渲染 Manim" : "运行 Python 工程"} 失败`, detail: message, toolName: call.function.name, result: { ok: false, error: message }, resultText: message });
            throw error;
          }
        }
        pushToolResponse(turnMessages, call.id, combinedToolResponse);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        recordFailure(fingerprint, call.function.name, message);
        emit({ id: toolId, kind: "tool", status: "error", title: `执行失败：${toolLabel(call.function.name)}`, detail: message, toolName: call.function.name, result: { ok: false, error: message }, resultText: message });
        pushToolResponse(turnMessages, call.id, JSON.stringify({ ok: false, error: message }));
      }
    }
    requestMessages = appendAgentTurn(requestMessages, turnMessages);
  }
  throw new Error(`任务在 ${maxRounds} 个决策回合内没有完成`);
}
