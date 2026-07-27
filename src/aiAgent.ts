import { streamAiChat, type AiChatMessage, type AiChatToolCall, type AiChatToolDefinition } from "./aiConfig";
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
  undone?: boolean;
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
  taskChange?: AiTaskChangeSnapshot;
  clarification?: AiClarification;
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
  host: AiCodeAgentHost;
  onActivity: (activity: AiAgentActivity) => void;
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
    description: "读取当前 Python 源码、项目状态、Python 环境和可选工程资源。开始任务时必须调用一次。",
    parameters: objectSchema({ includeResources: { type: "boolean", default: false } }),
  },
  { name: "list_scenes", label: "列出场景", description: "列出工程中的全部独立场景文档、场景 ID、名称、行数和当前场景。需要操作其他场景时先调用。", parameters: objectSchema() },
  { name: "get_scene", label: "读取场景", description: "按 sceneId 读取一个场景的完整独立 Python 源码，不切换当前编辑器。", parameters: objectSchema({ sceneId: { type: "string" } }, ["sceneId"]) },
  { name: "validate_scene", label: "检查场景", description: "统一检查当前独立文件的语法、Manim import、Scene 类数量、construct 方法、标签名称、配音标记和工程资源引用。完成修改前必须通过。", parameters: objectSchema() },
  { name: "list_resources", label: "查询资源", description: "按名称或类型查询工程资源，返回可直接用于独立 Python 文件的绝对路径及文件状态。需要使用图片、音频或字体时先调用。", parameters: objectSchema({ query: { type: "string" }, type: { type: "string", enum: ["audio", "image", "font", "other"] } }) },
  { name: "get_resource", label: "读取资源", description: "按 list_resources 返回的资源 ID 读取单个资源详情和可直接用于代码的绝对路径，不要猜测资源 ID。", parameters: objectSchema({ resourceId: { type: "string" } }, ["resourceId"]) },
  { name: "check_resources", label: "检查资源", description: "检查当前场景引用的 resource:// 资源是否存在于工程且磁盘文件可用。", parameters: objectSchema() },
  { name: "check_dependencies", label: "检查依赖", description: "检查当前Python环境是否安装指定包。", parameters: objectSchema({ packages: { type: "array", minItems: 1, maxItems: 30, items: { type: "string" } } }, ["packages"]) },
  { name: "install_dependencies", label: "安装依赖", description: "安装缺失Python包。必须先调用check_dependencies，且会向用户显示确认。", parameters: objectSchema({ packages: { type: "array", minItems: 1, maxItems: 20, items: { type: "string" } } }, ["packages"]) },
  { name: "inspect_rendered_video", label: "检查视频", description: "检查当前场景最近渲染视频的文件、大小、时长、尺寸以及是否可能为空白。渲染成功后用于质量确认。", parameters: objectSchema() },
  { name: "switch_scene", label: "切换场景", description: "按 sceneId 切换当前场景。之后的代码编辑、运行和渲染工具都只作用于该场景。", parameters: objectSchema({ sceneId: { type: "string" } }, ["sceneId"]) },
  { name: "create_scene", label: "新建场景", description: "创建并切换到一个完整、可独立运行的 Manim Python 场景文件。name 可省略，宿主会生成唯一名称。", parameters: objectSchema({ name: { type: "string" } }) },
  { name: "rename_scene", label: "重命名场景", description: "重命名指定场景文档及其中的首个 Manim Scene 类。新名称必须是唯一的 Python 类名。", parameters: objectSchema({ sceneId: { type: "string" }, name: { type: "string" } }, ["sceneId", "name"]) },
  { name: "delete_scene", label: "删除场景", description: "删除指定场景文档。仅在用户明确要求删除时调用，宿主会要求用户确认，且工程至少保留一个场景。", parameters: objectSchema({ sceneId: { type: "string" } }, ["sceneId"]) },
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
  { name: "render_manim", label: "渲染 Manim", description: "渲染当前 Manim 场景。仅在需要验证视觉结果、排查渲染错误或确认最终交付时使用；不要把每次代码修改都机械地渲染。", parameters: objectSchema() },
  { name: "get_execution_state", label: "检查运行结果", description: "读取运行或渲染状态、终端输出、问题和视频结果。", parameters: objectSchema() },
  { name: "wait", label: "等待任务", description: "等待运行或渲染产生结果。", parameters: objectSchema({ milliseconds: { type: "integer", minimum: 100, maximum: 10_000 } }, ["milliseconds"]) },
  { name: "stop_execution", label: "停止任务", description: "停止正在运行的 Python 或 Manim 任务。", parameters: objectSchema() },
  { name: "save_project", label: "保存工程", description: "保存当前工程。没有工程路径时会明确返回需要用户先另存为。", parameters: objectSchema() },
] as const;

export type AiAgentToolName = typeof toolDefinitions[number]["name"];

export const aiAgentFunctionTools: AiChatToolDefinition[] = toolDefinitions.map(({ name, description, parameters }) => ({
  type: "function",
  function: { name, description, parameters },
}));

function hasAffirmativeIntent(prompt: string, keyword: RegExp, negation: RegExp): boolean {
  const flags = `${keyword.flags.replace("g", "")}g`;
  return [...prompt.matchAll(new RegExp(keyword.source, flags))].some((match) => {
    const index = match.index ?? 0;
    return !negation.test(prompt.slice(Math.max(0, index - 12), index));
  });
}

export function userExplicitlyForbidsRender(prompt: string): boolean {
  return /(?:不|别|勿|无需|不要|不用|禁止|避免|莫)\s*[^，。！？,.!?]{0,6}渲染/i.test(prompt)
    || /(?:not|don't|do not|never|without)\s+[^,.!?]{0,20}\brender(?:ing|ed)?\b/i.test(prompt);
}

export function userExplicitlyRequestedRun(prompt: string): boolean {
  return hasAffirmativeIntent(
    prompt,
    /(?:运行|执行|\brun\b|\bexecute\b)/i,
    /(?:不|别|勿|无需|不要|不用|禁止|停止|取消|避免|莫|not|don't|do not|never|without)\s*[^，。！？,.!?]{0,6}$/i,
  );
}

export function userExplicitlyRequestedWholeFileRewrite(prompt: string): boolean {
  return /(?:完全|全部|整个|整份|从头|重新)\s*(?:重写|改写|替换|清空)/i.test(prompt)
    || /(?:重写|改写|替换|清空)\s*(?:全部|整个|整份|所有)?\s*(?:代码|文件|源码)/i.test(prompt)
    || /(?:rewrite|replace)\s+(?:all|the whole|the entire)\s+(?:code|file)|(?:rewrite|start)\s+from\s+scratch/i.test(prompt);
}

export function userExplicitlyDelegatesCreativeDecisions(prompt: string): boolean {
  return /(?:直接做|直接开始|你决定|由你决定|你来决定|自由发挥|不用问|不要问|别问|无需询问|自行决定)/i.test(prompt)
    || /\b(?:just do it|you decide|use your judgment|don't ask|do not ask|without asking)\b/i.test(prompt);
}

function availableToolDefinitions(allowRender: boolean, allowRun: boolean, allowReplace: boolean, allowClarification: boolean) {
  return toolDefinitions.filter((tool) => (
    (allowRender || tool.name !== "render_manim")
    && (allowRun || tool.name !== "run_project")
    && (allowReplace || tool.name !== "replace_code")
    && (allowClarification || tool.name !== "ask_user")
  ));
}

const toolNames = new Set<string>(toolDefinitions.map(({ name }) => name));
const mutatingTools = new Set<AiAgentToolName>(["create_scene", "rename_scene", "delete_scene", "replace_code", "edit_code", "insert_statements", "replace_function_body", "add_import", "add_voiceover", "add_synchronized_voiceover", "format_code", "undo_code", "redo_code"]);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

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

const agentRules = `你是 Visual Python 纯代码模式中的自主编程智能体。你可以读取和修改当前 Python 源码、运行项目、渲染 Manim、检查结果并继续修复，直到用户任务真正完成。

规则：
- 明确请求直接执行。颜色、字体、布局、普通转场等次要细节缺失时自行作出专业决定，不要询问。
- 只有当请求存在两个以上合理方向，且选错会明显改变内容目标或导致大范围重写时，才允许调用 ask_user。必须先调用 get_context，并在任何修改工具之前单独调用 ask_user。
- 每个原始任务最多询问一次。一次只问一个最关键的问题并提供 2 到 3 个互斥的简短选项；不要询问可以自行判断的细节，不要把多个问题塞进同一选项。
- 用户说“直接做”“你决定”“自由发挥”或正在回答上一轮澄清问题时，禁止再次询问，必须结合回答继续原任务。
- ask_user 只用于暂停并等待用户回答，不得用普通正文假装询问。宿主会把选项显示为编号列表，并自动提供“由 AI 决定”。
- 结合会话历史理解“它”“刚才的效果”“继续”等指代和延续要求，但代码、工程状态和执行结果必须以本轮 get_context 返回的实时内容为准。
- 开始时调用 get_context，先阅读完整源码和项目状态。
- get_context 只返回当前场景标签。每个场景都是包含自身 import、常量、辅助函数和 Scene 类的独立 Python 文件，不得假设其他标签中的定义可用。
- 需要了解或操作其他场景时，先调用 list_scenes，再用 get_scene 读取目标；修改前必须 switch_scene 到明确的 sceneId。不要仅凭场景名称猜测目标。
- create_scene 创建完整独立文件；rename_scene 同步更新标签与 Scene 类；delete_scene 仅在用户明确要求删除时调用。
- 修改已有函数或方法前先调用 inspect_python_structure。新增语句优先使用 insert_statements，重建一个函数使用 replace_function_body，增加导入使用 add_import；这些工具由宿主根据 AST 定位并计算缩进。
- edit_code 只用于单个表达式、参数、字符串或其他很小的原文替换。不要用 edit_code 拼接函数体、类、多行控制流或大段缩进代码。
- replace_code 只用于空编辑器，或用户明确要求完全重写全部代码时。不得为了方便而删除全部代码后重新生成。
- edit_code 的 oldText 必须逐字取自 get_context 返回的源码并包含足够上下文以保证唯一匹配，不要凭记忆编造。
- 每次 replace_code 或 edit_code 提交的候选代码都必须是完整、可编译的 Python，不能依赖下一次工具调用再补齐缩进、括号或代码块。候选被语法预检拒绝后，读取错误并更换编辑方案，不要原样重复调用。
- 同一种字符串编辑方案连续失败两次后，必须调用 inspect_python_structure，并改用 insert_statements 或 replace_function_body 重建最小作用域，不得继续猜测缩进。
- 用户提到配音、旁白、解说、语音或 TTS 时，必须先调用 get_voiceover_context。添加配音必须使用 add_voiceover 或 add_synchronized_voiceover，禁止使用 edit_code 手写或修改 visual-python-tts、Base64、self.add_sound 配音占位标记。
- self.add_voiceover 和 self.add_synchronized_voiceover 不是 Python API。如果当前代码中已有这些错误调用，先用 edit_code 删除全部错误调用，再通过专用配音工具重新插入旁白。
- add_voiceover 用于独立播放一段旁白；add_synchronized_voiceover 用于旁白开始时播放一段或多段目标动画，并在动画较短时自动等待旁白结束。anchorText 和 targetText 必须逐字复制自最新 get_context 返回的代码。
- 添加或修改配音后必须调用 check_voiceover 和 check_code。配音检查失败时继续修复，渲染配音失败时读取真实错误并继续修改。
- 每次修改后必须调用 check_code；语法失败时继续修复，不能把工具失败当作任务完成。
- 最后一次修改后还必须调用 validate_scene 并通过；资源任务同时调用 check_resources，外部包任务先调用 check_dependencies。
- 运行后使用 wait 和 get_execution_state 读取真实结果；发现错误后修改并重新验证。
- 只有用户明确要求“运行”“执行”、run 或 execute 时才允许调用 run_project。代码修改和语法检查本身不自动授权运行。
- 你可以自主决定是否调用 render_manim。需要验证视觉结果、排查渲染错误或确认 Manim 最终交付时应渲染；普通文本修改或仅靠语法检查即可确认的任务不要机械渲染。
- 渲染后必须使用 wait 和 get_execution_state 查看真实结果。失败时读取错误、修改代码、通过 check_code 后再次渲染，直到成功或确认存在外部阻塞。
- 用户明确要求不要渲染时，禁止调用 render_manim。
- 只有用户明确要求时才保存。不要擅自覆盖未保存路径。
- 面向用户的过程说明保持简短，只说明当前意图、实际修改和关键结果。
- 完成前逐项核对原始任务，不得声称完成尚未实现或验证的内容。`;

export function createAiAgentMessages(
  prompt: string,
  mode: "native" | "fallback" = "native",
  allowRender = !userExplicitlyForbidsRender(prompt),
  allowRun = userExplicitlyRequestedRun(prompt),
  history: AiConversationTurn[] = [],
  allowReplace = true,
  allowClarification = !userExplicitlyDelegatesCreativeDecisions(prompt) && history.at(-1)?.clarification !== true,
): AiChatMessage[] {
  const availableTools = availableToolDefinitions(allowRender, allowRun, allowReplace, allowClarification);
  const protocol = mode === "native"
    ? "直接使用提供的 Function Calling 工具。完成后返回一段简洁中文结果，不要把工具调用写入正文。"
    : `当前接口不支持标准 Function Calling。每轮只返回一个 JSON 对象，禁止 Markdown 和额外文字：
- 调用工具：{"message":"简短过程说明","tool":{"name":"工具名","arguments":{}}}
- 完成任务：{"message":"可选说明","final":"实际完成内容"}
可用工具：${JSON.stringify(availableTools)}`;
  const recentHistory = history
    .slice(-8)
    .map((turn) => ({ user: turn.user.slice(0, 4000), assistant: turn.assistant.slice(0, 4000) }));
  const olderHistory = history.slice(0, -8);
  const memory = olderHistory.length ? createConversationMemory(olderHistory) : "";
  return [
    { role: "system", content: `${agentRules}\n\n${protocol}` },
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

export function formatAiClarification(clarification: AiClarification): string {
  const options = clarification.options.map((option, index) => `${index + 1}. ${option}`).join("\n");
  return `${clarification.question}\n\n${options}\n\n请回复序号，也可以直接补充要求。`;
}

function toolResultMessage(name: AiAgentToolName, result: unknown): AiChatMessage {
  const serialized = JSON.stringify(result);
  return {
    role: "user",
    content: `工具 ${name} 执行结果：\n${serialized.length > 60_000 ? `${serialized.slice(0, 60_000)}\n[结果已截断]` : serialized}\n请根据结果继续完成原始任务。`,
  };
}

export function toolLabel(name: AiAgentToolName): string {
  return toolDefinitions.find((tool) => tool.name === name)?.label ?? name;
}

function activityResult(value: unknown): string {
  const text = JSON.stringify(value, null, 2);
  return text.length > 5000 ? `${text.slice(0, 5000)}\n...` : text;
}

export async function runAiCodeAgent({ prompt, history = [], host, onActivity, signal }: RunAiCodeAgentArgs): Promise<AiAgentResult> {
  const allowRender = !userExplicitlyForbidsRender(prompt);
  const allowRun = userExplicitlyRequestedRun(prompt);
  const currentCode = host.getSnapshot().code;
  const allowReplace = typeof currentCode !== "string" || !currentCode.trim() || userExplicitlyRequestedWholeFileRewrite(prompt);
  const allowClarification = !userExplicitlyDelegatesCreativeDecisions(prompt) && history.at(-1)?.clarification !== true;
  const functionTools = aiAgentFunctionTools.filter((tool) => (
    (allowRender || tool.function.name !== "render_manim")
    && (allowRun || tool.function.name !== "run_project")
    && (allowReplace || tool.function.name !== "replace_code")
    && (allowClarification || tool.function.name !== "ask_user")
  ));
  let nativeFunctionCalling = true;
  let messages = createAiAgentMessages(prompt, "native", allowRender, allowRun, history, allowReplace, allowClarification);
  let toolCallCount = 0;
  let malformedCount = 0;
  let noToolCount = 0;
  let revision = 0;
  let checkedRevision = 0;
  let validatedRevision = 0;
  let renderedRevision = -1;
  let inspectedRenderRevision = -1;
  let voiceoverContextRead = false;
  let contextRead = false;
  const repeatedCalls = new Map<string, number>();

  const executeCall = async (call: AiAgentToolCall, round: number) => {
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
    const id = `tool-${round}-${toolCallCount}`;
    const detail = typeof call.arguments.summary === "string" ? call.arguments.summary : undefined;
    onActivity({ id, kind: "tool", status: "running", title: toolLabel(call.name), detail, toolName: call.name });
    let result: Record<string, unknown>;
    if ((call.name === "add_voiceover" || call.name === "add_synchronized_voiceover") && !voiceoverContextRead) {
      result = { ok: false, error: "添加配音前必须先调用 get_voiceover_context，读取当前 TTS 配置和可用角色。" };
    } else if (call.name === "replace_code" && !allowReplace) {
      result = { ok: false, error: "当前编辑器已有代码，请使用 edit_code 定点修改必要片段，不要删除全部代码后重写。" };
    } else if (call.name === "render_manim" && !allowRender) {
      result = { ok: false, error: "用户明确要求不要渲染，本次任务只允许修改并检查代码。" };
    } else if (call.name === "run_project" && !allowRun) {
      result = { ok: false, error: "用户没有明确要求运行或执行，本次任务只允许修改并检查代码。" };
    } else if (call.name === "render_manim" && renderedRevision === revision) {
      result = { ok: false, error: "当前代码版本已经启动过渲染，请读取现有渲染结果，不要重复启动。" };
    } else if (repetition > 2) {
      result = { ok: false, error: "相同状态下已经重复调用该工具，请根据现有结果更换方案。" };
    } else {
      try {
        result = { ok: true, ...await host.executeTool(call.name, call.arguments, signal) };
      } catch (error) {
        if (signal.aborted) throw error;
        result = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
    if (result.ok === true && mutatingTools.has(call.name)) {
      revision += 1;
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
    if (call.name === "get_context" && result.ok === true) contextRead = true;
    if (call.name === "render_manim" && result.ok === true && result.started === true) renderedRevision = revision;
    if (call.name === "inspect_rendered_video" && result.ok === true && result.valid === true) inspectedRenderRevision = revision;
    const failed = result.ok !== true;
    const invalid = (call.name === "check_code" || call.name === "check_voiceover" || call.name === "validate_scene" || call.name === "check_resources" || call.name === "check_dependencies" || call.name === "inspect_rendered_video") && result.valid === false;
    const changePreview = typeof result.diff === "string" ? result.diff : "";
    const showExecutionResult = ["run_project", "render_manim", "get_execution_state"].includes(call.name);
    const executionDetail = call.name === "get_execution_state"
      ? result.running === true || result.rendering === true ? "进行中" : Array.isArray(result.problems) && result.problems.length ? "发现问题" : "完成"
      : undefined;
    onActivity({
      id,
      kind: "tool",
      status: failed || invalid ? "error" : "done",
      title: toolLabel(call.name),
      detail: failed ? String(result.error || "执行失败") : invalid ? call.name === "check_voiceover" ? "发现配音问题" : "发现语法问题" : executionDetail || detail,
      result: changePreview || failed || invalid || showExecutionResult ? changePreview || activityResult(result) : undefined,
      toolName: call.name,
      codeChange,
    });
    return result;
  };

  for (let round = 1; round <= 80; round += 1) {
    if (signal.aborted) throw new Error("已停止生成");
    if (messages.length > 60) {
      messages = createAiAgentMessages(prompt, nativeFunctionCalling ? "native" : "fallback", allowRender, allowRun, history, allowReplace, allowClarification);
      messages.push({ role: "user", content: `此前上下文已压缩。当前状态：${JSON.stringify({ ...host.getSnapshot(), revision, checkedRevision })}` });
    }
    const messageId = `message-${round}`;
    let streamed = "";
    let streamedMessage = "";
    let streamedCode = "";
    const streamedToolCalls = new Map<number, { name: string; arguments: string }>();
    let completion: Awaited<ReturnType<typeof streamAiChat>>;
    try {
      completion = await streamAiChat(messages, (delta) => {
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
        ...(nativeFunctionCalling ? { tools: functionTools } : {}),
        onToolCallDelta: ({ index, name, delta }) => {
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
    } catch (error) {
      host.cancelCodePreview();
      if (!nativeFunctionCalling || !isFunctionCallingUnsupportedError(error)) throw error;
      nativeFunctionCalling = false;
      messages = createAiAgentMessages(prompt, "fallback", allowRender, allowRun, history, allowReplace, allowClarification);
      onActivity({ id: "compatibility-mode", kind: "message", status: "done", title: "已切换兼容工具模式。" });
      continue;
    }

    if (nativeFunctionCalling) {
      const visible = extractVisibleAgentContent(completion.content);
      if (visible) onActivity({ id: messageId, kind: "message", status: "done", title: visible });
      if (!completion.toolCalls.length && hasDsmlToolMarkup(completion.content)) {
        host.cancelCodePreview();
        nativeFunctionCalling = false;
        messages = createAiAgentMessages(prompt, "fallback", allowRender, allowRun, history, allowReplace, allowClarification);
        onActivity({ id: "compatibility-mode", kind: "message", status: "done", title: "已切换兼容工具模式。" });
        continue;
      }
      if (!completion.toolCalls.length) {
        host.cancelCodePreview();
        if (!toolCallCount && ++noToolCount < 2) {
          messages.push({ role: "assistant", content: visible });
          messages.push({ role: "user", content: "请先调用 get_context，并实际完成任务。" });
          continue;
        }
        if (revision !== checkedRevision) {
          messages.push({ role: "assistant", content: visible });
          messages.push({ role: "user", content: "最后一次代码修改后必须调用 check_code 并通过检查。" });
          continue;
        }
        if (revision !== validatedRevision) {
          messages.push({ role: "assistant", content: visible });
          messages.push({ role: "user", content: "最后一次修改后必须调用 validate_scene 并通过完整性检查。" });
          continue;
        }
        if (renderedRevision === revision && inspectedRenderRevision !== revision) {
          messages.push({ role: "assistant", content: visible });
          messages.push({ role: "user", content: "本版本已经渲染，必须调用 inspect_rendered_video 检查最终视频；疑似空白时需要修复并重新渲染。" });
          continue;
        }
        return { summary: visible || "任务已完成", toolCallCount, lineCount: host.getLineCount() };
      }
      messages.push({ role: "assistant", content: visible, toolCalls: completion.toolCalls });
      for (const nativeCall of completion.toolCalls) {
        let result: Record<string, unknown>;
        try {
          const call = parseNativeToolCall(nativeCall);
          if (call.name !== "replace_code") host.cancelCodePreview();
          result = await executeCall(call, round);
          const clarification = result.__clarification;
          if (isRecord(clarification) && typeof clarification.question === "string" && Array.isArray(clarification.options)) {
            const normalized = clarification as unknown as AiClarification;
            return { summary: formatAiClarification(normalized), toolCallCount, lineCount: host.getLineCount(), clarification: normalized };
          }
        } catch (error) {
          host.cancelCodePreview();
          result = { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
        messages.push({ role: "tool", toolCallId: nativeCall.id, content: JSON.stringify(result) });
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
      if (!toolCallCount) {
        messages.push({ role: "user", content: "请先调用 get_context，并实际完成任务。" });
        continue;
      }
      if (revision !== checkedRevision) {
        messages.push({ role: "user", content: "最后一次代码修改后必须调用 check_code 并通过检查。" });
        continue;
      }
      if (revision !== validatedRevision) {
        messages.push({ role: "user", content: "最后一次修改后必须调用 validate_scene 并通过完整性检查。" });
        continue;
      }
      if (renderedRevision === revision && inspectedRenderRevision !== revision) {
        messages.push({ role: "user", content: "本版本已经渲染，必须调用 inspect_rendered_video 检查最终视频；疑似空白时需要修复并重新渲染。" });
        continue;
      }
      return { summary: decision.final, toolCallCount, lineCount: host.getLineCount() };
    }
    const call = decision.tool!;
    if (call.name !== "replace_code") host.cancelCodePreview();
    const result = await executeCall(call, round);
    const clarification = result.__clarification;
    if (isRecord(clarification) && typeof clarification.question === "string" && Array.isArray(clarification.options)) {
      const normalized = clarification as unknown as AiClarification;
      return { summary: formatAiClarification(normalized), toolCallCount, lineCount: host.getLineCount(), clarification: normalized };
    }
    messages.push(toolResultMessage(call.name, result));
  }
  throw new Error("智能体长时间没有收敛，已停止任务");
}
