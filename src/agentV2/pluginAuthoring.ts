import type { PluginManifest } from "../plugins/api/types";
import type { AiChatToolDefinition } from "../aiConfig";
import type { AgentTool } from "./types";

const MAX_FILES = 24;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
let draftSequence = 0;
let planSequence = 0;

export type PluginDraftFiles = Record<string, string>;

export type PluginDraftPhase = "planned" | "drafted" | "implementing" | "needs_fix" | "validated" | "ready" | "installed";

export type PluginPlanBlock = {
  type: string;
  purpose: string;
  inputs: string[];
  output?: string;
  statementInput?: string;
};

export type PluginPlan = {
  id: string;
  pluginId: string;
  name: string;
  goal: string;
  kind: "standalone" | "extension";
  files: Array<{ path: string; purpose: string }>;
  blocks: PluginPlanBlock[];
  dependencies: string[];
  validationChecks: string[];
};

export type CreatePluginPlanInput = {
  id: string;
  name: string;
  description: string;
  kind?: "standalone" | "extension";
  files?: Array<{ path: string; purpose: string }>;
  blocks?: PluginPlanBlock[];
  dependencies?: string[];
};

export type PluginRuntimeValidation = {
  valid: boolean;
  checks: string[];
  issues?: string[];
  diagnostics?: PluginRuntimeDiagnostic[];
};

export type PluginRuntimeDiagnostic = {
  phase: "entry_import" | "activation" | "toolbox" | "block_samples" | "python_syntax";
  file?: string;
  line?: number;
  message: string;
  suggestion?: string;
};

export type PluginDraft = {
  id: string;
  files: PluginDraftFiles;
  phase: PluginDraftPhase;
  plan: PluginPlan;
  validation?: PluginDraftValidation;
  runtimeValidation?: PluginRuntimeValidation;
  createdAt: number;
  updatedAt: number;
};

export type PluginDraftValidation = {
  valid: boolean;
  issues: string[];
  manifest?: PluginManifest;
  codegen?: PluginCodegenContract;
};

export type PluginCodegenContract = {
  version: 1;
  mode: "standalone" | "extension";
  provider?: string;
  runtimeNames: string[];
};

export type PluginDraftValidationContext = {
  availableCapabilities?: Array<{
    id: string;
    entryBlock?: string;
    statementInput?: string;
    runtimeNames?: string[];
  }>;
};

export type CreatePluginDraftInput = {
  id: string;
  name: string;
  description: string;
  version?: string;
  files?: PluginDraftFiles;
  planId?: string;
};

export type PluginDraftStore = {
  createPlan(input: CreatePluginPlanInput): { id: string; plan: PluginPlan };
  getPlan(id: string): PluginPlan | undefined;
  create(input: CreatePluginDraftInput): PluginDraft;
  createFromFiles(files: PluginDraftFiles): PluginDraft;
  get(id: string): PluginDraft | undefined;
  update(id: string, files: PluginDraftFiles): PluginDraft;
  editFile(id: string, path: string, oldText: string, newText: string, replaceAll?: boolean): PluginDraft;
  markValidation(id: string, validation: PluginDraftValidation): PluginDraft;
  markRuntimeValidation(id: string, result: PluginRuntimeValidation): PluginDraft;
  markInstalled(id: string): PluginDraft;
};

const objectSchema = (properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

const text = { type: "string" };
const textMap = { type: "object", additionalProperties: { type: "string" } };
const tool = (name: string, description: string, parameters: Record<string, unknown>): AiChatToolDefinition => ({
  type: "function",
  function: { name, description, parameters },
});

const pluginPrefix = (id: string) => `${id.replace(/[^A-Za-z0-9_]/g, "_")}_`;

const draftId = () => `draft-${Date.now().toString(36)}-${(draftSequence += 1).toString(36)}`;
const planId = () => `plan-${Date.now().toString(36)}-${(planSequence += 1).toString(36)}`;

const defaultValidationChecks = ["manifest", "entry_activation", "toolbox_references", "block_samples", "python_syntax"];

export const pluginAuthoringContract = {
  apiVersion: "1",
  requiredFiles: ["plugin.json", "codegen.json", "index.js"],
  entry: "index.js or another relative .js/.mjs file exporting activate(context)",
  registration: ["context.registerBlock", "context.registerToolboxCategory", "context.registerSetting", "context.registerCommand", "context.registerAgentTool"],
  stages: ["inspect_plugin_api", "create_plugin_plan", "create_plugin_draft", "read_plugin_draft_file", "edit_plugin_draft_file", "update_plugin_draft", "validate_plugin_draft", "run_plugin_draft_checks", "install_plugin_draft"],
  rules: ["block and category ids must use the plugin id namespace", "generated Python must use four spaces and no tabs", "installation is allowed only after static and runtime validation"],
};

const normalizePlan = (input: CreatePluginPlanInput, id = planId()): PluginPlan => ({
  id,
  pluginId: input.id,
  name: input.name,
  goal: input.description,
  kind: input.kind || "standalone",
  files: input.files?.length ? input.files : [
    { path: "plugin.json", purpose: "插件清单和依赖声明" },
    { path: "codegen.json", purpose: "代码生成契约" },
    { path: "index.js", purpose: "插件入口、积木和工具箱" },
    { path: "README.md", purpose: "使用说明" },
  ],
  blocks: input.blocks || [],
  dependencies: [...new Set(input.dependencies || [])],
  validationChecks: defaultValidationChecks,
});

const scaffoldFiles = (input: CreatePluginDraftInput, plan: PluginPlan): PluginDraftFiles => {
  const version = input.version?.trim() || "1.0.0";
  const prefix = pluginPrefix(input.id);
  const blocks = (plan.blocks.length ? plan.blocks : [{ type: `${prefix}print`, purpose: "Output text", inputs: ["TEXT"] }]).map((block, index) => ({
    ...block,
    type: block.type.trim() || `${prefix}block_${index + 1}`,
    inputs: [...new Set(block.inputs.map((name) => name.trim()).filter(Boolean))],
  }));
  const definitions = blocks.map((block) => {
    const args = [
      ...block.inputs.map((name) => ({ type: "input_value", name })),
      ...(block.statementInput?.trim() ? [{ type: "input_statement", name: block.statementInput.trim() }] : []),
    ];
    const message = [block.purpose.trim() || block.type, ...args.map(() => "%1")].join(" ");
    const definition = {
      type: block.type,
      message0: message,
      ...(args.length ? { args0: args } : {}),
      ...(block.output ? { output: block.output } : { previousStatement: null, nextStatement: null }),
      colour: "#397ca5",
    };
    const functionName = block.type.replace(/[^A-Za-z0-9_]/g, "_");
    const values = block.inputs.map((name) => `generator.valueToCode(block, ${JSON.stringify(name)}, 0) || "None"`);
    const generator = block.output
      ? `return [${JSON.stringify(functionName)} + "(" + [${values.join(", ")}].join(", ") + ")", 0];`
      : block.statementInput?.trim()
        ? `const body = generator.statementToCode(block, ${JSON.stringify(block.statementInput.trim())}) || "";\n        return body || "pass\\n";`
        : `return ${JSON.stringify(`# ${functionName}\\n`)};`;
    const definitionSource = JSON.stringify(definition, null, 2).replace(/"([A-Za-z_$][A-Za-z0-9_$]*)":/g, "$1:");
    return `    { definition: ${definitionSource}, generator(block, generator) { ${generator} } }`;
  }).join(",\n");
  const toolbox = blocks.map((block, index) => `{ kind: "block", type: ${index === 0 ? "BLOCK_TYPE" : JSON.stringify(block.type)} }`).join(", ");
  const codegenBlocks = Object.fromEntries(blocks.map((block) => [block.type, {
    purpose: block.purpose,
    inputs: block.inputs,
    ...(block.output ? { output: block.output } : {}),
    ...(block.statementInput ? { statementInput: block.statementInput } : {}),
  }]));
  return {
    "plugin.json": JSON.stringify({ id: input.id, name: input.name, version, apiVersion: "1", description: input.description, entry: "index.js", agent: { description: input.description, detect: "project" } }, null, 2) + "\n",
    "codegen.json": JSON.stringify({ version: 1, mode: plan.kind, blocks: codegenBlocks }, null, 2) + "\n",
    "index.js": `const BLOCK_TYPE = ${JSON.stringify(blocks[0].type)};\nconst BLOCKS = [\n${definitions}\n];\n\nexport default {\n  activate(context) {\n    for (const item of BLOCKS) context.registerBlock(item.definition, item.generator);\n    context.registerToolboxCategory({ id: ${JSON.stringify(`${input.id}.toolbox`)}, name: ${JSON.stringify(input.name)}, colour: "#397ca5", contents: [${toolbox}] });\n  },\n};\n`,
    "README.md": `# ${input.name}\n\n${input.description}\n`,
    ...(input.files || {}),
  };
};
export function createPluginDraftStore(): PluginDraftStore {
  const drafts = new Map<string, PluginDraft>();
  const plans = new Map<string, PluginPlan>();
  return {
    createPlan(input) {
      const id = planId();
      const plan = normalizePlan(input, id);
      plans.set(id, plan);
      return { id, plan };
    },
    getPlan(id) {
      return plans.get(id);
    },
    create(input) {
      const now = Date.now();
      const plan = input.planId ? plans.get(input.planId) : undefined;
      const draftPlan = plan || normalizePlan({ id: input.id, name: input.name, description: input.description });
      plans.set(draftPlan.id, draftPlan);
      const draft: PluginDraft = { id: draftId(), files: scaffoldFiles(input, draftPlan), phase: "drafted", plan: draftPlan, createdAt: now, updatedAt: now };
      drafts.set(draft.id, draft);
      return draft;
    },
    createFromFiles(files) {
      const now = Date.now();
      const manifest = typeof files["plugin.json"] === "string" ? (() => { try { return JSON.parse(files["plugin.json"]) as Record<string, unknown>; } catch { return undefined; } })() : undefined;
      const plan = normalizePlan({ id: typeof manifest?.id === "string" ? manifest.id : "com.example.plugin", name: typeof manifest?.name === "string" ? manifest.name : "Plugin", description: typeof manifest?.description === "string" ? manifest.description : "Imported plugin" });
      plans.set(plan.id, plan);
      const draft: PluginDraft = { id: draftId(), files: { ...files }, phase: "drafted", plan, createdAt: now, updatedAt: now };
      drafts.set(draft.id, draft);
      return draft;
    },
    get(id) {
      return drafts.get(id);
    },
    update(id, files) {
      const current = drafts.get(id);
      if (!current) throw new Error(`插件草稿不存在：${id}`);
      const updated = { ...current, files: { ...current.files, ...files }, phase: "implementing" as const, validation: undefined, runtimeValidation: undefined, updatedAt: Date.now() };
      drafts.set(id, updated);
      return updated;
    },
    editFile(id, path, oldText, newText, replaceAll = false) {
      const current = drafts.get(id);
      if (!current) throw new Error(`插件草稿不存在：${id}`);
      const content = current.files[path];
      if (typeof content !== "string") throw new Error(`插件草稿文件不存在：${path}`);
      if (!oldText) throw new Error("oldText 不能为空");
      const occurrences = content.split(oldText).length - 1;
      if (occurrences === 0) throw new Error("oldText 未找到，请重新读取当前文件");
      if (!replaceAll && occurrences !== 1) throw new Error(`oldText 匹配到 ${occurrences} 处，请提供更完整的文本或启用 replaceAll`);
      const updatedContent = replaceAll ? content.split(oldText).join(newText) : content.replace(oldText, newText);
      const updated = {
        ...current,
        files: { ...current.files, [path]: updatedContent },
        phase: "implementing" as const,
        validation: undefined,
        runtimeValidation: undefined,
        updatedAt: Date.now(),
      };
      drafts.set(id, updated);
      return updated;
    },
    markValidation(id, validation) {
      const current = drafts.get(id);
      if (!current) throw new Error(`插件草稿不存在：${id}`);
      const runtimeValidation = validation.valid ? current.runtimeValidation : undefined;
      const updated = { ...current, validation, runtimeValidation, phase: validation.valid ? (runtimeValidation?.valid ? "ready" as const : "validated" as const) : "needs_fix" as const, updatedAt: Date.now() };
      drafts.set(id, updated);
      return updated;
    },
    markRuntimeValidation(id, runtimeValidation) {
      const current = drafts.get(id);
      if (!current) throw new Error(`插件草稿不存在：${id}`);
      if (current.phase !== "validated" || current.validation?.valid !== true) {
        throw new Error("必须先通过 validate_plugin_draft 才能运行插件检查");
      }
      const updated = { ...current, runtimeValidation, phase: runtimeValidation.valid ? "ready" as const : "needs_fix" as const, updatedAt: Date.now() };
      drafts.set(id, updated);
      return updated;
    },
    markInstalled(id) {
      const current = drafts.get(id);
      if (!current) throw new Error(`插件草稿不存在：${id}`);
      if (current.phase !== "ready" || current.validation?.valid !== true || current.runtimeValidation?.valid !== true) {
        throw new Error("必须先通过 run_plugin_draft_checks 才能安装插件");
      }
      const updated = { ...current, phase: "installed" as const, updatedAt: Date.now() };
      drafts.set(id, updated);
      return updated;
    },
  };
}

const isSafeRelativePath = (value: string) => {
  const normalized = value.replace(/\\/g, "/");
  return normalized === value && normalized.length > 0 && !normalized.startsWith("/") && !normalized.split("/").some((part) => !part || part === "." || part === "..");
};

const byteLength = (value: string) => new TextEncoder().encode(value).length;

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const pluginIdPattern = /^[a-z][a-z0-9.-]*$/;
const knownJavaScriptRuntimeNames = new Set([
  "Array", "BigInt", "Boolean", "Date", "Error", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String",
  "block", "console", "context", "document", "generator", "globalThis", "window",
]);

const pluginContributionMethods = [
  "registerBlock",
  "registerToolboxCategory",
  "registerSetting",
  "registerProjectSerializer",
  "registerCodeDocumentHandler",
  "registerCommand",
  "registerAgentTool",
] as const;

function pluginActivationCalls(source: string) {
  const parameter = source.match(/\bactivate\s*\(\s*([A-Za-z_$][\w$]*)/)?.[1];
  if (!parameter) return new Set<string>();
  const escaped = parameter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new Set(pluginContributionMethods.filter((method) => new RegExp(`\\b${escaped}\\s*\\.\\s*${method}\\s*\\(`).test(source)));
}

function codegenDeclaresBlocks(text: string | undefined) {
  if (typeof text !== "string") return false;
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    return Boolean(value.blocks && typeof value.blocks === "object" && !Array.isArray(value.blocks) && Object.keys(value.blocks as Record<string, unknown>).length);
  } catch {
    return false;
  }
}

function parseCodegenContract(text: string | undefined, issues: string[]): PluginCodegenContract | undefined {
  if (typeof text !== "string") {
    issues.push("缺少 codegen.json");
    return undefined;
  }
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 JSON 对象");
    if (value.version !== 1) issues.push("codegen.json 的 version 必须为 1");
    if (value.mode !== "standalone" && value.mode !== "extension") issues.push("codegen.json 的 mode 必须为 standalone 或 extension");
    const runtimeNames = Array.isArray(value.runtimeNames)
      ? value.runtimeNames.filter((name): name is string => typeof name === "string" && identifierPattern.test(name))
      : [];
    if (Array.isArray(value.runtimeNames) && runtimeNames.length !== value.runtimeNames.length) issues.push("codegen.json 的 runtimeNames 只能包含 Python 标识符");
    const provider = typeof value.provider === "string" ? value.provider.trim() : undefined;
    if (value.mode === "extension") {
      if (!provider || !pluginIdPattern.test(provider)) issues.push("扩展模式必须声明有效的 provider 插件 ID");
      if (!runtimeNames.length) issues.push("扩展模式必须声明 runtimeNames");
    } else if (provider || runtimeNames.length) {
      issues.push("standalone 模式不能声明外部 provider 或 runtimeNames");
    }
    if (value.version !== 1 || (value.mode !== "standalone" && value.mode !== "extension")) return undefined;
    return { version: 1, mode: value.mode, ...(provider ? { provider } : {}), runtimeNames: [...new Set(runtimeNames)] };
  } catch (error) {
    issues.push(`codegen.json 不是有效 JSON：${String(error)}`);
    return undefined;
  }
}

function generatedRuntimeReceivers(source: string): string[] {
  const declared = new Set(knownJavaScriptRuntimeNames);
  const addParameters = (parameters: string) => {
    for (const parameter of parameters.split(",")) {
      const name = parameter.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)/)?.[1];
      if (name) declared.add(name);
    }
  };
  for (const match of source.matchAll(/\b(?:const|let|var|class)\s+([A-Za-z_][A-Za-z0-9_]*)/g)) declared.add(match[1]);
  for (const match of source.matchAll(/\(([^()]*)\)\s*=>/g)) addParameters(match[1]);
  for (const match of source.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*=>/g)) declared.add(match[1]);
  for (const match of source.matchAll(/\b(?:function(?:\s+[A-Za-z_][A-Za-z0-9_]*)?|[A-Za-z_][A-Za-z0-9_]*)\s*\(([^()]*)\)\s*\{/g)) addParameters(match[1]);
  for (const match of source.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=|>)/g)) declared.add(match[1]);
  for (const match of source.matchAll(/\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\b/g)) declared.add(match[1]);
  for (const match of source.matchAll(/\bimport\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?/g)) declared.add(match[2] || match[1]);
  for (const match of source.matchAll(/\bfrom\s+[A-Za-z_][A-Za-z0-9_.]*\s+import\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?/g)) declared.add(match[2] || match[1]);
  for (const match of source.matchAll(/\bdef\s+[A-Za-z_][A-Za-z0-9_]*\s*\(([^)]*)\)/g)) {
    addParameters(match[1]);
  }
  const receivers = new Set<string>();
  for (const match of source.matchAll(/(?<![\w.])([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*[A-Za-z_][A-Za-z0-9_]*\s*\(/g)) {
    if (!declared.has(match[1])) receivers.add(match[1]);
  }
  return [...receivers].sort();
}

export function validatePluginDraft(draft: Pick<PluginDraft, "files">, context: PluginDraftValidationContext = {}): PluginDraftValidation {
  const issues: string[] = [];
  const files = draft.files || {};
  const paths = Object.keys(files);
  let totalBytes = 0;

  if (!paths.length) issues.push("插件草稿不能为空");
  if (paths.length > MAX_FILES) issues.push(`插件文件不能超过 ${MAX_FILES} 个`);
  for (const path of paths) {
    if (!isSafeRelativePath(path)) issues.push(`文件路径不安全：${path}`);
    const content = files[path];
    if (typeof content !== "string") issues.push(`文件内容必须是文本：${path}`);
    else {
      const size = byteLength(content);
      totalBytes += size;
      if (size > MAX_FILE_BYTES) issues.push(`文件过大：${path}`);
    }
  }
  if (totalBytes > MAX_TOTAL_BYTES) issues.push(`插件总大小不能超过 ${MAX_TOTAL_BYTES} 字节`);

  const codegen = parseCodegenContract(files["codegen.json"], issues);

  let manifest: PluginManifest | undefined;
  const manifestText = files["plugin.json"];
  if (typeof manifestText !== "string") issues.push("缺少 plugin.json");
  else {
    try {
      const value = JSON.parse(manifestText) as Partial<PluginManifest>;
      if (!value || typeof value !== "object") throw new Error("必须是 JSON 对象");
      if (typeof value.id !== "string" || !/^[a-z][a-z0-9.-]*$/.test(value.id)) issues.push("plugin.json 的 id 无效");
      if (typeof value.name !== "string" || !value.name.trim()) issues.push("plugin.json 的 name 不能为空");
      if (typeof value.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(value.version)) issues.push("plugin.json 的 version 无效");
      if (value.apiVersion !== "1") issues.push("plugin.json 的 apiVersion 必须为 1");
      if (value.builtin === true) issues.push("外部插件不能声明 builtin: true");
      if (typeof value.entry !== "string" || !isSafeRelativePath(value.entry) || !/\.(?:js|mjs)$/.test(value.entry)) issues.push("plugin.json 的 entry 必须是安全的 .js 或 .mjs 路径");
      manifest = value as PluginManifest;
    } catch (error) {
      issues.push(`plugin.json 不是有效 JSON：${String(error)}`);
    }
  }

  if (manifest?.entry && typeof files[manifest.entry] !== "string") issues.push(`找不到插件入口文件：${manifest.entry}`);
  const entrySource = manifest?.entry ? files[manifest.entry] : undefined;
  if (typeof entrySource === "string") {
    if (!/export\s+default\s+\{/.test(entrySource)) issues.push("插件入口必须导出默认插件对象");
    if (!/\bactivate\s*\(/.test(entrySource)) issues.push("插件入口必须提供 activate(context)");
    const activationCalls = pluginActivationCalls(entrySource);
    if (!activationCalls.size) issues.push("activate(context) 没有注册任何插件能力；必须调用 context.registerBlock()、context.registerToolboxCategory() 或其它 register API");
    if (activationCalls.has("registerBlock") && !activationCalls.has("registerToolboxCategory")) {
      issues.push("入口注册了积木，但没有调用 context.registerToolboxCategory() 将积木加入工具箱");
    }
    if (codegenDeclaresBlocks(files["codegen.json"]) && !activationCalls.has("registerBlock")) {
      issues.push("codegen.json 只描述代码生成契约，不会自动注册积木；请在 activate(context) 中调用 context.registerBlock() 和 context.registerToolboxCategory()");
    }
    if (manifest?.id) {
      const prefix = pluginPrefix(manifest.id);
      for (const match of entrySource.matchAll(/registerBlock\s*\(\s*\{\s*type\s*:\s*["']([^"']+)["']/g)) {
        if (!match[1].startsWith(prefix)) issues.push(`积木类型不属于插件命名空间：${match[1]}`);
      }
    }
    if (codegen) {
      const allowedRuntimeNames = new Set(codegen.runtimeNames);
      for (const receiver of generatedRuntimeReceivers(entrySource)) {
        if (!allowedRuntimeNames.has(receiver)) issues.push(`生成代码使用了未声明的运行对象：${receiver}`);
      }
      if (codegen.mode === "extension" && codegen.provider) {
        const provider = (context.availableCapabilities || []).find((capability) => capability.id === codegen.provider);
        if (!provider) issues.push(`代码生成契约依赖的插件当前不可用：${codegen.provider}`);
        else {
          const providedRuntimeNames = new Set(provider.runtimeNames || []);
          for (const runtimeName of codegen.runtimeNames) {
            if (!providedRuntimeNames.has(runtimeName)) issues.push(`提供方 ${codegen.provider} 未声明运行对象：${runtimeName}`);
          }
        }
      }
    }
  }

  return { valid: issues.length === 0, issues, ...(manifest ? { manifest } : {}), ...(codegen ? { codegen } : {}) };
}

export const pluginAuthoringTools: AgentTool[] = [
  {
    definition: tool("inspect_plugin_api", "读取插件开发契约、入口要求、积木注册规则、工具箱规则和验证阶段。创建插件前先调用。", objectSchema()),
    label: "查看插件开发契约",
    readOnly: true,
  },
  {
    definition: tool("create_plugin_plan", "为插件建立结构化开发计划，记录文件、积木、输入、依赖和验证项目；计划不会安装插件。", objectSchema({
      id: { type: "string", description: "小写插件 ID，例如 com.example.shapes" },
      name: text,
      description: text,
      kind: { type: "string", enum: ["standalone", "extension"] },
      files: { type: "array", items: objectSchema({ path: text, purpose: text }, ["path", "purpose"]) },
      blocks: { type: "array", items: objectSchema({ type: text, purpose: text, inputs: { type: "array", items: text }, output: text, statementInput: text }, ["type", "purpose", "inputs"]) },
      dependencies: { type: "array", items: text },
    }, ["id", "name", "description"])),
    label: "规划插件",
    changesState: true,
  },
  {
    definition: tool("list_installed_plugins", "列出应用插件目录中已经安装的外部插件。修改已有插件前先用此工具取得准确的插件 ID。", objectSchema()),
    label: "查看已安装插件",
    readOnly: true,
  },
  {
    definition: tool("import_installed_plugin_draft", "按插件 ID 读取已安装外部插件的全部受控文本文件，并导入为可编辑草稿。继续修改已有插件时使用，不要重新创建同名草稿。", objectSchema({ pluginId: text }, ["pluginId"])),
    label: "导入已安装插件",
    changesState: true,
  },
  {
    definition: tool("read_plugin_draft_file", "分页读取插件草稿中的一个文本文件。先从导入或草稿摘要取得真实文件路径；文件较长时使用 nextOffset 继续读取。", objectSchema({
      draftId: text,
      path: text,
      offset: { type: "integer", minimum: 0 },
      maxChars: { type: "integer", minimum: 1, maximum: 5000 },
    }, ["draftId", "path"])),
    label: "读取插件草稿文件",
    readOnly: true,
  },
  {
    definition: tool("create_plugin_draft", "创建标准外部插件草稿，包含 plugin.json、codegen.json、ESM 入口和 README；只保存在当前会话的草稿区，不会安装。扩展已有插件前必须先读取其能力契约。", objectSchema({
      id: { type: "string", description: "小写插件 ID，例如 com.example.shapes" },
      name: text,
      description: text,
      version: text,
      files: textMap,
      planId: text,
    }, ["id", "name", "description"])),
    label: "创建插件草稿",
    changesState: true,
  },
  {
    definition: tool("update_plugin_draft", "更新插件草稿中的一个或多个文本文件，然后继续验证。运行方式变化时同步更新 codegen.json；不要修改草稿 ID。", objectSchema({ draftId: text, files: textMap }, ["draftId", "files"])),
    label: "修改插件草稿",
    changesState: true,
  },
  {
    definition: tool("edit_plugin_draft_file", "读取真实文件后按 oldText 定点修改插件草稿。默认要求 oldText 只匹配一处；只有明确需要时才使用 replaceAll。优先使用本工具，不要整文件重写。", objectSchema({ draftId: text, path: text, oldText: text, newText: text, replaceAll: { type: "boolean" } }, ["draftId", "path", "oldText", "newText"])),
    label: "定点修改插件文件",
    changesState: true,
  },
  {
    definition: tool("validate_plugin_draft", "检查插件草稿的文件路径、Manifest、入口文件、API 版本、积木命名空间及代码生成运行对象契约。", objectSchema({ draftId: text }, ["draftId"])),
    label: "验证插件草稿",
    readOnly: true,
  },
  {
    definition: tool("install_plugin_draft", "安装并启用已经验证通过的插件草稿。该操作会写入本地插件目录并执行插件 JavaScript，必须经过用户确认。", objectSchema({ draftId: text }, ["draftId"])),
    label: "安装并启用插件",
    changesState: true,
    requiresPermission: true,
  },
  {
    definition: tool("run_plugin_draft_checks", "Run the plugin draft in the host, verify activation, toolbox registration, and generated code before installation.", objectSchema({ draftId: text }, ["draftId"])),
    label: "运行插件检查",
    readOnly: true,
    longRunning: true,
  },
];

export function pluginDraftSummary(draft: PluginDraft, context: PluginDraftValidationContext = {}) {
  const validation = validatePluginDraft(draft, context);
  return {
    draftId: draft.id,
    phase: draft.phase,
    plan: draft.plan,
    files: Object.keys(draft.files),
    validation,
    ...(draft.runtimeValidation ? { runtimeValidation: draft.runtimeValidation } : {}),
    updatedAt: draft.updatedAt,
  };
}
