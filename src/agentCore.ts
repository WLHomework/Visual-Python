import { type AiChatMessage, type AiChatToolCall } from "./aiConfig";
import { chatCompletionsTransport, type AgentModelTransport } from "./agentTransport";
import { coreAgentTools } from "./agentV2/toolRegistry";
import { createAgentMemory, rememberAgentDecision, rememberAgentEvidence, serializeAgentMemory } from "./agentV2/memory";
import { appendAgentTurn, buildAgentRequestMessages, compactAgentAssistantMessage, compactAgentToolResult, createAgentRequestContext } from "./agentV2/context";
import { createAgentTokenUsage, mergeProviderTokenUsage, recordAgentRequest, recordAgentToolResult } from "./agentV2/tokenLedger";
import type { AgentActivityEvent, AgentClarification, AgentProgress, AgentRunResult, AgentTool, RunVisualPythonAgentArgs } from "./agentV2/types";
import { parseAgentFollowUpSuggestions } from "./agentV2/followUps";
import { publishLiveStream } from "./agentV2/liveStream";
import { isStreamingCodeTool, previewCodeFromStreamingTool } from "./agentV2/streamingCodePreview";

export type { AgentActivityEvent, AgentCapability, AgentCodeChange, AgentConversationTurn, AgentHost, AgentMode, AgentProgress, AgentRunResult, AgentTokenUsage, AgentTool, RunVisualPythonAgentArgs, AiAgentActivity, AiAgentExecution, AiAgentMode, AiAgentPermissionRequest, AiAgentPlanStep, AiAgentProgress, AiAgentResult, AiAgentToolName, AiCodeChangeSnapshot, AiCodeEdit, AiConversationTurn, AiFollowUpSuggestion, AiTaskChangeSnapshot } from "./agentV2/types";
export { coreAgentTools, visualPythonTools } from "./agentV2/toolRegistry";
export { createAgentMemory, rememberAgentDecision, rememberAgentEvidence, serializeAgentMemory } from "./agentV2/memory";
export { createVisualPythonHostAdapter, type VisualPythonHostServices } from "./agentV2/hostAdapter";
export { applyExactCodeEdits, createCodeChangePreview, restoreMissingBaseIndent } from "./agentV2/codeChanges";
export { parseAgentFollowUpSuggestions } from "./agentV2/followUps";

export const AGENT_SOFT_ROUND_LIMIT = Number.POSITIVE_INFINITY;
export const AGENT_HARD_ROUND_LIMIT = Number.POSITIVE_INFINITY;
const maxTokensPerRequest = 16_384;
const streamUiUpdateIntervalMs = 200;
const maxToolResultCharacters = 6000;
const stopError = "任务已停止";
const truncatedContinuationPrompt = "上一轮响应达到本轮输出上限。请从中断位置继续，不要重复已经完成的内容；如果需要调用工具，请输出完整的工具调用。";
const toolByName = (tools: AgentTool[], name: string) => tools.find((tool) => tool.definition.function.name === name);
const systemRules = `你是 Visual Python 的通用软件智能体。你通过工具直接操控当前工程，而不是只在聊天中给出代码。

你必须遵守：
1. 先读取必要的当前状态，再决定下一步；不要猜测场景、文件、对象或资源的 ID。
2. 用户要求修改、创建、运行、渲染或保存时，必须通过工具完成，不能只回复一段代码并声称完成。
3. 代码修改优先使用定点编辑工具；只有空文件或用户明确要求整体重写时才使用 replace_code。
4. 修改工具可能自行验证，也可能声明专用后置验证；遵循工具结果和能力说明，不要把一种文档或插件的验证方式套用到其它工作区。
5. 是否运行长任务由任务目标决定。用户明确禁止时绝不执行；用户要求交付运行结果时必须取得真实输出。
6. 工具返回失败时，读取错误并改变修复方案；不要重复相同的错误调用。
7. 只有取得工具结果和验证证据后，才能宣称任务完成。
8. 普通回复使用清晰的 Markdown。工具调用前可以用一句简短说明，避免重复规划和冗长解释。
9. 需要用户决定时调用 ask_user，并提供 2 到 4 个简洁编号选项；不确定的关键选择不要擅自执行。
10. 工具声明需要确认时，由宿主提供唯一的执行确认。不要在调用前再用 ask_user 重复询问；只有目标或参数存在真实歧义时才询问。
11. 不要输出 XML、DSML、伪工具标签或原始 JSON 作为用户可见回复。
12. 每次任务完成后，在最终 Markdown 末尾附加一行隐藏元数据，格式为 <!-- visual-python-followups: [{"label":"按钮文字","prompt":"可执行的下一步指令"}] -->，最多三个建议；正文不要解释这行元数据。建议必须结合当前工程结果，不能使用空泛的固定选项。

平台工作方式：
- Visual Python 工程可以包含普通 Python 文档、插件文档、图形化工作区、资源和多个运行目标。不要把整个工程默认当成某个插件工程。
- 纯代码文档是独立文件。除非当前插件明确要求，不要自动添加 import、基类、construct 或其它专用模板。
- 当前编辑器状态由宿主管理。get_context 用于读取项目、当前文档、文件列表、运行状态和已启用插件；get_diagnostics 用于按需读取左侧输出和问题面板；需要其它文档时先用 list_documents，再用 get_document 读取真实 ID。
- 文档切换前先用 list_documents 取得真实 ID，再调用 switch_document；create_document 只创建空白普通 Python 文档，插件专用文档使用插件提供的创建工具。
- 代码修改首选 edit_code、insert_statements、replace_function_body 和 add_import。oldText 必须来自当前真实代码且精确匹配；修改失败后重新读取相关代码，不要猜测缩进或文本。
- replace_code 只适用于空文档、全新文档或用户明确要求整体重写。已有代码的局部需求不得整文件替换。
- 修改工具由宿主自动执行 Python 语法检查；插件专用验证只在插件检测结果匹配时使用。检查成功后不要重复检查同一版本。
- 插件能力由 get_context 返回。只有用户请求或当前文件确实匹配时才调用插件工具，不要向普通 Python 任务展示或调用无关插件流程。
- 工程资源通过 list_resources 和 get_resource 获取可用路径；不要虚构图片、音频、字体或资源 ID。资源引用后调用 check_resources。
- 依赖操作先用 check_dependencies。missing 为空表示已经安装；只有确实缺失且用户允许时才调用 install_dependencies。
- 长任务由工具元数据和宿主管理，宿主会等待并返回真实观察结果。不要自行轮询，不要在成功观察后重复执行。
- save_project 只在用户当前请求明确包含保存要求时执行。代码修改成功不等于需要保存工程。
- 需要确认的操作由宿主统一确认。用户拒绝后视为已取消，不要重复请求相同操作。
- ask_user 只用于会显著改变结果的真实歧义。颜色、布局、动画节奏等普通实现细节由你专业判断，避免不必要的往返。
- 最终回复只总结实际完成内容、验证结果和需要用户决定的事项。不要复述全部工具调用或输出未经处理的内部数据。
- 图形化工作区：优先用 visual_python_manim_* 专用积木。没有对应积木的语句才用表达式，但不能整棵树都是表达式。有完整 Python 源码时用 import_python_workspace。从零搭建时不要每个积木调用一次，也不必一次交整课：先确保有场景积木，再用 append_workspace_blocks 按段追加（例如先标题和对象，再播放和等待），每批 3 到 20 个语句积木。replace_workspace 仅用于空工作区或用户明确要求整课重写。add_workspace_block 只修正单个积木。`;

const pluginAuthoringRules = `

Structured plugin workflow:
- Call inspect_plugin_api before authoring. For a new plugin, call create_plugin_plan and pass its planId to create_plugin_draft.
- Keep one draft ID through update_plugin_draft and validate_plugin_draft. After static validation succeeds, call run_plugin_draft_checks.
- Install only when the runtime check returns phase ready. Do not repeat confirmation in the agent; install_plugin_draft is the single permission-gated step.
- Use the returned plugin contract for block types, input names, activation, and generated Python. Never guess host input names or entry points.

插件开发规则：
- 用户要求开发新插件时使用 create_plugin_draft；修改已有插件时先用 list_installed_plugins 找到准确 ID，再用 import_installed_plugin_draft 导入原始文件，并用 read_plugin_draft_file 分页读取需要修改的真实源码。后续始终用 update_plugin_draft 更新同一草稿，不要把插件代码写入当前普通 Python 文档。
- 修改插件文件时，先用 read_plugin_draft_file 读取目标片段，再优先使用 edit_plugin_draft_file 定点替换；oldText 必须唯一匹配。只有确实需要整体生成或重建多个文件时才使用 update_plugin_draft。
- 创建草稿前先读取当前能力。如果需求是在扩展某个已启用插件，先调用该能力的只读检查工具，取得真实入口积木、输入名、运行对象和代码生成约定；没有可验证的能力契约时必须创建自包含插件。
- 每个草稿必须维护 codegen.json。standalone 模式必须自行生成所需 import、初始化和结束逻辑；extension 模式必须声明 provider 和 runtimeNames，并严格使用提供方公开的入口与运行对象。
- codegen.json 只是代码生成契约，不会被宿主自动转换成积木。所有积木定义和 Python 生成器必须在入口模块的 activate(context) 中通过 context.registerBlock() 注册，并通过 context.registerToolboxCategory() 放入工具箱。
- 不得让 activate() 只返回 codegen.json 路径或空对象。插件只有实际注册了积木、工具箱、设置、命令、文档处理器或 Agent 工具后才算激活成功。
- 所有积木生成的 Python 必须形成完整、可解释的程序结构，不得引用未导入、未初始化或未由扩展契约声明的运行对象；不得凭空创造变量名、入口名或宿主 API。
- Python 生成器必须使用 generator.statementToCode() 和 generator.INDENT 处理嵌套语句；生成代码统一使用 4 个空格缩进，禁止 Tab，不要手工拼接不一致的嵌套缩进。安装时宿主会逐个实例化插件积木并执行真实 Python 语法检查。
- 先创建或更新同一个插件草稿，再调用 validate_plugin_draft 验证；验证失败时根据 issues 修改草稿后重新验证，不要重复创建相同插件。
- 插件安装、加载或运行失败后，在再次修改草稿前调用 get_diagnostics，结合工具错误、输出和问题定位原因；不要在未读取诊断时猜测修改。
- install_plugin_draft 会写入本地插件目录并执行插件 JavaScript。只有用户明确确认安装后才调用；宿主会提供唯一的安装确认，不要用 ask_user 重复确认。
- 插件草稿验证通过后，向用户说明已准备安装并等待确认；未确认时不要安装。
`;

function createId(prefix: string, index: number): string {
  return `${prefix}-${Date.now().toString(36)}-${index}`;
}

function serializeResult(result: Record<string, unknown>): string {
  try {
    const serialized = JSON.stringify(result);
    if (serialized.length <= maxToolResultCharacters) return serialized;
    const compact = JSON.parse(compactAgentToolResult("activity", result)) as Record<string, unknown>;
    return JSON.stringify({ ...compact, truncated: true });
  } catch {
    return JSON.stringify({ ok: false, error: "工具返回了无法序列化的结果" });
  }
}

function appendTruncatedContinuation(messages: AiChatMessage[], content: string): AiChatMessage[] {
  const base = [...messages];
  const previousPrompt = base.at(-1);
  const previousFragment = base.at(-2);
  if (previousPrompt?.role === "user" && previousPrompt.content === truncatedContinuationPrompt && previousFragment?.role === "assistant" && !previousFragment.toolCalls?.length) {
    base.splice(-2);
  }
  const normalized = content.trim() || "本轮响应尚未完成。";
  const fragment = normalized.length > 6_000 ? `[仅保留最近的续写内容]\n${normalized.slice(-6_000)}` : normalized;
  return appendAgentTurn(base, [
    { role: "assistant", content: fragment },
    { role: "user", content: truncatedContinuationPrompt },
  ]);
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

function isSuccessfulObservation(tool: AgentTool | undefined, observation: Record<string, unknown>): boolean {
  if (observation.success === false || observation.failed === true) return false;
  if (Array.isArray(observation.problems) && observation.problems.length > 0) return false;
  if (!tool?.executionLabels) return observation.running !== true && observation.rendering !== true;
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
  const validation = result.validation;
  if (validation && typeof validation === "object" && !Array.isArray(validation)) {
    const record = validation as Record<string, unknown>;
    for (const key of ["error", "warning", "message"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    const issues = Array.isArray(record.issues) ? record.issues : Array.isArray(record.errors) ? record.errors : [];
    const messages = issues.map((issue) => {
      if (typeof issue === "string") return issue.trim();
      if (!issue || typeof issue !== "object" || Array.isArray(issue)) return "";
      const message = (issue as Record<string, unknown>).message;
      return typeof message === "string" ? message.trim() : "";
    }).filter(Boolean);
    if (messages.length) return messages.join("；");
  }
  return undefined;
}

function isFailedToolResult(result: Record<string, unknown>): boolean {
  if (result.ok === false || result.valid === false || result.success === false || result.saved === false || result.installed === false) return true;
  const validation = result.validation;
  return Boolean(validation && typeof validation === "object" && !Array.isArray(validation) && (validation as Record<string, unknown>).valid === false);
}

export async function runAgentCore({ prompt, history = [], mode = "agent", reasoningEffort = "high", host, onEvent, onProgress, onPermissionRequest, signal, transport = chatCompletionsTransport }: RunVisualPythonAgentArgs & { transport?: AgentModelTransport }): Promise<AgentRunResult> {
  if (!prompt.trim()) throw new Error("请输入任务");
  const memory = createAgentMemory(history);
  const capabilities = host.getCapabilities?.() ?? [];
  const snapshot = host.getSnapshot();
  const workspaceMode = snapshot.workspaceMode === "visual" || snapshot.workspaceMode === "split" || snapshot.workspaceMode === "code" ? snapshot.workspaceMode : "code";
  const capabilityRules = capabilities.length
    ? `\n\n当前可用能力：\n${capabilities.map((capability) => `- ${capability.name}（${capability.id}）：${capability.description}${capability.tools?.length ? `；专用工具：${capability.tools.join(", ")}` : ""}${capability.fileTypes?.length ? `；文件类型：${capability.fileTypes.join(", ")}` : ""}${capability.detect ? `；检测方式：${capability.detect}` : ""}${capability.codegen ? `；代码生成契约：入口 ${capability.codegen.entryBlock || "未声明"}，语句输入 ${capability.codegen.statementInput || "未声明"}，运行对象 ${(capability.codegen.runtimeNames || []).join(", ") || "无"}` : ""}`).join("\n")}`
    : "\n\n当前没有插件提供额外的 Agent 能力；按通用 Python 工程处理。";
  const workspaceConstructionRules = workspaceMode === "visual" || workspaceMode === "split"
    ? `\n\n图形化工作区强制规则：\n- 当前是积木工作区，禁止用 replace_code / edit_code 等改 Python 来代替搭积木。代码面板由积木生成。\n- 有完整 Python 源码时用 import_python_workspace。\n- 从零搭建：先有场景积木，再用 append_workspace_blocks 按段追加（每批 3 到 20 个语句积木），不要每个积木调用一次。\n- 没有对应积木的语句才用表达式，但不能整棵树都是表达式。`
    : "";
  const requestContext = createAgentRequestContext({
    system: `${systemRules}${pluginAuthoringRules}${capabilityRules}${workspaceConstructionRules}\n\n当前模式：${mode === "plan" ? "计划模式，只能读取和分析，不得修改工程" : "智能体模式，可以执行必要的工程操作"}`,
    history,
    prompt,
    snapshot,
    memory: serializeAgentMemory(memory),
  });
  const usage = createAgentTokenUsage();
  let requestMessages = buildAgentRequestMessages(requestContext);
  const getTaskAgentTools = () => {
    const allTools = [...coreAgentTools, ...(host.getTools?.() ?? [])];
    const blockWorkspaceCodeMutationTools = new Set(["replace_code", "edit_code", "insert_statements", "replace_function_body", "add_import", "format_code"]);
    const activeTools = allTools.filter((tool) => {
      const name = tool.definition.function.name;
      if (tool.workspaceModes?.length && !tool.workspaceModes.includes(workspaceMode as "visual" | "split" | "code")) return false;
      if ((workspaceMode === "visual" || workspaceMode === "split") && blockWorkspaceCodeMutationTools.has(name)) return false;
      return true;
    });
    return mode === "plan" ? activeTools.filter((tool) => tool.readOnly) : activeTools;
  };
  let taskAgentTools = getTaskAgentTools();
  const toolLabel = (name: string) => toolByName(taskAgentTools, name)?.label || name;
  let toolCallCount = 0;
  let sequence = 0;
  let finalSummary = "";
  let clarification: AgentClarification | undefined;
  let stateVersion = 0;
  const failedToolCalls = new Map<string, { toolName: string; message: string; blocksCompletion: boolean; stateVersion: number; attempts: number; lastAttempt: number }>();
  const repeatedStructureFailures = new Map<string, number>();
  const recordFailure = (fingerprint: string, toolName: string, message: string, blocksCompletion = true) => {
    const previous = failedToolCalls.get(fingerprint);
    const attempts = previous?.stateVersion === stateVersion ? previous.attempts + 1 : 1;
    failedToolCalls.set(fingerprint, { toolName, message, blocksCompletion, stateVersion, attempts, lastAttempt: toolCallCount });
  };
  const clearFailuresFor = (toolName: string) => {
    for (const [fingerprint, failure] of failedToolCalls) {
      if (failure.toolName === toolName) failedToolCalls.delete(fingerprint);
    }
    for (const key of repeatedStructureFailures.keys()) {
      if (key.includes(`:${toolName}:`)) repeatedStructureFailures.delete(key);
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

  for (let round = 1; ; round += 1) {
    if (signal.aborted) throw new Error(stopError);
    // Plugins can be installed or activated by the previous round. Rebuild the
    // tool schema before every model decision so the next round sees it.
    taskAgentTools = getTaskAgentTools();
    const taskTools = taskAgentTools.map((tool) => tool.definition);
    const messageId = `message-${round}`;
    let content = "";
    let reasoning = "";
    let thinkingEmitted = false;
    let lastContentUiUpdate = Number.NEGATIVE_INFINITY;
    let lastReasoningUiUpdate = Number.NEGATIVE_INFINITY;
    let lastCodePreview = "";
    let lastCodePreviewAt = Number.NEGATIVE_INFINITY;
    const toolArgumentBuffers = new Map<number, { name?: string; arguments: string }>();
    const baselineCode = typeof host.getSnapshot().code === "string" ? host.getSnapshot().code as string : "";
    recordAgentRequest(usage, requestMessages, taskTools, round);
    reportProgress({ phase: "thinking", label: round === 1 ? "分析当前请求和工程状态" : "根据执行结果决定下一步" });
    emit({ id: messageId, kind: "message", status: "running", title: "", markdown: "" });
    const completion = await transport.runTurn(requestMessages, {
      maxTokens: maxTokensPerRequest,
      reasoningEffort,
      signal,
      tools: taskTools,
      toolChoice: "auto",
      onEvent: (event) => {
        if (event.type === "textDelta") {
          content += event.delta;
          publishLiveStream(messageId, content);
          const now = Date.now();
          if (now - lastContentUiUpdate < streamUiUpdateIntervalMs) return;
          lastContentUiUpdate = now;
          emit({ id: messageId, kind: "message", status: "running", title: content, markdown: content });
        } else if (event.type === "reasoningDelta") {
          reasoning += event.delta;
          const thinkingId = `thinking-${round}`;
          publishLiveStream(thinkingId, reasoning);
          const now = Date.now();
          if (thinkingEmitted && now - lastReasoningUiUpdate < streamUiUpdateIntervalMs) return;
          thinkingEmitted = true;
          lastReasoningUiUpdate = now;
          emit({ id: thinkingId, kind: "thinking", status: "running", title: "思考过程", markdown: reasoning });
        } else if (event.type === "toolCallDelta" && host.previewStreamingCode) {
          const current = toolArgumentBuffers.get(event.index) || { arguments: "" };
          if (event.name) current.name = event.name;
          current.arguments += event.delta;
          toolArgumentBuffers.set(event.index, current);
          const toolName = current.name;
          if (!toolName || !isStreamingCodeTool(toolName) || host.getSnapshot().workspaceMode !== "code") return;
          const now = Date.now();
          if (now - lastCodePreviewAt < 80) return;
          lastCodePreviewAt = now;
          const preview = previewCodeFromStreamingTool(toolName, current.arguments, baselineCode);
          if (preview === null || preview === lastCodePreview) return;
          lastCodePreview = preview;
          host.previewStreamingCode(preview);
        }
      },
    });
    mergeProviderTokenUsage(usage, completion);
    reportProgress({ phase: "thinking", label: "已收到模型决策" });
    if (reasoning) emit({ id: `thinking-${round}`, kind: "thinking", status: "done", title: "思考过程", markdown: reasoning });
    const calls = normalizeAiToolCalls(completion.toolCalls).filter((call) => taskTools.some((tool) => tool.function.name === call.function.name));
    if (completion.truncated && (!calls.length || !hasCompleteToolCalls(calls))) {
      requestMessages = appendTruncatedContinuation(requestMessages, content);
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
      const finalResponse = parseAgentFollowUpSuggestions(content);
      finalSummary = finalResponse.content || "任务已完成。";
      reportProgress({ phase: "responding", label: "整理已验证的结果" });
      emit({ id: messageId, kind: "message", status: "done", title: finalSummary, markdown: finalSummary });
      reportProgress({ phase: "completed", label: "任务完成" });
      return { summary: finalSummary, toolCallCount, tokenUsage: usage, ...(finalResponse.suggestions.length ? { followUpSuggestions: finalResponse.suggestions } : {}) };
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
        emit({ id: toolId, kind: "tool", status: "error", title: toolLabel(call.function.name), detail: message, toolName: call.function.name, result: { ok: false, error: message, repeated: true }, resultText: message });
        pushToolResponse(turnMessages, call.id, JSON.stringify({ ok: false, error: message, repeated: true }));
        continue;
      }
      if (call.function.name === "save_project" && !explicitlyRequestsProjectSave(prompt)) {
        const message = "用户没有明确要求保存工程，本次未执行保存";
        emit({ id: toolId, kind: "tool", status: "done", title: toolLabel(call.function.name), detail: "未执行", toolName: call.function.name, result: { ok: true, skipped: true, reason: message }, resultText: message });
        pushToolResponse(turnMessages, call.id, JSON.stringify({ ok: true, skipped: true, reason: message }));
        continue;
      }
      const currentTool = toolByName(taskAgentTools, call.function.name);
      const permissionDenied = currentTool?.requiresPermission
        && (!onPermissionRequest || !(await onPermissionRequest({
          id: toolId,
          toolName: call.function.name,
          title: `需要确认：${toolLabel(call.function.name)}`,
          detail: call.function.name === "install_plugin_draft"
            ? "该操作会写入本地插件目录并执行插件 JavaScript。"
            : "该操作会修改工程或启动任务。",
        })));
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
        const resultFailed = isFailedToolResult(result);
        if (resultFailed) recordFailure(fingerprint, call.function.name, failureDetail(result) || "工具返回失败");
        else {
          clearFailuresFor(call.function.name);
          if (currentTool?.changesState && result.changed !== false) {
            stateVersion += 1;
          }
        }
        emit({ id: toolId, kind: "tool", status: resultFailed ? "error" : "done", title: toolLabel(call.function.name), detail: resultFailed ? "失败" : undefined, toolName: call.function.name, result, resultText, codeChange: result.__codeChange && typeof result.__codeChange === "object" ? result.__codeChange as AgentActivityEvent["codeChange"] : undefined });
        if (currentTool?.verificationTool && result.ok !== false) {
          const verificationId = `verification-${round}-${toolCallCount}`;
          const verificationTool = currentTool.verificationTool;
          const validation = await host.executeTool(verificationTool, {}, signal);
          const validationText = serializeResult(validation);
          const compactValidation = compactAgentToolResult(verificationTool, validation);
          const verificationLabel = toolLabel(verificationTool);
          rememberAgentEvidence(memory, verificationLabel, compactValidation);
          const valid = validation.valid !== false;
          if (!valid) recordFailure(fingerprint, verificationTool, failureDetail(validation) || `${verificationLabel}未通过`);
          else clearFailuresFor(verificationTool);
          emit({ id: verificationId, kind: "verification", status: valid ? "done" : "error", title: valid ? `${verificationLabel}通过` : `${verificationLabel}发现问题`, result: validation, resultText: validationText });
          combinedToolResponse = `${combinedToolResponse}\n\nVerification result: ${compactValidation}`;
        }
        const question = call.function.name === "ask_user" ? getClarification(result) : undefined;
        if (question) {
          pushToolResponse(turnMessages, call.id, combinedToolResponse);
          clarification = question;
          emit({ kind: "question", status: "done", title: question.question, markdown: `${question.question}\n\n${question.options.map((item, index) => `${index + 1}. ${item}`).join("\n")}`, result: question as unknown as Record<string, unknown> });
          reportProgress({ phase: "completed", label: "等待用户选择" });
          return { summary: question.question, toolCallCount, tokenUsage: usage, clarification };
        }
        if (currentTool?.longRunning && isExecutionStarted(result) && host.observeExecution) {
          const observationId = `observation-${round}-${toolCallCount}`;
          reportProgress({ phase: "observing", label: "等待宿主任务完成并读取真实结果" });
          const executionLabels = currentTool.executionLabels ?? { running: currentTool.label, success: "任务已完成并取得输出", failure: `${currentTool.label}失败` };
          emit({ id: observationId, kind: "observation", status: "running", title: executionLabels.running, toolName: call.function.name });
          try {
            const observation = await host.observeExecution(call.function.name, signal);
            const observationText = serializeResult(observation);
            const compactObservation = compactAgentToolResult(call.function.name, observation);
            rememberAgentEvidence(memory, "后台任务观察", compactObservation);
            const observationSucceeded = isSuccessfulObservation(currentTool, observation);
            const detail = observationSucceeded ? undefined : observationFailureDetail(observation);
            emit({ id: observationId, kind: currentTool.executionLabels || !observationSucceeded ? "verification" : "observation", status: observationSucceeded ? "done" : "error", title: observationSucceeded ? executionLabels.success : detail ? `${executionLabels.running} 发现问题` : executionLabels.failure, detail, toolName: call.function.name, result: observation, resultText: observationText });
            combinedToolResponse = `${combinedToolResponse}\n\nBackground task observation: ${compactObservation}`;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            emit({ id: observationId, kind: "observation", status: "error", title: executionLabels.failure, detail: message, toolName: call.function.name, result: { ok: false, error: message }, resultText: message });
            throw error;
          }
        }
        pushToolResponse(turnMessages, call.id, combinedToolResponse);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        recordFailure(fingerprint, call.function.name, message);
        const missingInput = message.match(/(?:没有|缺少)\s+([A-Z][A-Z0-9_]*)\s+输入/i)?.[1]
          || message.match(/missing a\(n\)\s+([A-Z][A-Z0-9_]*)\s+connection/i)?.[1];
        const structureKey = missingInput ? `${stateVersion}:${call.function.name}:${missingInput}` : "";
        const structureAttempts = structureKey ? (repeatedStructureFailures.get(structureKey) || 0) + 1 : 0;
        if (structureKey) repeatedStructureFailures.set(structureKey, structureAttempts);
        const stopRepeating = structureAttempts >= 3;
        const responseMessage = stopRepeating
          ? `${message}\n同一连接错误已连续出现 ${structureAttempts} 次，已停止重复提交。请先读取积木模板中的 inputSlots，再重新构造工作区。`
          : message;
        emit({ id: toolId, kind: "tool", status: "error", title: `执行失败：${toolLabel(call.function.name)}`, detail: responseMessage, toolName: call.function.name, result: { ok: false, error: responseMessage }, resultText: responseMessage });
        pushToolResponse(turnMessages, call.id, JSON.stringify({ ok: false, error: responseMessage }));
      }
    }
    requestMessages = appendAgentTurn(requestMessages, turnMessages);
  }
}
