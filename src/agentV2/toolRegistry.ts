import type { AiChatToolDefinition } from "../aiConfig";

const objectSchema = (properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

const text = { type: "string" };
const summary = { type: "string", description: "用一句话说明这次操作的目的。" };

function tool(name: string, description: string, parameters: Record<string, unknown> = {}): AiChatToolDefinition {
  return { type: "function", function: { name, description, parameters } };
}

export const visualPythonTools: AiChatToolDefinition[] = [
  tool("ask_user", "当任务存在会显著影响结果的歧义时向用户提问。普通视觉细节和实现细节由 Agent 自行判断。", objectSchema({ question: { type: "string", minLength: 1, maxLength: 500 }, options: { type: "array", minItems: 2, maxItems: 4, items: text } }, ["question", "options"])),
  tool("get_context", "读取当前工程、场景、代码、运行状态和环境摘要。修改前或状态不确定时使用。", objectSchema({ includeResources: { type: "boolean" } })),
  tool("list_scenes", "列出工程中的独立场景文件及当前场景。", objectSchema()),
  tool("get_scene", "读取指定场景的完整独立 Python 源码。", objectSchema({ sceneId: text }, ["sceneId"])),
  tool("switch_scene", "切换当前编辑场景。", objectSchema({ sceneId: text }, ["sceneId"])),
  tool("create_scene", "创建并切换到一个完整、可独立运行的场景文件。", objectSchema({ name: text }, [])),
  tool("rename_scene", "重命名场景文件及其首个 Manim 场景类。", objectSchema({ sceneId: text, name: text }, ["sceneId", "name"])),
  tool("delete_scene", "删除指定场景。只有用户明确要求删除时使用。", objectSchema({ sceneId: text }, ["sceneId"])),
  tool("validate_scene", "检查场景语法、导入、Scene 类、construct 方法和工程资源引用。", objectSchema()),
  tool("list_resources", "查询工程资源并返回可用于独立 Python 文件的路径。", objectSchema({ query: text, type: { type: "string", enum: ["audio", "image", "font", "other"] } })),
  tool("get_resource", "读取单个工程资源的详细信息和可用路径。", objectSchema({ resourceId: text }, ["resourceId"])),
  tool("check_resources", "检查当前场景引用的工程资源是否存在。", objectSchema()),
  tool("check_dependencies", "检查 Python 环境中是否存在指定依赖。工具执行成功后返回 checked=true；allInstalled=false 只表示 missing 中列出的包缺失，不表示检查工具失败。", objectSchema({ packages: { type: "array", items: text, minItems: 1 } }, ["packages"])),
  tool("install_dependencies", "仅安装 check_dependencies 返回的 missing 包；如果 missing 为空则不要调用本工具。安装前必须请求用户确认，安装后会再次检查结果。", objectSchema({ packages: { type: "array", items: text, minItems: 1 } }, ["packages"])),
  tool("inspect_python_structure", "用 AST 读取当前代码的类、函数和行范围。", objectSchema()),
  tool("replace_code", "用完整代码替换当前文件。仅在空文件或用户明确要求整体重写时使用。", objectSchema({ summary, code: text }, ["code"])),
  tool("edit_code", "按原文片段定点替换代码，一次提交为一个可撤销修改。", objectSchema({ summary, edits: { type: "array", minItems: 1, items: objectSchema({ oldText: text, newText: text, replaceAll: { type: "boolean" } }, ["oldText", "newText"]) } }, ["edits"])),
  tool("insert_statements", "在指定函数或方法的开头、结尾插入语句。", objectSchema({ summary, className: text, functionName: text, position: { type: "string", enum: ["start", "end"] }, statements: { type: "array", items: text, minItems: 1 } }, ["functionName", "position", "statements"])),
  tool("replace_function_body", "只替换指定函数或方法体，保留文件其他内容。", objectSchema({ summary, className: text, functionName: text, body: text }, ["functionName", "body"])),
  tool("add_import", "在导入区增加 import，并避免重复。", objectSchema({ summary, module: text, names: { type: "array", items: text } }, ["module"])),
  tool("get_voiceover_context", "读取当前配音配置、角色和可用音色。", objectSchema()),
  tool("add_voiceover", "在指定代码锚点前后插入独立配音。", objectSchema({ summary, anchorText: text, text: { type: "string", minLength: 1 }, roleId: text, placement: { type: "string", enum: ["before", "after"] } }, ["anchorText", "text"])),
  tool("add_synchronized_voiceover", "为指定动画代码添加与动画同步的配音。", objectSchema({ summary, targetText: text, text: { type: "string", minLength: 1 }, roleId: text }, ["targetText", "text"])),
  tool("check_voiceover", "检查配音标记、角色、文本和同步时间轴。", objectSchema()),
  tool("check_code", "检查当前 Python 代码并返回真实诊断。每次代码修改后使用。", objectSchema()),
  tool("format_code", "格式化当前 Python 代码。", objectSchema()),
  tool("run_project", "运行当前 Python 工程并等待真实结果。用户明确要求运行时直接调用；是否允许由宿主的唯一执行确认处理，不要先用 ask_user 询问是否运行。", objectSchema()),
  tool("render_manim", "渲染当前 Manim 场景为视频或图片。用户明确要求渲染时直接调用；是否允许由宿主的唯一执行确认处理，不要先用 ask_user 询问是否渲染。只有场景或输出类型确实存在歧义时才询问。", objectSchema({ outputType: { type: "string", enum: ["video", "image"] }, transparentBackground: { type: "boolean" }, imageWidth: { type: "integer", minimum: 64, maximum: 8192 }, imageHeight: { type: "integer", minimum: 64, maximum: 8192 }, imageCaptureMode: { type: "string", enum: ["final", "animation"] }, imageAnimationStep: { type: "integer", minimum: 1, maximum: 10000 } })),
  tool("inspect_rendered_output", "检查最近一次渲染是否产生有效视频或图片。", objectSchema()),
  tool("save_project", "仅当用户明确要求保存工程、保存项目或持久化当前修改时使用。用户只要求修改、运行或渲染时不要调用。", objectSchema()),
  tool("stop_execution", "停止正在运行或渲染的任务。", objectSchema()),
];

const labels: Record<string, string> = {
  ask_user: "询问用户",
  get_context: "读取当前工程",
  list_scenes: "查看场景列表",
  get_scene: "读取场景代码",
  switch_scene: "切换场景",
  create_scene: "创建场景",
  rename_scene: "重命名场景",
  delete_scene: "删除场景",
  validate_scene: "验证场景结构",
  list_resources: "查询工程资源",
  get_resource: "读取工程资源",
  check_resources: "检查资源引用",
  check_dependencies: "检查 Python 依赖",
  install_dependencies: "安装 Python 依赖",
  inspect_python_structure: "分析 Python 结构",
  replace_code: "整体替换代码",
  edit_code: "定点修改代码",
  insert_statements: "插入代码语句",
  replace_function_body: "修改函数内容",
  add_import: "添加代码导入",
  get_voiceover_context: "读取配音配置",
  add_voiceover: "添加配音",
  add_synchronized_voiceover: "添加同步配音",
  check_voiceover: "检查配音配置",
  check_code: "检查 Python 代码",
  format_code: "格式化代码",
  run_project: "运行 Python 工程",
  render_manim: "渲染 Manim",
  inspect_rendered_output: "检查渲染结果",
  save_project: "保存工程",
  stop_execution: "停止后台任务",
};

const readOnlyTools = new Set([
  "get_context", "list_scenes", "get_scene", "list_resources", "get_resource", "check_resources",
  "check_dependencies", "inspect_python_structure", "get_voiceover_context", "check_voiceover", "check_code",
  "validate_scene", "inspect_rendered_output",
]);

const stateChangingTools = new Set([
  "switch_scene", "create_scene", "rename_scene", "delete_scene", "install_dependencies",
  "replace_code", "edit_code", "insert_statements", "replace_function_body", "add_import",
  "add_voiceover", "add_synchronized_voiceover", "format_code", "undo_code", "redo_code",
  "run_project", "render_manim", "save_project", "stop_execution",
]);

export function toolsForAgentMode(mode: "agent" | "plan"): AiChatToolDefinition[] {
  return mode === "plan" ? visualPythonTools.filter((item) => readOnlyTools.has(item.function.name)) : visualPythonTools;
}

export function isCacheableTool(name: string): boolean {
  return readOnlyTools.has(name);
}

export function changesAgentState(name: string): boolean {
  return stateChangingTools.has(name);
}

export function toolLabel(name: string): string {
  return labels[name] || name;
}

export function isLongRunningTool(name: string): boolean {
  return name === "run_project" || name === "render_manim";
}

export function requiresPermission(name: string): boolean {
  return name === "delete_scene" || name === "install_dependencies" || name === "run_project" || name === "render_manim" || name === "save_project";
}
