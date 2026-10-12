import type { AiChatToolDefinition } from "../aiConfig";
import type { AgentTool } from "./types";
import { pluginAuthoringTools } from "./pluginAuthoring";

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
  tool("get_context", "读取当前工程、文档、工作区、运行状态和环境摘要。修改前或状态不确定时使用。", objectSchema({ includeResources: { type: "boolean" } })),
  tool("get_diagnostics", "按需读取当前输出和问题面板中的最新诊断。插件安装、加载、运行或渲染失败后，在再次修改前使用。", objectSchema({ includeOutput: { type: "boolean" }, includeProblems: { type: "boolean" }, limit: { type: "integer", minimum: 1, maximum: 200 } })),
  tool("list_documents", "列出工程中的代码文档及当前文档。普通 Python 和插件文档都使用此工具。", objectSchema()),
  tool("get_document", "读取指定代码文档的完整源码。", objectSchema({ documentId: text }, ["documentId"])),
  tool("switch_document", "切换当前编辑的代码文档。", objectSchema({ documentId: text }, ["documentId"])),
  tool("create_document", "创建一个空白、独立的普通 Python 代码文档。插件专用文档应使用对应插件提供的创建工具。", objectSchema({ name: text }, [])),
  tool("rename_document", "重命名代码文档，不自动修改其源码。", objectSchema({ documentId: text, name: text }, ["documentId", "name"])),
  tool("delete_document", "删除指定代码文档。只有用户明确要求删除时使用。", objectSchema({ documentId: text }, ["documentId"])),
  tool("list_resources", "查询工程资源并返回可用于独立 Python 文件的路径。", objectSchema({ query: text, type: { type: "string", enum: ["audio", "image", "font", "other"] } })),
  tool("get_resource", "读取单个工程资源的详细信息和可用路径。", objectSchema({ resourceId: text }, ["resourceId"])),
  tool("check_resources", "检查当前文档或工作区引用的工程资源是否存在。", objectSchema()),
  tool("check_dependencies", "检查 Python 环境中是否存在指定依赖。工具执行成功后返回 checked=true；allInstalled=false 只表示 missing 中列出的包缺失，不表示检查工具失败。", objectSchema({ packages: { type: "array", items: text, minItems: 1 } }, ["packages"])),
  tool("install_dependencies", "仅安装 check_dependencies 返回的 missing 包；如果 missing 为空则不要调用本工具。安装前必须请求用户确认，安装后会再次检查结果。", objectSchema({ packages: { type: "array", items: text, minItems: 1 } }, ["packages"])),
  tool("inspect_python_structure", "用 AST 读取当前代码的类、函数和行范围。", objectSchema()),
  tool("replace_code", "用完整代码替换当前文件。仅在空文件或用户明确要求整体重写时使用。", objectSchema({ summary, code: text }, ["code"])),
  tool("edit_code", "按原文片段定点替换代码，一次提交为一个可撤销修改。", objectSchema({ summary, edits: { type: "array", minItems: 1, items: objectSchema({ oldText: text, newText: text, replaceAll: { type: "boolean" } }, ["oldText", "newText"]) } }, ["edits"])),
  tool("insert_statements", "在指定函数或方法的开头、结尾插入语句。", objectSchema({ summary, className: text, functionName: text, position: { type: "string", enum: ["start", "end"] }, statements: { type: "array", items: text, minItems: 1 } }, ["functionName", "position", "statements"])),
  tool("replace_function_body", "只替换指定函数或方法体，保留文件其他内容。", objectSchema({ summary, className: text, functionName: text, body: text }, ["functionName", "body"])),
  tool("add_import", "在导入区增加 import，并避免重复。", objectSchema({ summary, module: text, names: { type: "array", items: text } }, ["module"])),
  tool("check_code", "检查当前 Python 代码并返回真实诊断。每次代码修改后使用。", objectSchema()),
  tool("format_code", "格式化当前 Python 代码。", objectSchema()),
  tool("run_project", "运行当前 Python 工程并等待真实结果。用户明确要求运行时直接调用；是否允许由宿主的唯一执行确认处理，不要先用 ask_user 询问是否运行。", objectSchema()),
  tool("save_project", "仅当用户明确要求保存工程、保存项目或持久化当前修改时使用。用户只要求修改、运行或渲染时不要调用。", objectSchema()),
  tool("stop_execution", "停止正在运行或渲染的任务。", objectSchema()),
];

const labels: Record<string, string> = {
  ask_user: "询问用户",
  get_context: "读取当前工程",
  get_diagnostics: "读取输出与问题",
  list_documents: "查看代码文档",
  get_document: "读取代码文档",
  switch_document: "切换代码文档",
  create_document: "创建代码文档",
  rename_document: "重命名代码文档",
  delete_document: "删除代码文档",
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
  check_code: "检查 Python 代码",
  format_code: "格式化代码",
  run_project: "运行 Python 工程",
  save_project: "保存工程",
  stop_execution: "停止后台任务",
};

const readOnlyTools = new Set([
  "get_context", "get_diagnostics", "list_documents", "get_document", "list_resources", "get_resource", "check_resources",
  "check_dependencies", "inspect_python_structure", "check_code", "inspect_plugin_api", "list_installed_plugins", "read_plugin_draft_file", "validate_plugin_draft", "run_plugin_draft_checks",
]);

const stateChangingTools = new Set([
  "switch_document", "create_document", "rename_document", "delete_document", "install_dependencies",
  "replace_code", "edit_code", "insert_statements", "replace_function_body", "add_import",
  "format_code", "undo_code", "redo_code",
  "run_project", "save_project", "stop_execution", "import_installed_plugin_draft", "create_plugin_plan", "create_plugin_draft", "update_plugin_draft", "edit_plugin_draft_file", "install_plugin_draft",
]);

const codeOnlyTools = new Set([
  "list_documents", "get_document", "switch_document", "create_document", "rename_document", "delete_document",
  "inspect_python_structure", "replace_code", "edit_code", "insert_statements", "replace_function_body", "add_import",
  "check_code", "format_code",
]);

const mutationTools = new Set([
  "replace_code", "edit_code", "insert_statements", "replace_function_body", "add_import",
  "format_code", "undo_code", "redo_code",
]);

export const coreAgentTools: AgentTool[] = [...visualPythonTools.map((definition) => {
  const name = definition.function.name;
  return {
    definition,
    label: labels[name] || name,
    ...(codeOnlyTools.has(name) ? { workspaceModes: ["code" as const] } : {}),
    readOnly: readOnlyTools.has(name),
    changesState: stateChangingTools.has(name),
    requiresPermission: requiresPermission(name),
    longRunning: isLongRunningTool(name),
    mutation: mutationTools.has(name),
    ...(mutationTools.has(name) ? { verificationTool: "check_code" } : {}),
  };
}), ...pluginAuthoringTools];

export function toolsForAgentMode(mode: "agent" | "plan"): AiChatToolDefinition[] {
  return (mode === "plan" ? coreAgentTools.filter((item) => item.readOnly) : coreAgentTools).map((item) => item.definition);
}

export function isCacheableTool(name: string): boolean {
  return readOnlyTools.has(name);
}

export function changesAgentState(name: string): boolean {
  return stateChangingTools.has(name);
}

export function toolLabel(name: string): string {
  return labels[name] || coreAgentTools.find((tool) => tool.definition.function.name === name)?.label || name;
}

export function isLongRunningTool(name: string): boolean {
  return name === "run_project" || name === "run_plugin_draft_checks";
}

export function requiresPermission(name: string): boolean {
  return name === "delete_document" || name === "install_dependencies" || name === "run_project" || name === "save_project" || name === "install_plugin_draft";
}
