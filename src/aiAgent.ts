import { streamAiChat, type AiAgentPermissionMode, type AiChatMessage, type AiChatToolCall, type AiChatToolDefinition } from "./aiConfig";
import type { SceneDocument } from "./sceneDocuments";

export type AiAgentActivity = {
  id: string;
  kind: "message" | "tool";
  status: "running" | "done" | "error" | "stopped";
  title: string;
  detail?: string;
  result?: string;
  toolName?: AiAgentToolName;
  codeChange?: AiCodeChangeSnapshot;
  execution?: AiAgentExecution;
  undone?: boolean;
};

export type AiAgentExecution = {
  kind: "python" | "manim";
  state: "running" | "completed" | "failed";
  label: string;
  elapsedSeconds?: number;
  scene?: string;
  percent?: number;
  output: Array<{ stream: "stdout" | "stderr" | "system"; data: string }>;
  problems: Array<{ kind: string; line: number; message: string; suggestion?: string }>;
  renderOutput?: { type: "video" | "image"; scene: string; path: string; transparentBackground?: boolean };
  /** Legacy persisted conversation data. */
  video?: { scene: string; path: string };
};

export type AiCodeChangeSnapshot = {
  before: string;
  after: string;
  sceneId?: string;
  sceneName?: string;
};

export type AiAgentResult = {
  summary: string;
  toolCallCount: number;
  lineCount: number;
  tokenUsage?: AiAgentTokenUsage;
  mode?: AiAgentMode;
  intent?: AiAgentRequestIntent;
  planPrompt?: string;
  taskPlan?: AiAgentPlanStep[];
  taskChange?: AiTaskChangeSnapshot;
  clarification?: AiClarification;
};

export type AiAgentMode = "agent" | "plan";
export type AiAgentRequestIntent = "chat" | "inspect" | "execute";
export type AiAgentRequiredAction = "mutation" | "run" | "render" | "save" | "switch_scene" | "install_dependencies" | "stop_execution";

export type AiAgentRouteDecision = {
  intent: AiAgentRequestIntent;
  requiredActions: AiAgentRequiredAction[];
  allowRun: boolean;
  renderPolicy: "auto" | "forbid";
  allowWholeFileRewrite: boolean;
  allowClarification: boolean;
  response: string;
};

export type AiAgentPhase = "preparing" | "waiting" | "thinking" | "responding" | "preparingTool" | "executingTool";

export type AiAgentProgress = {
  phase: AiAgentPhase;
  label: string;
  taskPlan?: AiAgentPlanStep[];
  tokenUsage?: AiAgentTokenUsage;
};

export type AiAgentTokenUsage = {
  prompt: number;
  completion: number;
  total: number;
  requests: number;
};

export type AiAgentPlanStep = {
  step: string;
  status: "pending" | "in_progress" | "completed";
};

export type AiAgentPermissionRequest = {
  id: string;
  toolName: AiAgentToolName;
  title: string;
  detail: string;
};

export type AiClarification = {
  question: string;
  options: string[];
};

export type AiTaskChangeSnapshot = {
  before: SceneDocument[];
  after: SceneDocument[];
  beforeActiveSceneId: string;
  afterActiveSceneId: string;
};

export type AiConversationTurn = {
  user: string;
  assistant: string;
  clarification?: boolean;
};

export type AiCodeAgentHost = {
  executeTool: (name: AiAgentToolName, args: Record<string, unknown>, signal: AbortSignal) => Promise<Record<string, unknown>>;
  getSnapshot: () => Record<string, unknown>;
  getLineCount: () => number;
  previewCode: (code: string) => void;
  cancelCodePreview: () => void;
};

type RunAiCodeAgentArgs = {
  prompt: string;
  history?: AiConversationTurn[];
  agentMode: AiAgentMode;
  initialPlan?: AiAgentPlanStep[];
  host: AiCodeAgentHost;
  onActivity: (activity: AiAgentActivity) => void;
  onProgress: (progress: AiAgentProgress) => void;
  permissionMode: AiAgentPermissionMode;
  onPermissionRequest: (request: AiAgentPermissionRequest) => Promise<boolean>;
  signal: AbortSignal;
};

const objectSchema = (properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

const toolDefinitions = [
  {
    name: "ask_user",
    label: "询问用户",
    description: "仅当请求存在会显著改变最终成品、选错后需要大范围重写的关键歧义时使用。必须在修改代码前单独调用；普通视觉细节自行决定。提供 2 到 3 个简短候选项，宿主会追加“由 AI 决定”并显示为编号列表。",
    parameters: objectSchema({
      question: { type: "string", minLength: 1, maxLength: 300 },
      options: { type: "array", minItems: 2, maxItems: 3, items: { type: "string", minLength: 1, maxLength: 100 } },
    }, ["question", "options"]),
  },
  {
    name: "get_context",
    label: "读取项目",
    description: "重新读取当前 Python 源码、项目状态、Python 环境和可选工程资源。首轮已有实时快照；仅在源码变化后需要继续编辑、或需要刷新状态时调用。",
    parameters: objectSchema({ includeResources: { type: "boolean", default: false } }),
  },
  {
    name: "update_task_plan",
    label: "更新任务进度",
    description: "执行已审阅计划或复杂多步骤任务时，创建或更新简洁任务清单。只在开始、完成关键步骤或调整方案时调用，不要为每个工具调用更新。未全部完成时必须且只能有一个 in_progress，全部完成时所有步骤均为 completed。",
    parameters: objectSchema({
      steps: {
        type: "array",
        minItems: 2,
        maxItems: 10,
        items: objectSchema({
          step: { type: "string", minLength: 1, maxLength: 120 },
          status: { type: "string", enum: ["pending", "in_progress", "completed"] },
        }, ["step", "status"]),
      },
    }, ["steps"]),
  },
  { name: "list_scenes", label: "列出场景", description: "列出工程中的全部独立场景文档、场景 ID、名称、行数和当前场景。需要操作其他场景时先调用。", parameters: objectSchema() },
  { name: "get_scene", label: "读取场景", description: "按 sceneId 读取一个场景的完整独立 Python 源码，不切换当前编辑器。", parameters: objectSchema({ sceneId: { type: "string" } }, ["sceneId"]) },
  { name: "validate_scene", label: "检查场景", description: "统一检查当前独立文件的语法、Manim import、Scene 类数量、construct 方法、标签名称、配音标记和工程资源引用。完成修改前必须通过。", parameters: objectSchema() },
  { name: "list_resources", label: "查询资源", description: "按名称或类型查询工程资源，返回可直接用于独立 Python 文件的绝对路径及文件状态。需要使用图片、音频或字体时先调用。", parameters: objectSchema({ query: { type: "string" }, type: { type: "string", enum: ["audio", "image", "font", "other"] } }) },
  { name: "get_resource", label: "读取资源", description: "按 list_resources 返回的资源 ID 读取单个资源详情和可直接用于代码的绝对路径，不要猜测资源 ID。", parameters: objectSchema({ resourceId: { type: "string" } }, ["resourceId"]) },
  { name: "check_resources", label: "检查资源", description: "检查当前场景引用的 resource:// 资源是否存在于工程且磁盘文件可用。", parameters: objectSchema() },
  { name: "check_dependencies", label: "检查依赖", description: "检查当前Python环境是否安装指定包。", parameters: objectSchema({ packages: { type: "array", minItems: 1, maxItems: 30, items: { type: "string" } } }, ["packages"]) },
  { name: "install_dependencies", label: "安装依赖", description: "安装缺失 Python 包。必须先调用 check_dependencies，操作受 Agent 权限模式控制。", parameters: objectSchema({ packages: { type: "array", minItems: 1, maxItems: 20, items: { type: "string" } } }, ["packages"]) },
  { name: "inspect_rendered_output", label: "检查渲染结果", description: "检查当前场景最近一次 Manim 渲染结果。视频会检查时长、尺寸和空白画面，图片会检查尺寸和空白画面。渲染成功后用于质量确认。", parameters: objectSchema() },
  { name: "switch_scene", label: "切换场景", description: "按 sceneId 切换当前场景。之后的代码编辑、运行和渲染工具都只作用于该场景。", parameters: objectSchema({ sceneId: { type: "string" } }, ["sceneId"]) },
  { name: "create_scene", label: "新建场景", description: "创建并切换到一个完整、可独立运行的 Manim Python 场景文件。name 可省略，宿主会生成唯一名称。", parameters: objectSchema({ name: { type: "string" } }) },
  { name: "rename_scene", label: "重命名场景", description: "重命名指定场景文档及其中的首个 Manim Scene 类。新名称必须是唯一的 Python 类名。", parameters: objectSchema({ sceneId: { type: "string" }, name: { type: "string" } }, ["sceneId", "name"]) },
  { name: "delete_scene", label: "删除场景", description: "删除指定场景文档。仅在用户明确要求删除时调用，操作受 Agent 权限模式控制，且工程至少保留一个场景。", parameters: objectSchema({ sceneId: { type: "string" } }, ["sceneId"]) },
  {
    name: "replace_code",
    label: "重写代码",
    description: "用完整的新 Python 源码替换编辑器内容。仅用于空编辑器，或用户明确要求完全重写全部代码的任务。已有代码的局部和多处修改必须使用 edit_code。",
    parameters: objectSchema({ summary: { type: "string" }, code: { type: "string" } }, ["code"]),
  },
  {
    name: "edit_code",
    label: "修改代码",
    description: "按原文精确替换一个或多个代码片段。oldText 默认必须在当前源码中唯一出现；一次调用作为一个可撤销事务提交。",
    parameters: objectSchema({
      summary: { type: "string" },
      edits: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: objectSchema({ oldText: { type: "string" }, newText: { type: "string" }, replaceAll: { type: "boolean", default: false } }, ["oldText", "newText"]),
      },
    }, ["edits"]),
  },
  { name: "inspect_python_structure", label: "读取代码结构", description: "使用 Python AST 读取当前代码中的类、函数、方法、语句摘要和精确行范围。修改函数或方法前优先调用。", parameters: objectSchema() },
  {
    name: "insert_statements",
    label: "插入语句",
    description: "向指定函数或类方法的开头或末尾插入语句。宿主根据 AST 自动定位并计算缩进；statements 内容不要添加函数体基础缩进。",
    parameters: objectSchema({
      summary: { type: "string" },
      className: { type: "string" },
      functionName: { type: "string" },
      position: { type: "string", enum: ["start", "end"] },
      statements: { type: "array", minItems: 1, maxItems: 40, items: { type: "string" } },
    }, ["functionName", "position", "statements"]),
  },
  {
    name: "replace_function_body",
    label: "重建函数",
    description: "替换指定函数或类方法的完整函数体，函数定义和文件其他内容保持不变。宿主根据 AST 自动计算缩进。用于局部修复连续失败后的策略升级。",
    parameters: objectSchema({
      summary: { type: "string" },
      className: { type: "string" },
      functionName: { type: "string" },
      body: { type: "string" },
    }, ["functionName", "body"]),
  },
  {
    name: "add_import",
    label: "添加导入",
    description: "通过 AST 位置向模块导入区添加 import 或 from import，自动避免完全重复的导入。",
    parameters: objectSchema({
      summary: { type: "string" },
      module: { type: "string" },
      names: { type: "array", maxItems: 50, items: { type: "string" }, default: [] },
    }, ["module"]),
  },
  { name: "get_voiceover_context", label: "读取配音配置", description: "读取当前 TTS 配置状态、默认音色和可用配音角色。创建带配音的 Manim 代码前必须调用。", parameters: objectSchema() },
  {
    name: "add_voiceover",
    label: "添加配音",
    description: "在当前代码中一个唯一 anchorText 的前面或后面插入独立旁白。项目会生成合法配音标记，不要手写 visual-python-tts 标记。",
    parameters: objectSchema({
      summary: { type: "string" },
      anchorText: { type: "string" },
      text: { type: "string", minLength: 1, maxLength: 2000 },
      roleId: { type: "string", default: "default" },
      placement: { type: "string", enum: ["before", "after"], default: "before" },
    }, ["anchorText", "text"]),
  },
  {
    name: "add_synchronized_voiceover",
    label: "添加同步配音",
    description: "用配音开始和结束标记包裹唯一的 targetText 动画代码。渲染时旁白与这些动画同步，动画较短时自动补足等待。",
    parameters: objectSchema({
      summary: { type: "string" },
      targetText: { type: "string" },
      text: { type: "string", minLength: 1, maxLength: 2000 },
      roleId: { type: "string", default: "default" },
    }, ["targetText", "text"]),
  },
  { name: "check_voiceover", label: "检查配音", description: "检查当前代码中的配音标记、同步时间轴、静态文本和角色引用。添加或修改配音后必须调用。", parameters: objectSchema() },
  { name: "check_code", label: "检查代码", description: "检查当前 Python 语法并返回诊断。每次修改后必须调用。", parameters: objectSchema() },
  { name: "format_code", label: "格式化代码", description: "格式化当前 Python 源码。", parameters: objectSchema() },
  { name: "undo_code", label: "撤销修改", description: "撤销最近一次代码编辑。", parameters: objectSchema() },
  { name: "redo_code", label: "重做修改", description: "重做最近撤销的代码编辑。", parameters: objectSchema() },
  { name: "run_project", label: "运行项目", description: "运行当前 Python 项目。用于验证行为或满足用户的运行要求。", parameters: objectSchema() },
  { name: "render_manim", label: "渲染 Manim", description: "渲染当前 Manim 场景。outputType 可指定 video（完整 MP4 动画）或 image（PNG，跳过配音和本地音频）；图片可用 transparentBackground 控制透明背景，同时提供 imageWidth、imageHeight 设置 64-8192 像素的尺寸。imageCaptureMode 可选 final 或 animation；只提供 imageAnimationStep 时自动按指定步骤截取。省略参数时沿用项目当前输出设置。", parameters: objectSchema({ outputType: { type: "string", enum: ["video", "image"] }, transparentBackground: { type: "boolean" }, imageWidth: { type: "integer", minimum: 64, maximum: 8192 }, imageHeight: { type: "integer", minimum: 64, maximum: 8192 }, imageCaptureMode: { type: "string", enum: ["final", "animation"] }, imageAnimationStep: { type: "integer", minimum: 1, maximum: 10_000 } }) },
  { name: "get_execution_state", label: "检查运行结果", description: "读取运行或渲染状态、终端输出、问题和最近渲染结果。", parameters: objectSchema() },
  { name: "wait", label: "等待任务", description: "等待运行或渲染产生结果。", parameters: objectSchema({ milliseconds: { type: "integer", minimum: 100, maximum: 10_000 } }, ["milliseconds"]) },
  { name: "stop_execution", label: "停止任务", description: "停止正在运行的 Python 或 Manim 任务。", parameters: objectSchema() },
  { name: "save_project", label: "保存工程", description: "保存当前工程。没有工程路径时会明确返回需要用户先另存为。", parameters: objectSchema() },
] as const;

export type AiAgentToolName = typeof toolDefinitions[number]["name"];

export const aiAgentFunctionTools: AiChatToolDefinition[] = toolDefinitions.map(({ name, description, parameters }) => ({
  type: "function",
  function: { name, description, parameters },
}));

const planToolNames = new Set<AiAgentToolName>([
  "ask_user",
  "get_context",
  "list_scenes",
  "get_scene",
  "list_resources",
  "get_resource",
  "check_resources",
  "check_dependencies",
  "inspect_python_structure",
  "get_voiceover_context",
  "check_voiceover",
  "check_code",
  "validate_scene",
  "inspect_rendered_output",
  "get_execution_state",
]);
const inspectionToolNames = new Set<AiAgentToolName>([...planToolNames].filter((name) => name !== "ask_user"));

function isToolAvailable(name: AiAgentToolName, agentMode: AiAgentMode, requestIntent: AiAgentRequestIntent, allowRender: boolean, allowRun: boolean, allowReplace: boolean, allowClarification: boolean) {
  const accessAllowed = agentMode === "plan"
    ? planToolNames.has(name)
    : requestIntent === "execute"
      ? true
      : requestIntent === "inspect"
        ? inspectionToolNames.has(name)
        : false;
  return accessAllowed
    && (allowRender || name !== "render_manim")
    && (allowRun || name !== "run_project")
    && (allowReplace || name !== "replace_code")
    && (allowClarification || name !== "ask_user");
}

function availableToolDefinitions(allowRender: boolean, allowRun: boolean, allowReplace: boolean, allowClarification: boolean, agentMode: AiAgentMode, requestIntent: AiAgentRequestIntent) {
  return toolDefinitions.filter((tool) => (
    isToolAvailable(tool.name, agentMode, requestIntent, allowRender, allowRun, allowReplace, allowClarification)
  ));
}

export function getAiAgentFunctionTools(
  agentMode: AiAgentMode,
  allowRender = true,
  allowRun = true,
  allowReplace = true,
  allowClarification = true,
  requestIntent: AiAgentRequestIntent = "execute",
): AiChatToolDefinition[] {
  return aiAgentFunctionTools.filter((tool) => isToolAvailable(tool.function.name as AiAgentToolName, agentMode, requestIntent, allowRender, allowRun, allowReplace, allowClarification));
}

const toolNames = new Set<string>(toolDefinitions.map(({ name }) => name));
const mutatingTools = new Set<AiAgentToolName>(["create_scene", "rename_scene", "delete_scene", "replace_code", "edit_code", "insert_statements", "replace_function_body", "add_import", "add_voiceover", "add_synchronized_voiceover", "format_code", "undo_code", "redo_code"]);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const emptyTokenUsage = (): AiAgentTokenUsage => ({ prompt: 0, completion: 0, total: 0, requests: 0 });
const liveProjectSnapshotPrefix = "首轮实时项目快照（等同已调用 get_context）：";

export function hasUnexecutedAiToolIntent(text: string): boolean {
  if (hasDsmlToolMarkup(text)) return true;
  const candidates = [text.trim(), ...[...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1].trim())];
  return candidates.some((candidate) => {
    if (!candidate.startsWith("{") || !candidate.endsWith("}")) return false;
    try {
      const value: unknown = JSON.parse(candidate);
      if (!isRecord(value)) return false;
      if (typeof value.action === "string" && toolNames.has(value.action)) return true;
      if (!isRecord(value.tool) || typeof value.tool.name !== "string") return false;
      return toolNames.has(value.tool.name);
    } catch {
      return false;
    }
  });
}


export function mergeAiAgentTokenUsage(
  current: AiAgentTokenUsage,
  usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number },
): AiAgentTokenUsage {
  const normalized = (value: number | undefined) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const prompt = normalized(usage.promptTokens);
  const completion = normalized(usage.completionTokens);
  const suppliedTotal = normalized(usage.totalTokens);
  return {
    prompt: current.prompt + prompt,
    completion: current.completion + completion,
    total: current.total + (suppliedTotal || prompt + completion),
    requests: current.requests + 1,
  };
}

export function estimateAiAgentMessageCharacters(messages: AiChatMessage[], tools: AiChatToolDefinition[] = []): number {
  return messages.reduce((total, message) => total
    + message.content.length
    + (message.toolCallId?.length ?? 0)
    + (message.toolCalls ? JSON.stringify(message.toolCalls).length : 0), JSON.stringify(tools).length);
}

function compactMutationArguments(argumentsText: string): string {
  try {
    const value: unknown = JSON.parse(argumentsText);
    if (!isRecord(value)) return "{\"historyCompacted\":true}";
    const summary = typeof value.summary === "string" ? value.summary.slice(0, 500) : undefined;
    const editCount = Array.isArray(value.edits) ? value.edits.length : undefined;
    return JSON.stringify({ ...(summary ? { summary } : {}), ...(editCount === undefined ? {} : { editCount }), historyCompacted: true });
  } catch {
    return "{\"historyCompacted\":true}";
  }
}

function compactSnapshot(snapshot: Record<string, unknown>, revision: number) {
  const { code, ...state } = snapshot;
  const lineCount = typeof code === "string" ? (code ? code.split("\n").length : 0) : undefined;
  return {
    ...state,
    revision,
    ...(lineCount === undefined ? {} : { lineCount }),
    source: "完整源码已从历史中移除；继续编辑前请重新调用 get_context。",
  };
}

export function compactStaleAiAgentContext(messages: AiChatMessage[], snapshot: Record<string, unknown>, revision: number): AiChatMessage[] {
  const toolNamesById = new Map<string, string>();
  for (const message of messages) {
    for (const call of message.toolCalls ?? []) toolNamesById.set(call.id, call.function.name);
  }
  const staleContext = JSON.stringify({ ok: true, stale: true, ...compactSnapshot(snapshot, revision) });
  return messages.map((message) => {
    if (message.role === "system" && message.content.startsWith(liveProjectSnapshotPrefix)) {
      return { ...message, content: `此前的首轮项目快照已过期：${staleContext}` };
    }
    if (message.role === "tool" && message.toolCallId && toolNamesById.get(message.toolCallId) === "get_context") {
      return { ...message, content: staleContext };
    }
    if (message.role === "user" && message.content.startsWith("工具 get_context 执行结果：")) {
      return { ...message, content: `工具 get_context 执行结果：\n${staleContext}\n请根据结果继续完成原始任务。` };
    }
    if (message.role !== "assistant") return message;
    const toolCalls = message.toolCalls?.map((call) => mutatingTools.has(call.function.name as AiAgentToolName)
      ? { ...call, function: { ...call.function, arguments: compactMutationArguments(call.function.arguments) } }
      : call);
    let content = message.content;
    if (!toolCalls?.length && content.includes("\"tool\"")) {
      try {
        const decision = parseAiAgentDecision(content);
        if (decision.tool && mutatingTools.has(decision.tool.name)) {
          content = JSON.stringify({
            ...(decision.message ? { message: decision.message } : {}),
            tool: { name: decision.tool.name, arguments: JSON.parse(compactMutationArguments(JSON.stringify(decision.tool.arguments))) },
          });
        }
      } catch {
        // Keep non-protocol assistant text unchanged.
      }
    }
    return { ...message, content, ...(toolCalls ? { toolCalls } : {}) };
  });
}

function compactToolResultForModel(name: AiAgentToolName, result: Record<string, unknown>): Record<string, unknown> {
  if (result.ok !== true || !mutatingTools.has(name)) return result;
  const { diff: _diff, code: _code, before: _before, after: _after, ...compact } = result;
  return { ...compact, changeDetailsOmitted: true };
}

function createAgentTraceMemory(messages: AiChatMessage[]): string {
  const namesById = new Map<string, string>();
  const entries: string[] = [];
  for (const message of messages) {
    if (message.role === "assistant") {
      if (message.content.trim()) entries.push(`模型：${message.content.replace(/\s+/g, " ").trim().slice(0, 600)}`);
      for (const call of message.toolCalls ?? []) {
        namesById.set(call.id, call.function.name);
        entries.push(`调用 ${call.function.name}：${call.function.arguments.slice(0, 800)}`);
      }
    } else if (message.role === "tool") {
      entries.push(`${namesById.get(message.toolCallId || "") || "工具"} 结果：${message.content.slice(0, 1800)}`);
    } else if (message.role === "user" && (message.content.startsWith("工具 ") || /必须调用|任务清单|上下文已压缩/.test(message.content))) {
      entries.push(message.content.slice(0, 1800));
    }
  }
  let selected: string[] = [];
  let characters = 0;
  for (let index = entries.length - 1; index >= 0 && selected.length < 16; index -= 1) {
    const entry = entries[index];
    if (selected.length && characters + entry.length > 14_000) break;
    selected = [entry, ...selected];
    characters += entry.length;
  }
  return selected.join("\n");
}

export type AiAgentToolCall = { name: AiAgentToolName; arguments: Record<string, unknown> };
export type AiAgentDecision = { message: string; tool?: AiAgentToolCall; final?: string };
export type AiCodeEdit = { oldText: string; newText: string; replaceAll?: boolean };

export function restoreMissingBaseIndent(oldText: string, newText: string): string {
  const oldFirstContent = oldText.split("\n").find((line) => line.trim());
  const newFirstContent = newText.split("\n").find((line) => line.trim());
  if (!oldFirstContent || !newFirstContent) return newText;
  const oldIndent = oldFirstContent.match(/^\s*/)?.[0] ?? "";
  const newIndent = newFirstContent.match(/^\s*/)?.[0] ?? "";
  if (!oldIndent || newIndent) return newText;
  return newText.split("\n").map((line) => line.trim() ? `${oldIndent}${line}` : line).join("\n");
}

export function applyExactCodeEdits(source: string, edits: AiCodeEdit[]): string {
  if (!edits.length) throw new Error("参数 edits 必须是非空数组");
  let result = source;
  for (const [index, edit] of edits.entries()) {
    if (!edit.oldText) throw new Error(`第 ${index + 1} 个编辑的 oldText 不能为空`);
    const occurrences = result.split(edit.oldText).length - 1;
    if (!occurrences) throw new Error(`第 ${index + 1} 个编辑找不到 oldText，请重新读取当前代码`);
    if (edit.replaceAll !== true && occurrences !== 1) throw new Error(`第 ${index + 1} 个编辑匹配到 ${occurrences} 处，请提供更完整的 oldText 或设置 replaceAll`);
    const newText = restoreMissingBaseIndent(edit.oldText, edit.newText);
    result = edit.replaceAll === true ? result.split(edit.oldText).join(newText) : result.replace(edit.oldText, newText);
  }
  return result;
}

export function createCodeChangePreview(before: string, after: string): string {
  if (before === after) return "没有代码变化";
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix
    && suffix < newLines.length - prefix
    && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) suffix += 1;
  const removed = oldLines.slice(prefix, oldLines.length - suffix);
  const added = newLines.slice(prefix, newLines.length - suffix);
  const lines = [`@@ 第 ${prefix + 1} 行 @@`, ...removed.map((line) => `- ${line}`), ...added.map((line) => `+ ${line}`)];
  const result = lines.join("\n");
  return result.length > 12_000 ? `${result.slice(0, 12_000)}\n...` : result;
}

function jsonCandidate(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回工具决策 JSON");
  return text.slice(start, end + 1);
}

export function parseAiAgentDecision(text: string): AiAgentDecision {
  let value: unknown;
  try {
    const candidate = jsonCandidate(text);
    value = JSON.parse(candidate);
  } catch {
    throw new Error("模型返回的工具决策不是有效 JSON");
  }
  if (!isRecord(value)) throw new Error("模型返回的工具决策格式无效");
  const message = typeof value.message === "string" ? value.message.trim() : "";
  const final = typeof value.final === "string" ? value.final.trim() : "";
  let tool: AiAgentToolCall | undefined;
  if (isRecord(value.tool)) {
    const name = typeof value.tool.name === "string" ? value.tool.name : "";
    if (!toolNames.has(name)) throw new Error(`模型请求了未知工具 ${name || "(空)"}`);
    let args: unknown = value.tool.arguments;
    if (typeof args === "string") {
      try { args = JSON.parse(args); } catch { throw new Error(`工具 ${name} 的参数不是有效 JSON`); }
    }
    if (args === undefined || args === null) args = {};
    if (!isRecord(args)) throw new Error(`工具 ${name} 的参数必须是 JSON 对象`);
    tool = { name: name as AiAgentToolName, arguments: args };
  }
  if (tool && final) throw new Error("模型不能在调用工具的同时结束任务");
  if (!tool && !final) throw new Error("模型既没有调用工具，也没有给出最终结果");
  return { message, ...(tool ? { tool } : {}), ...(final ? { final } : {}) };
}

export function parseNativeToolCall(call: AiChatToolCall): AiAgentToolCall {
  if (!toolNames.has(call.function.name)) throw new Error(`模型请求了未知工具 ${call.function.name || "(空)"}`);
  let args: unknown = {};
  if (call.function.arguments.trim()) {
    try { args = JSON.parse(call.function.arguments); } catch { throw new Error(`工具 ${call.function.name} 的参数不是完整 JSON`); }
  }
  if (!isRecord(args)) throw new Error(`工具 ${call.function.name} 的参数必须是 JSON 对象`);
  return { name: call.function.name as AiAgentToolName, arguments: args };
}

export function extractStreamingAgentMessage(text: string): string {
  const match = /"message"\s*:\s*"((?:\\.|[^"\\])*)/.exec(text);
  if (!match) return "";
  const raw = match[1].replace(/\\$/, "");
  try { return JSON.parse(`"${raw}"`); } catch { return raw.replace(/\\n/g, "\n").replace(/\\"/g, "\"").replace(/\\\\/g, "\\"); }
}

export function extractStreamingJsonString(text: string, property: string): string {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`"${escapedProperty}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)`).exec(text);
  if (!match) return "";
  const raw = match[1].replace(/\\$/, "");
  try { return JSON.parse(`"${raw}"`); } catch { return raw.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, "\"").replace(/\\\\/g, "\\"); }
}

export function extractVisibleAgentContent(text: string): string {
  const marker = /<\s*[|｜]DSML[|｜]/i.exec(text);
  if (marker) return text.slice(0, marker.index).trim();
  const partialMarker = /<\s*(?:[|｜](?:D(?:S(?:M(?:L(?:[|｜])?)?)?)?)?)?$/i.exec(text);
  return (partialMarker ? text.slice(0, partialMarker.index) : text).trim();
}

export function hasDsmlToolMarkup(text: string): boolean {
  return /<\s*[|｜]DSML[|｜]\s*\/?\s*(?:tool_calls|invoke|parameter)\b/i.test(text);
}

export function isFunctionCallingUnsupportedError(error: unknown): boolean {
  const message = String(error).toLocaleLowerCase();
  return /(tools?|tool_choice|function.?call|function.?calling|unknown field|unknown parameter|unsupported parameter|not support)/.test(message)
    && /(400|422|invalid|unsupported|unknown|not support)/.test(message);
}

const aiAgentRouteTool: AiChatToolDefinition = {
  type: "function",
  function: {
    name: "route_request",
    description: "根据用户当前请求和连续对话的真实语义，决定普通聊天、只读工程分析或实际操作工程，并设置本轮智能体权限。",
    parameters: objectSchema({
      intent: { type: "string", enum: ["chat", "inspect", "execute"] },
      requiredActions: {
        type: "array",
        uniqueItems: true,
        items: { type: "string", enum: ["mutation", "run", "render", "save", "switch_scene", "install_dependencies", "stop_execution"] },
        description: "完成用户请求必须实际发生并由宿主验证的操作。execute 至少包含一项。",
      },
      allowRun: { type: "boolean", description: "用户是否明确要求运行或执行 Python 项目。" },
      renderPolicy: { type: "string", enum: ["auto", "forbid"], description: "用户明确禁止渲染时为 forbid，否则为 auto，由执行智能体按需判断。" },
      allowWholeFileRewrite: { type: "boolean", description: "用户是否明确要求清空、从头开始或完整重写当前文件。" },
      allowClarification: { type: "boolean", description: "关键目标确有多种高影响解释且用户未授权 AI 自行决定时为 true。" },
      response: { type: "string", maxLength: 50000, description: "intent 为 chat 时直接给用户的完整 Markdown 回复；其他意图使用空字符串。" },
    }, ["intent", "requiredActions", "allowRun", "renderPolicy", "allowWholeFileRewrite", "allowClarification", "response"]),
  },
};

const routeRequestRules = `你是 Visual Python AI 编程助手的语义路由器。只判断用户真正想让应用做什么，不执行工程任务，也不根据固定关键词做机械匹配。

请调用 route_request 返回结构化决策：
- chat：与当前工程状态无关的一般交流、概念问答或能力咨询。此时 response 必须直接、完整回答用户。
- inspect：需要读取当前项目才能回答，但用户只要求解释、分析、检查或建议，不希望改变项目。
- execute：用户希望智能体实际操作应用，包括创建、修改、修复、运行、渲染、保存或继续此前任务。陈述当前成果存在问题且语义上希望纠正，也属于 execute；纯粹询问原因属于 inspect。
- requiredActions 必须列出完成请求不可缺少的真实操作。修改代码或工程内容用 mutation；运行 Python 用 run；渲染视频或图片用 render；保存用 save；切换场景用 switch_scene；安装依赖和停止任务使用对应值。组合任务必须列出全部操作。
- execute 至少包含一个 requiredActions。普通聊天和只读分析必须为空数组。
- allowRun 只有用户明确授权运行 Python 项目时才为 true。渲染 Manim 不等于运行 Python 项目。
- renderPolicy 只有用户明确禁止渲染时才为 forbid；其他情况为 auto，让执行智能体按验证需要决定。
- allowWholeFileRewrite 只有用户明确要求清空、从头开始或完整重写时才为 true。局部修复必须为 false。
- allowClarification 仅用于会明显改变最终内容目标的关键歧义。用户要求直接决定、自由发挥，或正在回答上一轮澄清时必须为 false。
- 结合最近对话解析“继续”“它”“刚才”等指代。不要因请求简短、口语化或没有特定动词而降级为聊天。
- inspect 和 execute 的 response 必须为空字符串。不得声称已读取、修改、运行或验证工程。`;

export function normalizeAiAgentRouteDecision(value: unknown): AiAgentRouteDecision {
  if (!isRecord(value)) throw new Error("模型返回的请求路由格式无效");
  const intent = value.intent;
  if (intent !== "chat" && intent !== "inspect" && intent !== "execute") throw new Error("请求路由缺少有效 intent");
  const renderPolicy = value.renderPolicy;
  if (renderPolicy !== "auto" && renderPolicy !== "forbid") throw new Error("请求路由缺少有效 renderPolicy");
  for (const property of ["allowRun", "allowWholeFileRewrite", "allowClarification"] as const) {
    if (typeof value[property] !== "boolean") throw new Error(`请求路由缺少布尔字段 ${property}`);
  }
  const allowedActions = new Set<AiAgentRequiredAction>(["mutation", "run", "render", "save", "switch_scene", "install_dependencies", "stop_execution"]);
  if (!Array.isArray(value.requiredActions) || value.requiredActions.some((action) => typeof action !== "string" || !allowedActions.has(action as AiAgentRequiredAction))) {
    throw new Error("请求路由缺少有效 requiredActions");
  }
  const requiredActions = [...new Set(value.requiredActions as AiAgentRequiredAction[])];
  const response = typeof value.response === "string" ? value.response.trim().slice(0, 50000) : "";
  if (intent === "chat" && !response) throw new Error("普通对话路由必须提供完整回复");
  if (intent !== "execute") {
    return {
      intent,
      requiredActions: [],
      allowRun: false,
      renderPolicy: "forbid",
      allowWholeFileRewrite: false,
      allowClarification: false,
      response: intent === "chat" ? response : "",
    };
  }
  if (!requiredActions.length) throw new Error("执行请求至少需要一个 requiredActions");
  if (requiredActions.includes("render") && renderPolicy === "forbid") throw new Error("请求路由同时要求并禁止渲染");
  if (value.allowWholeFileRewrite === true && !requiredActions.includes("mutation")) requiredActions.push("mutation");
  return {
    intent,
    requiredActions,
    allowRun: requiredActions.includes("run"),
    renderPolicy,
    allowWholeFileRewrite: value.allowWholeFileRewrite as boolean,
    allowClarification: value.allowClarification as boolean,
    response: "",
  };
}

export function createAiAgentRouterMessages(
  prompt: string,
  history: AiConversationTurn[] = [],
  fallback = false,
): AiChatMessage[] {
  const recentHistory = history.slice(-6).flatMap((turn): AiChatMessage[] => [
    { role: "user", content: turn.user.slice(0, 2000) },
    { role: "assistant", content: turn.assistant.slice(0, 2000) },
  ]);
  const protocol = fallback
    ? `当前接口不支持 Function Calling。只返回 route_request 参数对象本身，不要使用 Markdown 或添加说明。Schema：${JSON.stringify(aiAgentRouteTool.function.parameters)}`
    : "必须调用且只能调用 route_request。不要在正文中回答，也不要调用其他工具。";
  return [
    { role: "system", content: `${routeRequestRules}\n\n${protocol}` },
    ...recentHistory,
    { role: "user", content: prompt },
  ];
}

function parseAiAgentRouteContent(content: string): AiAgentRouteDecision {
  try {
    return normalizeAiAgentRouteDecision(JSON.parse(jsonCandidate(content)));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("请求路由")) throw error;
    throw new Error("模型没有返回有效的请求路由 JSON");
  }
}

export async function routeAiAgentRequest({
  prompt,
  history = [],
  signal,
  onChatResponse,
}: {
  prompt: string;
  history?: AiConversationTurn[];
  signal: AbortSignal;
  onChatResponse?: (response: string) => void;
}): Promise<{ decision: AiAgentRouteDecision; tokenUsage: AiAgentTokenUsage; nativeFunctionCalling: boolean }> {
  let tokenUsage = emptyTokenUsage();
  let nativeFunctionCalling = true;
  let messages = createAiAgentRouterMessages(prompt, history);
  let invalidResponse = "";
  let streamedContent = "";
  const streamedToolCalls = new Map<number, { name: string; arguments: string }>();
  let streamedChatResponse = "";
  const reportStreamedChatResponse = (serialized: string) => {
    const response = extractStreamingJsonString(serialized, "response").trim().slice(0, 50000);
    if (!response || response === streamedChatResponse) return;
    streamedChatResponse = response;
    onChatResponse?.(response);
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal.aborted) throw new Error("已停止生成");
    streamedContent = "";
    streamedToolCalls.clear();
    streamedChatResponse = "";
    if (attempt > 0) {
      messages = createAiAgentRouterMessages(prompt, history, !nativeFunctionCalling);
      messages.splice(messages.length - 1, 0, {
        role: "system",
        content: `上一次路由无效：${invalidResponse.slice(0, 500)}。这次必须严格返回完整结构化决策。`,
      });
    }
    let completion: Awaited<ReturnType<typeof streamAiChat>>;
    try {
      completion = await streamAiChat(messages, (delta) => {
        streamedContent += delta;
        if (!nativeFunctionCalling) reportStreamedChatResponse(streamedContent);
      }, {
        maxTokens: 65_536,
        signal,
        ...(nativeFunctionCalling ? { tools: [aiAgentRouteTool] } : {}),
        onToolCallDelta: ({ index, name, delta }) => {
          const current = streamedToolCalls.get(index) ?? { name: "", arguments: "" };
          current.name += name ?? "";
          current.arguments += delta;
          streamedToolCalls.set(index, current);
          if (current.name === "route_request") reportStreamedChatResponse(current.arguments);
        },
      });
    } catch (error) {
      if (!nativeFunctionCalling || !isFunctionCallingUnsupportedError(error)) throw error;
      nativeFunctionCalling = false;
      messages = createAiAgentRouterMessages(prompt, history, true);
      attempt -= 1;
      continue;
    }
    tokenUsage = mergeAiAgentTokenUsage(tokenUsage, completion);
    try {
      const routeCall = completion.toolCalls.find((call) => call.function.name === "route_request");
      if (routeCall) {
        const args = routeCall.function.arguments.trim() ? JSON.parse(routeCall.function.arguments) : {};
        return { decision: normalizeAiAgentRouteDecision(args), tokenUsage, nativeFunctionCalling };
      }
      return { decision: parseAiAgentRouteContent(completion.content), tokenUsage, nativeFunctionCalling: false };
    } catch (error) {
      invalidResponse = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`模型无法确定请求意图：${invalidResponse || "未调用 route_request"}`);
}

const agentRules = `你是 Visual Python 纯代码模式中的自主编程智能体。你可以读取和修改当前 Python 源码、运行项目、渲染 Manim、检查结果并继续修复，直到用户任务真正完成。

规则：
- 明确请求直接执行。颜色、字体、布局、普通转场等次要细节缺失时自行作出专业决定，不要询问。
- 只有当请求存在两个以上合理方向，且选错会明显改变内容目标或导致大范围重写时，才允许调用 ask_user。必须先阅读首轮实时项目快照，并在任何修改工具之前单独调用 ask_user。
- 每个原始任务最多询问一次。一次只问一个最关键的问题并提供 2 到 3 个互斥的简短选项；不要询问可以自行判断的细节，不要把多个问题塞进同一选项。
- 用户说“直接做”“你决定”“自由发挥”或正在回答上一轮澄清问题时，禁止再次询问，必须结合回答继续原任务。
- ask_user 只用于暂停并等待用户回答，不得用普通正文假装询问。宿主会把选项显示为编号列表，并自动提供“由 AI 决定”。
- 结合会话历史理解“它”“刚才的效果”“继续”等指代和延续要求，但代码、工程状态和执行结果必须以本轮首条实时项目快照或之后的 get_context 结果为准。
- 首轮系统消息已经提供完整实时源码和项目状态，视为已完成首次 get_context。不要机械地再次读取；只有源码变化后仍需继续编辑或状态可能变化时才调用 get_context。
- 执行已审阅计划或包含多个关键阶段的复杂任务时，使用 update_task_plan 维护 2 到 10 个简短步骤。只在开始、完成里程碑或方案确实变化时更新，不要把每次工具调用都写成步骤；简单任务无需创建清单。
- get_context 只返回当前场景标签。每个场景都是包含自身 import、常量、辅助函数和 Scene 类的独立 Python 文件，不得假设其他标签中的定义可用。
- 需要了解或操作其他场景时，先调用 list_scenes，再用 get_scene 读取目标；修改前必须 switch_scene 到明确的 sceneId。不要仅凭场景名称猜测目标。
- create_scene 创建完整独立文件；rename_scene 同步更新标签与 Scene 类；delete_scene 仅在用户明确要求删除时调用。
- 修改已有函数或方法前先调用 inspect_python_structure。新增语句优先使用 insert_statements，重建一个函数使用 replace_function_body，增加导入使用 add_import；这些工具由宿主根据 AST 定位并计算缩进。
- edit_code 只用于单个表达式、参数、字符串或其他很小的原文替换。不要用 edit_code 拼接函数体、类、多行控制流或大段缩进代码。
- replace_code 只用于空编辑器，或用户明确要求完全重写全部代码时。不得为了方便而删除全部代码后重新生成。
- edit_code 的 oldText 必须逐字取自最新实时项目快照或 get_context 返回的源码，并包含足够上下文以保证唯一匹配，不要凭记忆编造。
- 每次 replace_code 或 edit_code 提交的候选代码都必须是完整、可编译的 Python，不能依赖下一次工具调用再补齐缩进、括号或代码块。候选被语法预检拒绝后，读取错误并更换编辑方案，不要原样重复调用。
- 同一种字符串编辑方案连续失败两次后，必须调用 inspect_python_structure，并改用 insert_statements 或 replace_function_body 重建最小作用域，不得继续猜测缩进。
- 用户提到配音、旁白、解说、语音或 TTS 时，必须先调用 get_voiceover_context。添加配音必须使用 add_voiceover 或 add_synchronized_voiceover，禁止使用 edit_code 手写或修改 visual-python-tts、Base64、self.add_sound 配音占位标记。
- self.add_voiceover 和 self.add_synchronized_voiceover 不是 Python API。如果当前代码中已有这些错误调用，先用 edit_code 删除全部错误调用，再通过专用配音工具重新插入旁白。
- add_voiceover 用于独立播放一段旁白；add_synchronized_voiceover 用于旁白开始时播放一段或多段目标动画，并在动画较短时自动等待旁白结束。anchorText 和 targetText 必须逐字复制自最新实时项目快照或 get_context 返回的代码。
- 每次修改成功后，宿主会自动执行 check_code 和 validate_scene，并把结果随修改结果一并返回；添加或修改配音时还会自动执行 check_voiceover。不要机械地再次调用这些检查。
- 自动检查失败时读取诊断并继续修复，不能把检查失败当作任务完成。资源任务仍需调用 check_resources，外部包任务仍需先调用 check_dependencies。
- 运行后使用 wait 和 get_execution_state 读取真实结果；发现错误后修改并重新验证。
- 只有用户明确要求“运行”“执行”、run 或 execute 时才允许调用 run_project。代码修改和语法检查本身不自动授权运行。
- 你可以自主决定是否调用 render_manim。需要验证视觉结果、排查渲染错误或确认 Manim 最终交付时应渲染；普通文本修改或仅靠语法检查即可确认的任务不要机械渲染。
- 渲染后必须使用 wait 和 get_execution_state 查看真实结果。失败时读取错误、修改代码、通过 check_code 后再次渲染，直到成功或确认存在外部阻塞。
- 用户明确要求不要渲染时，禁止调用 render_manim。
- 只有用户明确要求时才保存。不要擅自覆盖未保存路径。
- 面向用户的过程说明保持简短，只说明当前意图、实际修改和关键结果。
- 完成前逐项核对原始任务，不得声称完成尚未实现或验证的内容。`;

const planModeRules = `当前处于 Plan 模式。以下规则优先于上面的执行规则：
- 你的职责是调查当前工程并给出实施计划，不是执行计划。
- 首轮实时项目快照已经包含当前源码和项目状态；需要刷新状态或了解其他场景、资源、依赖、代码结构或已有结果时，再使用可用的只读工具核实。
- 禁止修改、创建、删除、重命名或切换场景，禁止修改或格式化代码，禁止运行、渲染、安装依赖、保存工程、等待或停止任务。
- 最终回复必须是可审阅的 Markdown 计划，说明目标、需要修改的位置、关键实现步骤和验证方式。内容应具体到足以让 Agent 直接执行，同时避免重复需求或堆砌无关说明。
- 不得声称已经修改代码、运行项目或完成实施。`;

const chatModeRules = `当前请求是普通对话。以下规则优先于执行规则：
- 直接自然地回答用户，不调用任何工具，不读取或修改工程，不运行或渲染。
- 不要把聊天内容补充解释成编程任务，尤其不得自行创建随机动画或示例代码写入工程。
- 如果用户只是在询问能力、概念或一般建议，回答问题即可；只有用户随后明确下达操作指令时才执行。`;

const inspectModeRules = `当前请求是只读问答。以下规则优先于执行规则：
- 先阅读首轮实时项目快照，并按需使用可用的只读工具核实当前项目，然后回答用户问题。
- 禁止修改、创建、删除、重命名或切换场景，禁止修改或格式化代码，禁止运行、渲染、安装依赖、保存工程、等待或停止任务。
- 不得因为发现可改进内容就擅自修复；给出结论和建议，等待用户明确要求修改。`;

export function createAiAgentMessages(
  prompt: string,
  mode: "native" | "fallback" = "native",
  allowRender = true,
  allowRun = false,
  history: AiConversationTurn[] = [],
  allowReplace = true,
  allowClarification = true,
  agentMode: AiAgentMode = "agent",
  requestIntent: AiAgentRequestIntent = "execute",
): AiChatMessage[] {
  const availableTools = availableToolDefinitions(allowRender, allowRun, allowReplace, allowClarification, agentMode, requestIntent);
  const protocol = mode === "native"
    ? requestIntent === "chat" && agentMode === "agent"
      ? "直接返回简洁自然的中文回复。"
      : "直接使用提供的 Function Calling 工具。完成后返回一段简洁中文结果，不要把工具调用写入正文。"
    : `当前接口不支持标准 Function Calling。每轮只返回一个 JSON 对象，禁止 Markdown 和额外文字：
- 调用工具：{"message":"简短过程说明","tool":{"name":"工具名","arguments":{}}}
- 完成回复：{"message":"可选说明","final":"最终回复内容"}
可用工具：${JSON.stringify(availableTools)}`;
  const recentHistory = history
    .slice(-8)
    .map((turn) => ({ user: turn.user.slice(0, 4000), assistant: turn.assistant.slice(0, 4000) }));
  const olderHistory = history.slice(0, -8);
  const memory = olderHistory.length ? createConversationMemory(olderHistory) : "";
  const modeRules = agentMode === "plan" ? planModeRules : requestIntent === "chat" ? chatModeRules : requestIntent === "inspect" ? inspectModeRules : "";
  return [
    { role: "system", content: `${agentRules}${modeRules ? `\n\n${modeRules}` : ""}\n\n${protocol}` },
    ...(memory ? [{ role: "system" as const, content: memory }] : []),
    ...recentHistory.flatMap((turn): AiChatMessage[] => [
      { role: "user", content: turn.user },
      { role: "assistant", content: turn.assistant },
    ]),
    { role: "user", content: prompt },
  ];
}

export function createConversationMemory(history: AiConversationTurn[]): string {
  const entries = history.slice(-24).map((turn, index) => {
    const user = turn.user.replace(/\s+/g, " ").trim().slice(0, 500);
    const assistant = turn.assistant.replace(/\s+/g, " ").trim().slice(0, 500);
    return `${index + 1}. 用户：${user}\n   结果：${assistant}`;
  });
  return `场景长期记忆（较早对话的压缩记录，只用于理解延续要求，实时代码仍以 get_context 为准）：\n${entries.join("\n")}`;
}

export function normalizeAiClarification(value: Record<string, unknown>): AiClarification {
  const question = typeof value.question === "string" ? value.question.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  const suppliedOptions = Array.isArray(value.options) ? value.options : [];
  const options = [...new Set(suppliedOptions
    .filter((option): option is string => typeof option === "string")
    .map((option) => option.replace(/\s+/g, " ").trim().slice(0, 100))
    .filter(Boolean))].slice(0, 3);
  if (!question) throw new Error("澄清问题不能为空");
  if (options.length < 2) throw new Error("澄清问题需要提供至少 2 个不同选项");
  if (!options.some((option) => /由\s*AI\s*决定|你决定|自行决定/i.test(option))) options.push("由 AI 决定");
  return { question, options };
}

export function normalizeAiAgentTaskPlan(value: unknown): AiAgentPlanStep[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 10) throw new Error("任务清单需要包含 2 到 10 个步骤");
  const steps = value.map((candidate, index): AiAgentPlanStep => {
    if (!isRecord(candidate)) throw new Error(`第 ${index + 1} 个任务步骤格式无效`);
    const step = typeof candidate.step === "string" ? candidate.step.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    const status = candidate.status;
    if (!step) throw new Error(`第 ${index + 1} 个任务步骤不能为空`);
    if (status !== "pending" && status !== "in_progress" && status !== "completed") throw new Error(`第 ${index + 1} 个任务步骤状态无效`);
    return { step, status };
  });
  if (new Set(steps.map(({ step }) => step)).size !== steps.length) throw new Error("任务清单不能包含重复步骤");
  const activeCount = steps.filter(({ status }) => status === "in_progress").length;
  const allCompleted = steps.every(({ status }) => status === "completed");
  if ((!allCompleted && activeCount !== 1) || (allCompleted && activeCount !== 0)) throw new Error("未全部完成时必须且只能有一个进行中步骤");
  return steps;
}

export function formatAiClarification(clarification: AiClarification): string {
  const options = clarification.options.map((option, index) => `${index + 1}. ${option}`).join("\n");
  return `${clarification.question}\n\n${options}\n\n请回复序号，也可以直接补充要求。`;
}

function toolResultMessage(name: AiAgentToolName, result: unknown): AiChatMessage {
  const modelResult = isRecord(result) ? compactToolResultForModel(name, result) : result;
  const serialized = JSON.stringify(modelResult);
  return {
    role: "user",
    content: `工具 ${name} 执行结果：\n${serialized.length > 60_000 ? `${serialized.slice(0, 60_000)}\n[结果已截断]` : serialized}\n请根据结果继续完成原始任务。`,
  };
}

export function toolLabel(name: AiAgentToolName): string {
  return toolDefinitions.find((tool) => tool.name === name)?.label ?? name;
}

const highImpactTools = new Set<AiAgentToolName>(["run_project", "render_manim", "install_dependencies", "delete_scene", "save_project"]);

export function requiresAiAgentPermission(mode: AiAgentPermissionMode, toolName: AiAgentToolName): boolean {
  return mode === "confirm" && highImpactTools.has(toolName);
}

function permissionRequestDetail(call: AiAgentToolCall): string {
  if (call.name === "run_project") return "运行当前 Python 工程";
  if (call.name === "render_manim") return "渲染当前 Manim 场景";
  if (call.name === "save_project") return "保存并覆盖当前工程文件";
  if (call.name === "delete_scene") return `删除场景 ${typeof call.arguments.sceneId === "string" ? call.arguments.sceneId : ""}`.trim();
  if (call.name === "install_dependencies") {
    const packages = Array.isArray(call.arguments.packages) ? call.arguments.packages.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
    return packages.length ? `安装 Python 依赖：${packages.join(", ")}` : "安装 Python 依赖";
  }
  return toolLabel(call.name);
}

function activityResult(value: unknown): string {
  const text = JSON.stringify(value, null, 2);
  return text.length > 5000 ? `${text.slice(0, 5000)}\n...` : text;
}

const stripExecutionAnsi = (value: string) => value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");

export function createAiExecutionSnapshot(kind: AiAgentExecution["kind"], result: Record<string, unknown>): AiAgentExecution {
  const problems = Array.isArray(result.problems) ? result.problems.flatMap((item) => {
    if (!isRecord(item) || typeof item.message !== "string") return [];
    return [{
      kind: typeof item.kind === "string" ? item.kind : "runtime",
      line: typeof item.line === "number" && Number.isFinite(item.line) ? Math.max(0, Math.floor(item.line)) : 0,
      message: item.message.slice(0, 2000),
      ...(typeof item.suggestion === "string" && item.suggestion ? { suggestion: item.suggestion.slice(0, 2000) } : {}),
    }];
  }) : [];
  const output = (Array.isArray(result.output) ? result.output : []).flatMap((item) => {
    if (!isRecord(item) || typeof item.data !== "string") return [];
    const stream = item.stream === "stderr" ? "stderr" as const : item.stream === "system" ? "system" as const : "stdout" as const;
    return stripExecutionAnsi(item.data).split(/\r?\n/).map((data) => ({ stream, data: data.trimEnd().slice(0, 2000) })).filter(({ data }) => data.trim());
  }).slice(-8);
  const progress = isRecord(result.renderProgress) ? result.renderProgress : undefined;
  const renderOutputValue = isRecord(result.renderOutput) ? result.renderOutput : isRecord(result.video) ? result.video : undefined;
  const renderOutput = renderOutputValue && typeof renderOutputValue.path === "string"
    ? {
      type: renderOutputValue.type === "image" ? "image" as const : "video" as const,
      scene: typeof renderOutputValue.scene === "string" ? renderOutputValue.scene : "Manim",
      path: renderOutputValue.path,
      ...(typeof renderOutputValue.transparentBackground === "boolean" ? { transparentBackground: renderOutputValue.transparentBackground } : {}),
    }
    : undefined;
  const running = kind === "manim" ? result.rendering === true : result.running === true;
  const state: AiAgentExecution["state"] = running ? "running" : problems.length ? "failed" : "completed";
  const elapsedCandidate = kind === "manim" ? result.renderElapsedSeconds : result.pythonElapsedSeconds;
  const elapsedSeconds = typeof elapsedCandidate === "number" && Number.isFinite(elapsedCandidate) ? Math.max(0, Math.floor(elapsedCandidate)) : undefined;
  const label = state === "failed"
    ? kind === "manim" ? "Manim 渲染失败" : "Python 运行失败"
    : state === "completed"
      ? kind === "manim" ? "Manim 渲染完成" : "Python 运行完成"
      : kind === "manim" && typeof progress?.label === "string" ? progress.label : kind === "manim" ? "正在渲染 Manim" : "正在运行 Python";
  return {
    kind,
    state,
    label,
    ...(elapsedSeconds === undefined ? {} : { elapsedSeconds }),
    ...(kind === "manim" && typeof progress?.scene === "string" ? { scene: progress.scene } : {}),
    ...(kind === "manim" && typeof progress?.percent === "number" ? { percent: Math.max(0, Math.min(100, progress.percent)) } : {}),
    output,
    problems,
    ...(renderOutput ? { renderOutput } : {}),
  };
}

export async function runAiCodeAgent({ prompt, history = [], agentMode, initialPlan = [], host, onActivity, onProgress, permissionMode, onPermissionRequest, signal }: RunAiCodeAgentArgs): Promise<AiAgentResult> {
  let taskPlan: AiAgentPlanStep[] = [];
  let tokenUsage = emptyTokenUsage();
  let currentProgress: Omit<AiAgentProgress, "taskPlan" | "tokenUsage"> = { phase: "preparing", label: "正在准备任务" };
  if (initialPlan.length >= 2) {
    try { taskPlan = normalizeAiAgentTaskPlan(initialPlan); } catch { taskPlan = []; }
  }
  const reportProgress = (progress: Omit<AiAgentProgress, "taskPlan" | "tokenUsage">) => {
    currentProgress = progress;
    onProgress({
      ...progress,
      ...(taskPlan.length ? { taskPlan: taskPlan.map((step) => ({ ...step })) } : {}),
      ...(tokenUsage.requests ? { tokenUsage: { ...tokenUsage } } : {}),
    });
  };
  reportProgress({ phase: "preparing", label: "正在准备任务" });
  let nativeFunctionCalling = true;
  let routeDecision: AiAgentRouteDecision = {
    intent: "inspect",
    requiredActions: [],
    allowRun: false,
    renderPolicy: "forbid",
    allowWholeFileRewrite: false,
    allowClarification: false,
    response: "",
  };
  if (agentMode === "agent") {
    reportProgress({ phase: "thinking", label: "正在理解请求" });
    const routed = await routeAiAgentRequest({
      prompt,
      history,
      signal,
      onChatResponse: (response) => onActivity({ id: "message-route", kind: "message", status: "running", title: response }),
    });
    routeDecision = routed.decision;
    tokenUsage = routed.tokenUsage;
    nativeFunctionCalling = routed.nativeFunctionCalling;
    reportProgress({ phase: "preparing", label: routeDecision.intent === "execute" ? "正在准备操作" : routeDecision.intent === "inspect" ? "正在读取项目" : "正在生成回复" });
    if (routeDecision.intent === "chat") {
      onActivity({ id: "message-route", kind: "message", status: "done", title: routeDecision.response });
      return {
        summary: routeDecision.response,
        toolCallCount: 0,
        lineCount: host.getLineCount(),
        tokenUsage: { ...tokenUsage },
        mode: agentMode,
        intent: "chat",
      };
    }
  }
  const currentCode = host.getSnapshot().code;
  const requestIntent = routeDecision.intent;
  const requiredActions = new Set<AiAgentRequiredAction>(agentMode === "agent" ? routeDecision.requiredActions : []);
  const completedActions = new Set<AiAgentRequiredAction>();
  const contextRequired = true;
  const contextReminder = agentMode === "plan"
    ? "请阅读首轮实时项目快照并输出实施计划。"
    : requestIntent === "inspect"
      ? "请阅读首轮实时项目快照并回答用户的问题；不要修改任何内容。"
      : "请阅读首轮实时项目快照，并实际完成用户明确要求的任务。";
  const allowRender = requestIntent === "execute" && routeDecision.renderPolicy === "auto";
  const allowRun = requestIntent === "execute" && routeDecision.allowRun;
  const allowReplace = requestIntent === "execute" && (typeof currentCode !== "string" || !currentCode.trim() || routeDecision.allowWholeFileRewrite);
  const allowClarification = requestIntent === "execute" && routeDecision.allowClarification;
  const functionTools = getAiAgentFunctionTools(agentMode, allowRender, allowRun, allowReplace, allowClarification, requestIntent);
  const createMessages = (protocol: "native" | "fallback", includeLiveContext = contextRequired) => {
    const next = createAiAgentMessages(prompt, protocol, allowRender, allowRun, history, allowReplace, allowClarification, agentMode, requestIntent);
    if (includeLiveContext && contextRequired) next.splice(next.length - 1, 0, {
      role: "system",
      content: `${liveProjectSnapshotPrefix}${JSON.stringify(host.getSnapshot())}`,
    });
    if (taskPlan.length) next.splice(next.length - 1, 0, {
      role: "system",
      content: `当前任务清单状态：${JSON.stringify(taskPlan)}\n从 in_progress 步骤继续，pending 步骤随后执行，不要重复 completed 步骤。每完成一个真实里程碑后调用 update_task_plan 更新状态。`,
    });
    return next;
  };
  let messages = createMessages(nativeFunctionCalling ? "native" : "fallback", true);
  let toolCallCount = 0;
  let malformedCount = 0;
  let noToolCount = 0;
  let revision = 0;
  let checkedRevision = 0;
  let validatedRevision = 0;
  let renderedRevision = -1;
  let inspectedRenderRevision = -1;
  let voiceoverContextRead = false;
  let contextRead = contextRequired;
  let contextRevision = contextRequired ? 0 : -1;
  let lastTraceCompactionTokens = 0;
  let activeExecution: { kind: AiAgentExecution["kind"]; activityId: string } | null = null;
  const deniedTools = new Set<AiAgentToolName>();
  const repeatedCalls = new Map<string, number>();
  const repeatedCallExemptions = new Set<AiAgentToolName>(["wait", "get_execution_state"]);
  const requiredActionLabels: Record<AiAgentRequiredAction, string> = {
    mutation: "实际修改代码或工程",
    run: "运行 Python 并读取最终结果",
    render: "渲染并检查结果",
    save: "保存工程",
    switch_scene: "切换场景",
    install_dependencies: "安装并验证依赖",
    stop_execution: "停止当前任务",
  };
  const missingRequiredActions = () => [...requiredActions].filter((action) => !completedActions.has(action));
  const requiredActionReminder = () => `任务仍缺少以下必要操作：${missingRequiredActions().map((action) => requiredActionLabels[action]).join("、")}。必须调用对应工具并取得真实结果，不能仅在回复中声称完成。`;

  const executeCall = async (call: AiAgentToolCall, round: number): Promise<Record<string, unknown>> => {
    if (call.name === "ask_user") {
      if (!allowClarification) return { ok: false, error: "本轮是对上一轮问题的回答，或用户已要求直接决定，不能再次询问。请继续完成原任务。" };
      if (!contextRead) return { ok: false, error: "询问前必须先调用 get_context 读取当前场景。" };
      if (revision > 0) return { ok: false, error: "代码已经开始修改，不能再暂停询问。请基于当前方案继续完成任务。" };
      try {
        return { ok: true, __clarification: normalizeAiClarification(call.arguments) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
    toolCallCount += 1;
    const signature = `${revision}:${call.name}:${JSON.stringify(call.arguments)}`;
    const repetition = (repeatedCalls.get(signature) ?? 0) + 1;
    repeatedCalls.set(signature, repetition);
    const id = call.name === "get_execution_state" && activeExecution ? activeExecution.activityId : `tool-${round}-${toolCallCount}`;
    const displayedToolName = call.name === "get_execution_state" && activeExecution
      ? activeExecution.kind === "manim" ? "render_manim" : "run_project"
      : call.name;
    const detail = typeof call.arguments.summary === "string" ? call.arguments.summary : undefined;
    if (call.name !== "update_task_plan") reportProgress({ phase: "executingTool", label: `正在${toolLabel(call.name)}` });
    const reportActivity = call.name !== "wait" && call.name !== "update_task_plan";
    if (reportActivity) onActivity({ id, kind: "tool", status: "running", title: toolLabel(displayedToolName), detail, toolName: displayedToolName });
    let result: Record<string, unknown>;
    if (!isToolAvailable(call.name, agentMode, requestIntent, allowRender, allowRun, allowReplace, allowClarification)) {
      result = { ok: false, error: agentMode === "plan" ? `${toolLabel(call.name)}不允许在 Plan 模式中执行。请继续只读分析并输出计划。` : "当前任务不允许执行此工具。" };
    } else if (call.name === "update_task_plan") {
      try {
        taskPlan = normalizeAiAgentTaskPlan(call.arguments.steps);
        const activeStep = taskPlan.find(({ status }) => status === "in_progress");
        reportProgress({ phase: "executingTool", label: activeStep ? `正在执行：${activeStep.step}` : "计划步骤已完成" });
        result = { ok: true, completed: taskPlan.filter(({ status }) => status === "completed").length, total: taskPlan.length };
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    } else if (call.name === "check_code" && revision > 0 && checkedRevision === revision) {
      result = { ok: true, valid: true, reusedAutomaticCheck: true };
    } else if (call.name === "validate_scene" && revision > 0 && validatedRevision === revision) {
      result = { ok: true, valid: true, reusedAutomaticCheck: true };
    } else if ((call.name === "add_voiceover" || call.name === "add_synchronized_voiceover") && !voiceoverContextRead) {
      result = { ok: false, error: "添加配音前必须先调用 get_voiceover_context，读取当前 TTS 配置和可用角色。" };
    } else if (call.name === "replace_code" && !allowReplace) {
      result = { ok: false, error: "当前编辑器已有代码，请使用 edit_code 定点修改必要片段，不要删除全部代码后重写。" };
    } else if (call.name === "render_manim" && !allowRender) {
      result = { ok: false, error: "用户明确要求不要渲染，本次任务只允许修改并检查代码。" };
    } else if (call.name === "run_project" && !allowRun) {
      result = { ok: false, error: "用户没有明确要求运行或执行，本次任务只允许修改并检查代码。" };
    } else if (call.name === "render_manim" && activeExecution?.kind === "manim") {
      result = { ok: false, error: "当前渲染仍在进行，请等待并读取现有渲染结果。" };
    } else if (call.name === "render_manim" && inspectedRenderRevision === revision) {
      result = { ok: false, error: "当前代码版本已经成功渲染并检查，不要重复渲染。" };
    } else if (deniedTools.has(call.name)) {
      result = { ok: false, error: `用户未授权${toolLabel(call.name)}，不要再次请求该操作。` };
    } else if (!repeatedCallExemptions.has(call.name) && repetition > 2) {
      result = { ok: false, error: "相同状态下已经重复调用该工具，请根据现有结果更换方案。" };
    } else {
      try {
        if (requiresAiAgentPermission(permissionMode, call.name)) {
          const approved = await onPermissionRequest({
            id: `permission-${round}-${toolCallCount}`,
            toolName: call.name,
            title: `允许 AI ${toolLabel(call.name)}`,
            detail: permissionRequestDetail(call),
          });
          if (!approved) {
            deniedTools.add(call.name);
            result = { ok: false, error: `用户未授权${toolLabel(call.name)}，请跳过该操作并继续完成可以完成的部分。` };
          } else {
            result = { ok: true, ...await host.executeTool(call.name, call.arguments, signal) };
          }
        } else {
          result = { ok: true, ...await host.executeTool(call.name, call.arguments, signal) };
        }
      } catch (error) {
        if (signal.aborted) throw error;
        result = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
    if (result.ok === true && mutatingTools.has(call.name) && result.changed !== false) {
      revision += 1;
      completedActions.add("mutation");
    }
    if (call.name === "replace_code" && result.ok !== true) host.cancelCodePreview();
    const codeChangeCandidate = result.__codeChange;
    const codeChange = isRecord(codeChangeCandidate)
      && typeof codeChangeCandidate.before === "string"
      && typeof codeChangeCandidate.after === "string"
      ? {
        before: codeChangeCandidate.before,
        after: codeChangeCandidate.after,
        ...(typeof codeChangeCandidate.sceneId === "string" ? { sceneId: codeChangeCandidate.sceneId } : {}),
        ...(typeof codeChangeCandidate.sceneName === "string" ? { sceneName: codeChangeCandidate.sceneName } : {}),
      }
      : undefined;
    delete result.__codeChange;
    if (call.name === "check_code" && result.ok === true && result.valid === true) checkedRevision = revision;
    if (call.name === "validate_scene" && result.ok === true && result.valid === true) validatedRevision = revision;
    if (call.name === "get_voiceover_context" && result.ok === true) voiceoverContextRead = true;
    if (call.name === "get_context" && result.ok === true) {
      contextRead = true;
      contextRevision = revision;
    }
    if (call.name === "render_manim" && result.ok === true && result.started === true) renderedRevision = revision;
    if (call.name === "run_project" && result.ok === true && result.started === true) activeExecution = { kind: "python", activityId: id };
    if (call.name === "render_manim" && result.ok === true && result.started === true) activeExecution = { kind: "manim", activityId: id };
    if (call.name === "inspect_rendered_output" && result.ok === true && result.valid === true) {
      inspectedRenderRevision = revision;
      completedActions.add("render");
    }
    if (call.name === "save_project" && result.ok === true && result.saved === true) completedActions.add("save");
    if (call.name === "switch_scene" && result.ok === true && result.switched === true) completedActions.add("switch_scene");
    if (call.name === "install_dependencies" && result.ok === true && result.installed === true) completedActions.add("install_dependencies");
    if (call.name === "stop_execution" && result.ok === true && result.stopped === true) completedActions.add("stop_execution");
    const executionKind = call.name === "get_execution_state" ? activeExecution?.kind : undefined;
    const execution = call.name === "get_execution_state" && activeExecution
      ? createAiExecutionSnapshot(activeExecution.kind, result)
      : call.name === "run_project" && result.ok === true && result.started === true
        ? createAiExecutionSnapshot("python", { running: true, output: [], problems: [] })
        : call.name === "render_manim" && result.ok === true && result.started === true
          ? createAiExecutionSnapshot("manim", { rendering: true, output: [], problems: [] })
          : undefined;
    if (executionKind && execution && execution.state !== "running") {
      if (executionKind === "python") completedActions.add("run");
      if (executionKind === "manim" && execution.state === "failed") {
        renderedRevision = -1;
        inspectedRenderRevision = -1;
      }
      activeExecution = null;
    }
    const executionStartFailed = (call.name === "run_project" || call.name === "render_manim") && result.ok === true && result.started !== true;
    const failed = result.ok !== true || executionStartFailed || execution?.state === "failed";
    const invalid = (call.name === "check_code" || call.name === "check_voiceover" || call.name === "validate_scene" || call.name === "check_resources" || call.name === "check_dependencies" || call.name === "inspect_rendered_output") && result.valid === false;
    const changePreview = typeof result.diff === "string" ? result.diff : "";
    const executionDetail = call.name === "get_execution_state"
      ? execution?.state === "running" ? "进行中" : execution?.state === "failed" ? "发现问题" : "完成"
      : undefined;
    if (reportActivity) onActivity({
      id,
      kind: "tool",
      status: failed || invalid ? "error" : "done",
      title: toolLabel(displayedToolName),
      detail: failed ? String(result.error || (executionStartFailed ? "未能启动" : execution?.label || "执行失败")) : invalid ? call.name === "check_voiceover" ? "发现配音问题" : "发现语法问题" : executionDetail || detail,
      result: changePreview || (failed && !execution) || invalid ? changePreview || activityResult(result) : undefined,
      toolName: displayedToolName,
      codeChange,
      execution,
    });
    if (result.ok === true && mutatingTools.has(call.name)) {
      const checkCode = await executeCall({ name: "check_code", arguments: {} }, round);
      const checkVoiceover = (call.name === "add_voiceover" || call.name === "add_synchronized_voiceover")
        ? await executeCall({ name: "check_voiceover", arguments: {} }, round)
        : undefined;
      const validateScene = checkCode.ok === true && checkCode.valid === true
        ? await executeCall({ name: "validate_scene", arguments: {} }, round)
        : undefined;
      return {
        ...result,
        automaticChecks: {
          checkCode,
          ...(checkVoiceover ? { checkVoiceover } : {}),
          ...(validateScene ? { validateScene } : { validateScene: { ok: false, skipped: true, reason: "语法检查未通过" } }),
        },
      };
    }
    return result;
  };

  for (let round = 1; round <= 80; round += 1) {
    if (signal.aborted) throw new Error("已停止生成");
    const estimatedCharacters = estimateAiAgentMessageCharacters(messages, nativeFunctionCalling ? functionTools : []);
    const staleContextCanBeCompacted = revision > 0 && contextRevision < revision;
    if (staleContextCanBeCompacted && (
      messages.length > 48
      || estimatedCharacters > 96_000
      || tokenUsage.total - lastTraceCompactionTokens > 120_000
    )) {
      const trace = createAgentTraceMemory(messages);
      messages = createMessages(nativeFunctionCalling ? "native" : "fallback", false);
      messages.splice(messages.length - 1, 0, {
        role: "system",
        content: `此前执行轨迹已收敛以避免重复发送过期源码。当前状态：${JSON.stringify({
          ...compactSnapshot(host.getSnapshot(), revision),
          checkedRevision,
          validatedRevision,
          renderedRevision,
          inspectedRenderRevision,
          ...(taskPlan.length ? { taskPlan } : {}),
        })}${trace ? `\n最近的关键操作与诊断：\n${trace}` : ""}`,
      });
      lastTraceCompactionTokens = tokenUsage.total;
    }
    const messageId = `message-${round}`;
    let streamed = "";
    let streamedMessage = "";
    let streamedCode = "";
    const streamedToolCalls = new Map<number, { name: string; arguments: string }>();
    let completion: Awaited<ReturnType<typeof streamAiChat>>;
    let streamPhase: AiAgentPhase = "waiting";
    reportProgress({ phase: "waiting", label: round === 1 ? "正在等待模型" : "正在分析操作结果" });
    try {
      completion = await streamAiChat(messages, (delta) => {
        if (streamPhase !== "responding") {
          streamPhase = "responding";
          reportProgress({ phase: "responding", label: "正在生成回复" });
        }
        streamed += delta;
        if (!nativeFunctionCalling) {
          const nextCode = extractStreamingJsonString(streamed, "code");
          if (nextCode && nextCode !== streamedCode) {
            streamedCode = nextCode;
            host.previewCode(nextCode);
          }
        }
        const next = nativeFunctionCalling ? extractVisibleAgentContent(streamed) : extractStreamingAgentMessage(streamed);
        if (!next || next === streamedMessage) return;
        streamedMessage = next;
        onActivity({ id: messageId, kind: "message", status: "running", title: next });
      }, {
        maxTokens: 65_536,
        signal,
        ...(nativeFunctionCalling && functionTools.length ? { tools: functionTools } : {}),
        onReasoningDelta: () => {
          if (streamPhase === "waiting") {
            streamPhase = "thinking";
            reportProgress({ phase: "thinking", label: "模型正在思考" });
          }
        },
        onToolCallDelta: ({ index, name, delta }) => {
          if (streamPhase !== "preparingTool") {
            streamPhase = "preparingTool";
            reportProgress({ phase: "preparingTool", label: "正在准备操作" });
          }
          const current = streamedToolCalls.get(index) ?? { name: "", arguments: "" };
          current.name += name ?? "";
          current.arguments += delta;
          streamedToolCalls.set(index, current);
          if (current.name !== "replace_code") return;
          const nextCode = extractStreamingJsonString(current.arguments, "code");
          if (nextCode && nextCode !== streamedCode) {
            streamedCode = nextCode;
            host.previewCode(nextCode);
          }
        },
      });
      tokenUsage = mergeAiAgentTokenUsage(tokenUsage, completion);
      reportProgress(currentProgress);
    } catch (error) {
      host.cancelCodePreview();
      if (!nativeFunctionCalling || !isFunctionCallingUnsupportedError(error)) throw error;
      nativeFunctionCalling = false;
      messages = createMessages("fallback");
      if (contextRequired) {
        contextRead = true;
        contextRevision = revision;
      }
      onActivity({ id: "compatibility-mode", kind: "message", status: "done", title: "已切换兼容工具模式。" });
      continue;
    }

    if (nativeFunctionCalling) {
      const visible = extractVisibleAgentContent(completion.content);
      if (visible) onActivity({ id: messageId, kind: "message", status: "done", title: visible });
      if (!completion.toolCalls.length && hasDsmlToolMarkup(completion.content)) {
        host.cancelCodePreview();
        nativeFunctionCalling = false;
        messages = createMessages("fallback");
        contextRead = true;
        contextRevision = revision;
        onActivity({ id: "compatibility-mode", kind: "message", status: "done", title: "已切换兼容工具模式。" });
        continue;
      }
      if (!completion.toolCalls.length) {
        host.cancelCodePreview();
        if (contextRequired && !contextRead) {
          noToolCount += 1;
          if (noToolCount >= 3) throw new Error("模型未按要求读取项目上下文，已停止任务");
          messages.push({ role: "assistant", content: visible });
          messages.push({ role: "user", content: contextReminder });
          continue;
        }
        if (requestIntent === "execute" && missingRequiredActions().length) {
          noToolCount += 1;
          if (noToolCount >= 3) throw new Error(`模型没有完成用户要求的必要操作：${missingRequiredActions().map((action) => requiredActionLabels[action]).join("、")}`);
          messages.push({ role: "assistant", content: visible });
          messages.push({ role: "user", content: requiredActionReminder() });
          continue;
        }
        if (requestIntent === "execute" && revision !== checkedRevision) {
          messages.push({ role: "assistant", content: visible });
          messages.push({ role: "user", content: "最后一次代码修改后必须调用 check_code 并通过检查。" });
          continue;
        }
        if (requestIntent === "execute" && revision !== validatedRevision) {
          messages.push({ role: "assistant", content: visible });
          messages.push({ role: "user", content: "最后一次修改后必须调用 validate_scene 并通过完整性检查。" });
          continue;
        }
        if (requestIntent === "execute" && renderedRevision === revision && inspectedRenderRevision !== revision) {
          messages.push({ role: "assistant", content: visible });
          messages.push({ role: "user", content: "本版本已经渲染，必须调用 inspect_rendered_output 检查最终结果；疑似空白时需要修复并重新渲染。" });
          continue;
        }
        if (requestIntent === "execute" && taskPlan.some(({ status }) => status !== "completed")) {
          messages.push({ role: "assistant", content: visible });
          messages.push({ role: "user", content: "任务清单仍有未完成步骤。请核对实际结果，并调用 update_task_plan 更新状态；只有真正完成的步骤才能标记 completed。" });
          continue;
        }
        return {
          summary: visible || (agentMode === "plan" ? "计划已完成" : requestIntent === "chat" ? "已回复" : requestIntent === "inspect" ? "分析已完成" : "任务已完成"),
          toolCallCount,
          lineCount: host.getLineCount(),
          tokenUsage: { ...tokenUsage },
          mode: agentMode,
          intent: requestIntent,
          ...(agentMode === "plan" ? { planPrompt: prompt } : {}),
          ...(taskPlan.length ? { taskPlan } : {}),
        };
      }
      messages.push({ role: "assistant", content: visible, toolCalls: completion.toolCalls });
      for (const nativeCall of completion.toolCalls) {
        let result: Record<string, unknown>;
        let call: AiAgentToolCall | undefined;
        try {
          call = parseNativeToolCall(nativeCall);
          if (call.name !== "replace_code") host.cancelCodePreview();
          result = await executeCall(call, round);
          const clarification = result.__clarification;
          if (isRecord(clarification) && typeof clarification.question === "string" && Array.isArray(clarification.options)) {
            const normalized = clarification as unknown as AiClarification;
            return { summary: formatAiClarification(normalized), toolCallCount, lineCount: host.getLineCount(), tokenUsage: { ...tokenUsage }, mode: agentMode, intent: requestIntent, ...(agentMode === "plan" ? { planPrompt: prompt } : {}), clarification: normalized };
          }
        } catch (error) {
          host.cancelCodePreview();
          result = { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
        messages.push({ role: "tool", toolCallId: nativeCall.id, content: JSON.stringify(call ? compactToolResultForModel(call.name, result) : result) });
        if (call && result.ok === true && mutatingTools.has(call.name) && result.changed !== false) messages = compactStaleAiAgentContext(messages, host.getSnapshot(), revision);
      }
      continue;
    }

    let decision: AiAgentDecision;
    try {
      decision = parseAiAgentDecision(completion.content);
      malformedCount = 0;
    } catch (error) {
      host.cancelCodePreview();
      const message = error instanceof Error ? error.message : String(error);
      malformedCount += 1;
      onActivity({ id: `protocol-${round}`, kind: "tool", status: "error", title: "解析模型操作", detail: message, result: completion.content.slice(0, 1500) });
      if (malformedCount >= 3) throw new Error(`模型连续返回无效工具决策：${message}`);
      messages.push({ role: "assistant", content: completion.content });
      messages.push({ role: "user", content: `${message}。请只返回约定的单个 JSON 对象。` });
      continue;
    }
    if (decision.message) onActivity({ id: messageId, kind: "message", status: "done", title: decision.message });
    messages.push({ role: "assistant", content: completion.content });
    if (decision.final) {
      host.cancelCodePreview();
      if (contextRequired && !contextRead) {
        noToolCount += 1;
        if (noToolCount >= 3) throw new Error("模型未按要求读取项目上下文，已停止任务");
        messages.push({ role: "user", content: contextReminder });
        continue;
      }
      if (requestIntent === "execute" && missingRequiredActions().length) {
        noToolCount += 1;
        if (noToolCount >= 3) throw new Error(`模型没有完成用户要求的必要操作：${missingRequiredActions().map((action) => requiredActionLabels[action]).join("、")}`);
        messages.push({ role: "user", content: requiredActionReminder() });
        continue;
      }
      if (requestIntent === "execute" && revision !== checkedRevision) {
        messages.push({ role: "user", content: "最后一次代码修改后必须调用 check_code 并通过检查。" });
        continue;
      }
      if (requestIntent === "execute" && revision !== validatedRevision) {
        messages.push({ role: "user", content: "最后一次修改后必须调用 validate_scene 并通过完整性检查。" });
        continue;
      }
      if (requestIntent === "execute" && renderedRevision === revision && inspectedRenderRevision !== revision) {
        messages.push({ role: "user", content: "本版本已经渲染，必须调用 inspect_rendered_output 检查最终结果；疑似空白时需要修复并重新渲染。" });
        continue;
      }
      if (requestIntent === "execute" && taskPlan.some(({ status }) => status !== "completed")) {
        messages.push({ role: "user", content: "任务清单仍有未完成步骤。请核对实际结果，并调用 update_task_plan 更新状态；只有真正完成的步骤才能标记 completed。" });
        continue;
      }
      return { summary: decision.final, toolCallCount, lineCount: host.getLineCount(), tokenUsage: { ...tokenUsage }, mode: agentMode, intent: requestIntent, ...(agentMode === "plan" ? { planPrompt: prompt } : {}), ...(taskPlan.length ? { taskPlan } : {}) };
    }
    const call = decision.tool!;
    if (call.name !== "replace_code") host.cancelCodePreview();
    const result = await executeCall(call, round);
    const clarification = result.__clarification;
    if (isRecord(clarification) && typeof clarification.question === "string" && Array.isArray(clarification.options)) {
      const normalized = clarification as unknown as AiClarification;
      return { summary: formatAiClarification(normalized), toolCallCount, lineCount: host.getLineCount(), tokenUsage: { ...tokenUsage }, mode: agentMode, intent: requestIntent, ...(agentMode === "plan" ? { planPrompt: prompt } : {}), clarification: normalized };
    }
    messages.push(toolResultMessage(call.name, result));
    if (result.ok === true && mutatingTools.has(call.name) && result.changed !== false) messages = compactStaleAiAgentContext(messages, host.getSnapshot(), revision);
  }
  throw new Error("智能体长时间没有收敛，已停止任务");
}
