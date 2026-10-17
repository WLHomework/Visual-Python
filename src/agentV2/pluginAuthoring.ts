import type { PluginManifest } from "../plugins/api/types";
import type { AiChatToolDefinition } from "../aiConfig";
import type { AgentTool } from "./types";
import { compilePluginIr } from "./pluginIrCompiler";
import { pluginGuideTopLevelTitles } from "./pluginGuide";
import {
  applyPluginOperations,
  parsePluginIr,
  pluginIrFromJsonFile,
  pluginIrFromPlan,
  pluginIrGeneratedPaths,
  type PluginIr,
  type PluginPlanBlockInputSpec,
  type PluginPlanOperation,
} from "./pluginIr";

// 草稿文件限制与 Rust 侧 install/read 的常量保持一致（src-tauri/src/lib.rs）。
const MAX_FILES = 128;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
let draftSequence = 0;
let planSequence = 0;

export type PluginDraftFiles = Record<string, string>;

export type PluginDraftMode = "ir" | "files";

export type PluginDraftPhase = "planned" | "drafted" | "implementing" | "needs_fix" | "validated" | "ready" | "installed";

export type PluginPlanBlock = {
  ref?: string;
  type: string;
  purpose: string;
  inputs?: Array<string | PluginPlanBlockInputSpec>;
  inputDescriptions?: Record<string, string>;
  output?: string | null;
  statementInput?: string;
  fields?: unknown[];
  message?: unknown[];
  colour?: string;
  tooltip?: string;
  capabilities?: string[];
  keywords?: string[];
  examples?: string[];
  generator?: { template?: string; imports?: string[]; init?: string[] };
};

export type PluginPlan = {
  id: string;
  pluginId: string;
  name: string;
  goal: string;
  kind: "standalone" | "extension";
  provider?: string;
  runtimeNames?: string[];
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
  provider?: string;
  runtimeNames?: string[];
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
  mode: PluginDraftMode;
  files: PluginDraftFiles;
  ir?: PluginIr;
  phase: PluginDraftPhase;
  plan: PluginPlan;
  validation?: PluginDraftValidation;
  runtimeValidation?: PluginRuntimeValidation;
  importWarnings?: string[];
  createdAt: number;
  updatedAt: number;
};

export type PluginDraftValidation = {
  valid: boolean;
  issues: string[];
  warnings?: string[];
  manifest?: PluginManifest;
  codegen?: PluginCodegenContract;
};

export type PluginCodegenContract = {
  version: 1;
  mode: "standalone" | "extension";
  provider?: string;
  runtimeNames: string[];
  blocks?: Record<string, {
    purpose: string;
    capabilities: string[];
    keywords: string[];
    examples: string[];
    inputDescriptions?: Record<string, string>;
  }>;
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
  createFromFiles(files: PluginDraftFiles, options?: { skippedFiles?: string[] }): PluginDraft;
  get(id: string): PluginDraft | undefined;
  listIds(): string[];
  update(id: string, files: PluginDraftFiles): PluginDraft;
  editFile(id: string, path: string, oldText: string, newText: string, replaceAll?: boolean): PluginDraft;
  applyOperations(id: string, operations: PluginPlanOperation[]): PluginDraft;
  markValidation(id: string, validation: PluginDraftValidation): PluginDraft;
  markRuntimeValidation(id: string, result: PluginRuntimeValidation): PluginDraft;
  markInstalled(id: string): PluginDraft;
};

export type PluginDraftStoreSnapshot = {
  version: 1;
  drafts: PluginDraft[];
  plans: PluginPlan[];
};

export type PluginDraftStorePersistence = {
  load(): unknown;
  save(snapshot: PluginDraftStoreSnapshot): void;
};

export type PluginDraftStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const pluginDraftStoreStorageKey = "visual-python:plugin-drafts";

// localStorage 适配器：草稿随应用重启保留，避免旧对话继续开发时报“草稿不存在”。
export function createPluginDraftStorePersistence(storage: PluginDraftStorage): PluginDraftStorePersistence {
  return {
    load() {
      try {
        return JSON.parse(storage.getItem(pluginDraftStoreStorageKey) || "null") as unknown;
      } catch {
        return null;
      }
    },
    save(snapshot) {
      try {
        storage.setItem(pluginDraftStoreStorageKey, JSON.stringify(snapshot));
      } catch {
        // 存储配额不足或隐私模式：草稿退化为仅当前运行期可用。
      }
    },
  };
}

export const missingPluginDraftError = (id: string, availableIds: string[]) => {
  const available = availableIds.length ? `当前可用草稿：${availableIds.slice(-5).join("、")}` : "当前没有可用草稿";
  return new Error(`插件草稿不存在：${id}（${available}）。draftId 只能使用工具返回的值；若草稿已失效，请用 create_plugin_draft 重新创建，或对已安装插件调用 import_installed_plugin_draft 恢复。`);
};

const missingPluginPlanError = (id: string, availableIds: string[]) => {
  const available = availableIds.length ? `当前可用计划：${availableIds.slice(-5).join("、")}` : "当前没有可用计划";
  return new Error(`插件计划不存在：${id}（${available}）。planId 只能使用 create_plugin_plan 返回的值；计划已失效时请重新规划，或省略 planId 直接创建草稿。`);
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
  registration: ["context.registerBlock", "context.registerToolboxCategory", "context.registerSetting", "context.registerCommand", "context.registerAgentTool", "context.registerWorkspaceValidator"],
  blockAgentMetadata: {
    required: ["description", "capabilities", "keywords", "examples"],
    optional: ["aliases", "dependencies", "inputDescriptions"],
    inputDescriptions: "Map each real Blockly input name to a concise semantic description; names must match args0 or registered input connections.",
  },
  stages: ["inspect_plugin_api", "read_plugin_guide", "create_plugin_plan", "create_plugin_draft", "read_plugin_draft", "apply_plugin_plan", "read_plugin_draft_file", "edit_plugin_draft_file", "update_plugin_draft", "validate_plugin_draft", "run_plugin_draft_checks", "install_plugin_draft"],
  rules: ["block and category ids must use the plugin id namespace", "every registered block must include agent metadata with a purpose and searchable keywords", "generated Python must use four spaces and no tabs", "installation is allowed only after static and runtime validation"],
  guide: {
    tool: "read_plugin_guide",
    usage: "官方《插件开发指南》：需要宿主 API 细节（PluginContext 方法、工具箱格式、依赖与安全、打包规范、排错）时按 section 读取；省略 section 返回目录，长小节用 nextOffset 继续。不要凭记忆编造宿主 API。",
    sections: pluginGuideTopLevelTitles,
  },
  ir: {
    description: "create_plugin_plan 的 blocks 是插件 IR 块规格；create_plugin_draft 把计划编译成 plugin.json/codegen.json/index.js。IR 草稿的结构修改只能用 apply_plugin_plan；导入的已安装插件按文件工具编辑。",
    version: 1,
    block: {
      ref: "草稿内唯一引用名（可选，缺省 block_N），工具箱与操作用它引用积木",
      type: "Blockly 块类型，必须以插件 ID 命名空间开头：ID 中非字母数字下划线替换为 _ 再追加 _",
      purpose: "必填，积木显示名与 Agent 描述",
      inputs: "数组：值输入 {name, kind:\"value\", check?, shadow:{type, fields?}}；语句输入 {name, kind:\"statement\"}",
      fields: "数组：下拉 {name, kind:\"dropdown\", options:[[标签,值]], default?}；勾选 {name, kind:\"checkbox\"}；文本 {name, kind:\"text\"}",
      message: "可选 message0 段数组：文本、{input:名字}、{field:名字}；省略时自动用 purpose 和输入生成",
      output: "省略为语句积木；给出类型字符串（如 \"Number\"）为输出积木，generator.template 是 Python 表达式",
      generator: "template 占位符：{INPUT:值输入名}→valueToCode / {STMTS:语句输入名}→statementToCode / {FIELD:字段名}；imports/init 为 Python 行，在模板里用 {IMPORTS}/{INIT} 标记插入位置（{STMTS} 放行首第 0 列；模板整体只有一个 {STMTS} 时空体生成 pass，否则生成一级缩进的 pass）",
    },
    operations: [
      { action: "add_block", block: "完整块规格，或先用 create_plugin_plan 一并给出" },
      { action: "update_block", ref: "目标块", set: "顶层键替换；agent/generator 浅合并；output:null 改回语句积木" },
      { action: "delete_block", ref: "目标块" },
      { action: "set_manifest", set: "id/name/description/version/kind/provider/runtimeNames" },
      { action: "set_toolbox", toolbox: "分类数组；null 恢复按积木顺序自动生成" },
      { action: "add_hook", hook: "{ref, slot:\"module\"|\"activate\", code:原生 JS}；逃生舱：模板无法表达的注册逻辑" },
      { action: "update_hook", ref: "目标 hook", set: "slot/code" },
      { action: "delete_hook", ref: "目标 hook" },
    ],
    toolboxItem: "分类 {name, colour?, contents}；条目 {ref, inputs?} 引用积木（省略 inputs 时自动填充 shadow 默认值），或 {label:文字}",
    importsRule: "声明 generator.imports/init 后必须至少有一个模板包含 {IMPORTS}/{INIT} 占位符，否则编译失败",
  },
};

const normalizePlan = (input: CreatePluginPlanInput, id = planId()): PluginPlan => ({
  id,
  pluginId: input.id,
  name: input.name,
  goal: input.description,
  kind: input.kind || "standalone",
  ...(input.provider ? { provider: input.provider } : {}),
  ...(input.runtimeNames?.length ? { runtimeNames: [...new Set(input.runtimeNames)] } : {}),
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

const buildPluginIrFromPlan = (input: { id: string; name: string; description: string; version?: string; plan: PluginPlan }): PluginIr =>
  pluginIrFromPlan({
    id: input.plan.pluginId,
    name: input.plan.name,
    description: input.description || input.plan.goal,
    version: input.version,
    kind: input.plan.kind,
    provider: input.plan.provider,
    runtimeNames: input.plan.runtimeNames,
    blocks: input.plan.blocks,
  });

const restoreIrFromFiles = (files: PluginDraftFiles): { ok: true; ir: PluginIr; files: PluginDraftFiles; plan: PluginPlan; warnings: string[] } | { ok: false; error?: string } => {
  const marker = files[".ai-ir.json"];
  if (typeof marker !== "string") return { ok: false };
  try {
    const ir = pluginIrFromJsonFile(marker);
    const manifestText = files["plugin.json"];
    const manifestId = typeof manifestText === "string" ? (JSON.parse(manifestText) as Record<string, unknown>).id : undefined;
    if (typeof manifestId !== "string" || ir.manifest.id !== manifestId) {
      return { ok: false, error: "检测到 .ai-ir.json，但与 plugin.json 的插件 ID 不一致；已按普通文件草稿导入。" };
    }
    const managed = new Set<string>([...pluginIrGeneratedPaths, ".ai-ir.json"]);
    const extras = Object.fromEntries(Object.entries(files).filter(([path]) => !managed.has(path)));
    const merged = { ...ir, ...(Object.keys(extras).length ? { files: { ...ir.files, ...extras } } : {}) };
    const parsed = parsePluginIr(merged);
    const compiled = compilePluginIr(parsed);
    const warnings: string[] = [];
    for (const path of pluginIrGeneratedPaths) {
      if (typeof files[path] === "string" && compiled[path] !== undefined && files[path] !== compiled[path]) {
        warnings.push(`磁盘上的 ${path} 与 .ai-ir.json 编译结果不一致（可能被手动修改过）；草稿以 IR 为准，安装会覆盖该文件。`);
      }
    }
    const plan = normalizePlan({ id: parsed.manifest.id, name: parsed.manifest.name, description: parsed.manifest.description, kind: parsed.manifest.kind, provider: parsed.manifest.provider, runtimeNames: parsed.manifest.runtimeNames });
    return { ok: true, ir: parsed, files: compiled, plan, warnings };
  } catch (error) {
    return { ok: false, error: `检测到 .ai-ir.json，但无法恢复 IR（${error instanceof Error ? error.message : String(error)}）；已按普通文件草稿导入。` };
  }
};

export function createPluginDraftStore(persistence?: PluginDraftStorePersistence): PluginDraftStore {
  const drafts = new Map<string, PluginDraft>();
  const plans = new Map<string, PluginPlan>();

  const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

  // 快照只保留最近 12 个草稿和 1.5M 字符，避免 localStorage 配额问题；丢弃的只是最旧草稿。
  const MAX_PERSISTED_DRAFTS = 12;
  const MAX_PERSISTED_CHARS = 1_500_000;

  const snapshotOf = (list: PluginDraft[]): PluginDraftStoreSnapshot => {
    const referenced = new Set(list.map((draft) => draft.plan.id));
    const merged = new Map<string, PluginPlan>();
    for (const plan of plans.values()) {
      if (referenced.has(plan.id)) merged.set(plan.id, plan);
    }
    for (const plan of [...plans.values()].slice(-10)) merged.set(plan.id, plan);
    return { version: 1, drafts: list, plans: [...merged.values()] };
  };

  const persist = () => {
    if (!persistence) return;
    let kept = [...drafts.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_PERSISTED_DRAFTS);
    let snapshot = snapshotOf(kept);
    while (kept.length > 1 && JSON.stringify(snapshot).length > MAX_PERSISTED_CHARS) {
      kept = kept.slice(0, -1);
      snapshot = snapshotOf(kept);
    }
    if (JSON.stringify(snapshot).length > MAX_PERSISTED_CHARS) return;
    persistence.save(snapshot);
  };

  const restore = (raw: unknown) => {
    if (!record(raw) || raw.version !== 1) return;
    for (const item of Array.isArray(raw.plans) ? raw.plans : []) {
      if (!record(item) || typeof item.id !== "string" || typeof item.pluginId !== "string" || typeof item.name !== "string" || !Array.isArray(item.files) || !Array.isArray(item.blocks)) continue;
      plans.set(item.id, item as PluginPlan);
    }
    for (const item of Array.isArray(raw.drafts) ? raw.drafts : []) {
      if (!record(item) || typeof item.id !== "string" || (item.mode !== "ir" && item.mode !== "files") || typeof item.phase !== "string" || !record(item.files) || !record(item.plan) || typeof item.plan.id !== "string") continue;
      const plan = plans.get(item.plan.id);
      if (!plan) continue;
      const files: PluginDraftFiles = {};
      let filesOk = true;
      for (const [path, content] of Object.entries(item.files)) {
        if (typeof content !== "string") { filesOk = false; break; }
        files[path] = content;
      }
      if (!filesOk) continue;
      const warnings = Array.isArray(item.importWarnings) ? item.importWarnings.filter((warning): warning is string => typeof warning === "string") : [];
      const base: PluginDraft = {
        id: item.id,
        mode: item.mode,
        files,
        phase: item.phase as PluginDraftPhase,
        plan,
        createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : Date.now(),
        ...(record(item.validation) ? { validation: item.validation as PluginDraftValidation } : {}),
        ...(record(item.runtimeValidation) ? { runtimeValidation: item.runtimeValidation as PluginRuntimeValidation } : {}),
        ...(warnings.length ? { importWarnings: warnings } : {}),
      };
      if (base.mode === "ir" && record(item.ir)) {
        try {
          const ir = parsePluginIr(item.ir);
          drafts.set(base.id, { ...base, ir, files: compilePluginIr(ir) });
          continue;
        } catch {
          drafts.set(base.id, { ...base, mode: "files", importWarnings: [...warnings, "草稿的 IR 数据与当前版本不兼容，已按文件草稿恢复。"] });
          continue;
        }
      }
      drafts.set(base.id, base);
    }
  };

  restore(persistence?.load());

  const requireDraft = (id: string) => {
    const current = drafts.get(id);
    if (!current) throw missingPluginDraftError(id, [...drafts.keys()]);
    return current;
  };

  return {
    createPlan(input) {
      const id = planId();
      const plan = normalizePlan(input, id);
      buildPluginIrFromPlan({ id: plan.pluginId, name: plan.name, description: plan.goal, plan });
      plans.set(id, plan);
      persist();
      return { id, plan };
    },
    getPlan(id) {
      return plans.get(id);
    },
    create(input) {
      const now = Date.now();
      const plan = input.planId ? plans.get(input.planId) : undefined;
      if (input.planId && !plan) throw missingPluginPlanError(input.planId, [...plans.keys()]);
      const draftPlan = plan || normalizePlan({ id: input.id, name: input.name, description: input.description });
      plans.set(draftPlan.id, draftPlan);
      if (input.files) {
        const draft: PluginDraft = { id: draftId(), mode: "files", files: { ...input.files }, phase: "drafted", plan: draftPlan, createdAt: now, updatedAt: now };
        drafts.set(draft.id, draft);
        persist();
        return draft;
      }
      const ir = buildPluginIrFromPlan({ id: draftPlan.pluginId, name: draftPlan.name, description: input.description || draftPlan.goal, version: input.version, plan: draftPlan });
      const draft: PluginDraft = { id: draftId(), mode: "ir", files: compilePluginIr(ir), ir, phase: "drafted", plan: draftPlan, createdAt: now, updatedAt: now };
      drafts.set(draft.id, draft);
      persist();
      return draft;
    },
    createFromFiles(files, options = {}) {
      const now = Date.now();
      const warnings: string[] = [];
      if (options.skippedFiles?.length) warnings.push(`以下文件不是可编辑的文本，已跳过（安装时会保留磁盘上的原文件）：${options.skippedFiles.join("、")}`);
      const restored = restoreIrFromFiles(files);
      if (restored.ok) {
        warnings.push(...restored.warnings);
        const draft: PluginDraft = { id: draftId(), mode: "ir", files: restored.files, ir: restored.ir, phase: "drafted", plan: restored.plan, createdAt: now, updatedAt: now, ...(warnings.length ? { importWarnings: warnings } : {}) };
        plans.set(restored.plan.id, restored.plan);
        drafts.set(draft.id, draft);
        persist();
        return draft;
      }
      if (restored.error) warnings.push(restored.error);
      const manifest = typeof files["plugin.json"] === "string" ? (() => { try { return JSON.parse(files["plugin.json"]) as Record<string, unknown>; } catch { return undefined; } })() : undefined;
      const plan = normalizePlan({ id: typeof manifest?.id === "string" ? manifest.id : "com.example.plugin", name: typeof manifest?.name === "string" ? manifest.name : "Plugin", description: typeof manifest?.description === "string" ? manifest.description : "Imported plugin" });
      plans.set(plan.id, plan);
      const draft: PluginDraft = { id: draftId(), mode: "files", files: { ...files }, phase: "drafted", plan, createdAt: now, updatedAt: now, ...(warnings.length ? { importWarnings: warnings } : {}) };
      drafts.set(draft.id, draft);
      persist();
      return draft;
    },
    get(id) {
      return drafts.get(id);
    },
    listIds() {
      return [...drafts.keys()];
    },
    update(id, files) {
      const current = requireDraft(id);
      if (current.mode === "ir") throw new Error("该草稿由插件 IR 编译生成：请使用 apply_plugin_plan 修改结构和生成器；文件工具仅适用于导入的插件草稿");
      const updated = { ...current, files: { ...current.files, ...files }, phase: "implementing" as const, validation: undefined, runtimeValidation: undefined, updatedAt: Date.now() };
      drafts.set(id, updated);
      persist();
      return updated;
    },
    editFile(id, path, oldText, newText, replaceAll = false) {
      const current = requireDraft(id);
      if (current.mode === "ir") throw new Error("该草稿由插件 IR 编译生成：请使用 apply_plugin_plan 修改结构和生成器；文件工具仅适用于导入的插件草稿");
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
      persist();
      return updated;
    },
    applyOperations(id, operations) {
      const current = requireDraft(id);
      if (current.mode !== "ir" || !current.ir) throw new Error("该草稿不是 IR 草稿：只有 create_plugin_draft 生成的草稿支持 apply_plugin_plan；导入的插件请使用文件工具修改");
      const nextIr = applyPluginOperations(current.ir, operations);
      const updated: PluginDraft = { ...current, ir: nextIr, files: compilePluginIr(nextIr), phase: "implementing", validation: undefined, runtimeValidation: undefined, updatedAt: Date.now() };
      drafts.set(id, updated);
      persist();
      return updated;
    },
    markValidation(id, validation) {
      const current = requireDraft(id);
      const runtimeValidation = validation.valid ? current.runtimeValidation : undefined;
      const updated = { ...current, validation, runtimeValidation, phase: validation.valid ? (runtimeValidation?.valid ? "ready" as const : "validated" as const) : "needs_fix" as const, updatedAt: Date.now() };
      drafts.set(id, updated);
      persist();
      return updated;
    },
    markRuntimeValidation(id, runtimeValidation) {
      const current = requireDraft(id);
      if (current.phase !== "validated" || current.validation?.valid !== true) {
        throw new Error("必须先通过 validate_plugin_draft 才能运行插件检查");
      }
      const updated = { ...current, runtimeValidation, phase: runtimeValidation.valid ? "ready" as const : "needs_fix" as const, updatedAt: Date.now() };
      drafts.set(id, updated);
      persist();
      return updated;
    },
    markInstalled(id) {
      const current = requireDraft(id);
      if (current.phase !== "ready" || current.validation?.valid !== true || current.runtimeValidation?.valid !== true) {
        throw new Error("必须先通过 run_plugin_draft_checks 才能安装插件");
      }
      const updated = { ...current, phase: "installed" as const, updatedAt: Date.now() };
      drafts.set(id, updated);
      persist();
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
  "registerWorkspaceValidator",
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
    const blocks: PluginCodegenContract["blocks"] = {};
    if (value.blocks !== undefined) {
      if (!value.blocks || typeof value.blocks !== "object" || Array.isArray(value.blocks)) {
        issues.push("codegen.json 的 blocks 必须是对象");
      } else {
        for (const [blockType, rawBlock] of Object.entries(value.blocks as Record<string, unknown>)) {
          const block = rawBlock && typeof rawBlock === "object" && !Array.isArray(rawBlock) ? rawBlock as Record<string, unknown> : {};
          const purpose = typeof block.purpose === "string" ? block.purpose.trim() : "";
          const capabilities = Array.isArray(block.capabilities) ? block.capabilities.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
          const keywords = Array.isArray(block.keywords) ? block.keywords.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
          const examples = Array.isArray(block.examples) ? block.examples.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
          const inputDescriptions = block.inputDescriptions && typeof block.inputDescriptions === "object" && !Array.isArray(block.inputDescriptions)
            ? Object.fromEntries(Object.entries(block.inputDescriptions as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1].trim())))
            : undefined;
          if (!purpose || !capabilities.length || !keywords.length || !examples.length) {
            issues.push(`codegen.json 中的积木 ${blockType} 缺少完整 Agent 文档：purpose、capabilities、keywords、examples 均为必填`);
            continue;
          }
          blocks[blockType] = { purpose, capabilities, keywords, examples, ...(inputDescriptions && Object.keys(inputDescriptions).length ? { inputDescriptions } : {}) };
        }
      }
    }
    if (value.mode === "extension") {
      if (!provider || !pluginIdPattern.test(provider)) issues.push("扩展模式必须声明有效的 provider 插件 ID");
      if (!runtimeNames.length) issues.push("扩展模式必须声明 runtimeNames");
    } else if (provider || runtimeNames.length) {
      issues.push("standalone 模式不能声明外部 provider 或 runtimeNames");
    }
    if (value.version !== 1 || (value.mode !== "standalone" && value.mode !== "extension")) return undefined;
    return {
      version: 1,
      mode: value.mode,
      ...(provider ? { provider } : {}),
      runtimeNames: [...new Set(runtimeNames)],
      ...(Object.keys(blocks).length ? { blocks } : {}),
    };
  } catch (error) {
    issues.push(`codegen.json 不是有效 JSON：${String(error)}`);
    return undefined;
  }
}

function generatedRuntimeReceivers(source: string): string[] {
  // 插件入口里的 Python 代码大多嵌在 JS 字符串里：把转义的 \n 还原成真实换行，
  // 否则 "…turtle\npen = …" 这类文本会因为 \n 紧邻标识符而找不到声明边界。
  const scanned = source.replace(/\\n/g, "\n");
  const declared = new Set(knownJavaScriptRuntimeNames);
  const addParameters = (parameters: string) => {
    for (const parameter of parameters.split(",")) {
      const name = parameter.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)/)?.[1];
      if (name) declared.add(name);
    }
  };
  for (const match of scanned.matchAll(/\b(?:const|let|var|class)\s+([A-Za-z_][A-Za-z0-9_]*)/g)) declared.add(match[1]);
  for (const match of scanned.matchAll(/\(([^()]*)\)\s*=>/g)) addParameters(match[1]);
  for (const match of scanned.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*=>/g)) declared.add(match[1]);
  for (const match of scanned.matchAll(/\b(?:function(?:\s+[A-Za-z_][A-Za-z0-9_]*)?|[A-Za-z_][A-Za-z0-9_]*)\s*\(([^()]*)\)\s*\{/g)) addParameters(match[1]);
  for (const match of scanned.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=|>)/g)) declared.add(match[1]);
  for (const match of scanned.matchAll(/\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\b/g)) declared.add(match[1]);
  for (const match of scanned.matchAll(/\bimport\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?/g)) declared.add(match[2] || match[1]);
  for (const match of scanned.matchAll(/\bfrom\s+[A-Za-z_][A-Za-z0-9_.]*\s+import\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?/g)) declared.add(match[2] || match[1]);
  for (const match of scanned.matchAll(/\bdef\s+[A-Za-z_][A-Za-z0-9_]*\s*\(([^)]*)\)/g)) {
    addParameters(match[1]);
  }
  const receivers = new Set<string>();
  for (const match of scanned.matchAll(/(?<![\w.])([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*[A-Za-z_][A-Za-z0-9_]*\s*\(/g)) {
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
    const directBlockRegistrationCount = (entrySource.match(/\bregisterBlock\s*\(\s*\{/g) || []).length;
    const directBlockDocumentationCount = (entrySource.match(/\bagent\s*:/g) || []).length;
    if (codegenDeclaresBlocks(files["codegen.json"]) && directBlockRegistrationCount > directBlockDocumentationCount) {
      issues.push("每个 registerBlock() 积木定义都必须包含 agent 文档：description、capabilities、keywords 和 examples");
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

  const warnings: string[] = [];
  if (codegen?.blocks && Object.keys(codegen.blocks).length && typeof entrySource === "string") {
    const declared = new Set(Object.keys(codegen.blocks));
    const registered = new Set<string>();
    for (const pattern of [
      /registerBlock\s*\(\s*\{\s*(?:[^}]*?)["']?type["']?\s*:\s*["']([^"']+)["']/g,
      /definition\s*:\s*\{\s*(?:[^}]*?)["']?type["']?\s*:\s*["']([^"']+)["']/g,
    ]) {
      for (const match of entrySource.matchAll(pattern)) registered.add(match[1]);
    }
    const missing = [...declared].filter((type) => !registered.has(type));
    const undeclared = [...registered].filter((type) => !declared.has(type));
    if (missing.length) warnings.push(`codegen.json 声明了积木但入口未注册：${missing.slice(0, 8).join("、")}`);
    if (undeclared.length) warnings.push(`入口注册了积木但 codegen.json 未声明：${undeclared.slice(0, 8).join("、")}`);
  }

  return { valid: issues.length === 0, issues, ...(warnings.length ? { warnings } : {}), ...(manifest ? { manifest } : {}), ...(codegen ? { codegen } : {}) };
}

const irShadowSchema = objectSchema({
  type: text,
  fields: { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } },
}, ["type"]);
const irInputSchema = objectSchema({
  name: text,
  kind: { type: "string", enum: ["value", "statement"] },
  check: text,
  shadow: irShadowSchema,
}, ["name"]);
const irFieldSchema = objectSchema({
  name: text,
  kind: { type: "string", enum: ["dropdown", "checkbox", "text"] },
  options: { type: "array", items: { anyOf: [text, { type: "array", items: text }] } },
  default: { type: ["string", "boolean"] },
}, ["name"]);
const irGeneratorSchema = objectSchema({
  template: text,
  imports: { type: "array", items: text },
  init: { type: "array", items: text },
}, ["template"]);
const irMessageSchema = { type: "array", items: { anyOf: [text, objectSchema({ field: text }), objectSchema({ input: text })] } };
const planBlockSchema = objectSchema({
  ref: text,
  type: text,
  purpose: text,
  inputs: { type: "array", items: { anyOf: [text, irInputSchema] } },
  inputDescriptions: { type: "object", additionalProperties: { type: "string" } },
  output: text,
  statementInput: text,
  fields: { type: "array", items: irFieldSchema },
  message: irMessageSchema,
  colour: text,
  tooltip: text,
  capabilities: { type: "array", items: text },
  keywords: { type: "array", items: text },
  examples: { type: "array", items: text },
  generator: irGeneratorSchema,
}, ["type", "purpose"]);

export const pluginAuthoringTools: AgentTool[] = [
  {
    definition: tool("inspect_plugin_api", "读取插件开发契约、IR 规格、入口要求、积木注册规则、工具箱规则和验证阶段。创建或修改插件前先调用。", objectSchema()),
    label: "查看插件开发契约",
    readOnly: true,
  },
  {
    definition: tool("read_plugin_guide", "分页读取官方《插件开发指南》：宿主 API 细节、积木与工具箱格式、依赖与安全、打包规范和排错。省略 section 返回目录；section 取自目录（可只给标题片段），长小节用 nextOffset 继续。", objectSchema({
      section: { type: "string", description: "小节标题或标题片段，例如“工具箱”“PluginContext”；省略时返回目录" },
      offset: { type: "integer", minimum: 0 },
      maxChars: { type: "integer", minimum: 1, maximum: 8000 },
    })),
    label: "阅读插件开发指南",
    readOnly: true,
  },
  {
    definition: tool("create_plugin_plan", "为插件建立结构化开发计划：blocks 使用插件 IR 规格（类型、输入、字段、生成器模板），计划不会安装插件；create_plugin_draft 会把它编译成插件文件。生成器模板无法表达入口注册逻辑时，改用 apply_plugin_plan 的 hooks。", objectSchema({
      id: { type: "string", description: "小写插件 ID，例如 com.example.shapes" },
      name: text,
      description: text,
      kind: { type: "string", enum: ["standalone", "extension"] },
      provider: { type: "string", description: "extension 模式必须：提供方插件 ID" },
      runtimeNames: { type: "array", items: text, description: "extension 模式必须：提供方声明的 Python 运行对象" },
      files: { type: "array", items: objectSchema({ path: text, purpose: text }, ["path", "purpose"]) },
      blocks: { type: "array", items: planBlockSchema, description: "IR 块规格；生成器模板用 {INPUT:名}/{STMTS:名}/{FIELD:名}/{IMPORTS}/{INIT} 占位符" },
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
    definition: tool("import_installed_plugin_draft", "按插件 ID 读取已安装外部插件的受控文本文件并导入为草稿；带 .ai-ir.json 的插件会自动恢复 IR 模式，其余按原始文件编辑。二进制文件会被跳过并给出警告，安装时会保留。继续修改已有插件时使用，不要重新创建同名草稿。", objectSchema({ pluginId: text }, ["pluginId"])),
    label: "导入已安装插件",
    changesState: true,
  },
  {
    definition: tool("read_plugin_draft", "读取 IR 插件草稿的结构摘要：清单、积木（ref/类型/输入/字段/模板）、工具箱、hooks 和警告。给出 blockRef 时返回该积木的完整规格。draftId 必须使用 create_plugin_draft / import_installed_plugin_draft 返回的值，不要复用历史消息中的旧 ID。", objectSchema({ draftId: text, blockRef: text }, ["draftId"])),
    label: "读取插件草稿结构",
    readOnly: true,
  },
  {
    definition: tool("apply_plugin_plan", "按操作修改 IR 插件草稿并立刻重新编译生成文件；任一操作失败时草稿保持不变。operations 见 inspect_plugin_api 的 ir.operations：add_block、update_block、delete_block、set_manifest、set_toolbox、add_hook、update_hook、delete_hook。", objectSchema({
      draftId: text,
      operations: {
        type: "array",
        items: objectSchema({
          action: { type: "string", enum: ["add_block", "update_block", "delete_block", "set_manifest", "set_toolbox", "add_hook", "update_hook", "delete_hook"] },
          ref: text,
          block: { type: "object" },
          set: { type: "object" },
          toolbox: { type: "array" },
          hook: { type: "object" },
        }, ["action"]),
      },
      summary: text,
    }, ["draftId", "operations"])),
    label: "修改插件结构",
    changesState: true,
  },
  {
    definition: tool("read_plugin_draft_file", "分页读取导入的插件草稿（files 模式）中的原始文本文件；IR 草稿的生成文件请用 read_plugin_draft 查看。文件较长时使用 nextOffset 继续读取。", objectSchema({
      draftId: text,
      path: text,
      offset: { type: "integer", minimum: 0 },
      maxChars: { type: "integer", minimum: 1, maximum: 5000 },
    }, ["draftId", "path"])),
    label: "读取插件草稿文件",
    readOnly: true,
  },
  {
    definition: tool("create_plugin_draft", "把 create_plugin_plan 的计划编译成插件草稿：plugin.json、codegen.json、index.js、README 由 IR 生成，只保存在当前会话的草稿区，不会安装。扩展已有插件前必须先读取其能力契约。", objectSchema({
      id: { type: "string", description: "小写插件 ID，例如 com.example.shapes" },
      name: text,
      description: text,
      version: text,
      planId: text,
    }, ["id", "name", "description"])),
    label: "创建插件草稿",
    changesState: true,
  },
  {
    definition: tool("update_plugin_draft", "整文件更新导入的插件草稿（files 模式）。IR 草稿请使用 apply_plugin_plan，不要改生成文件；不要修改草稿 ID。", objectSchema({ draftId: text, files: textMap }, ["draftId", "files"])),
    label: "修改插件草稿",
    changesState: true,
  },
  {
    definition: tool("edit_plugin_draft_file", "对导入的插件草稿（files 模式）按 oldText 定点修改，默认要求 oldText 只匹配一处。IR 草稿请使用 apply_plugin_plan。", objectSchema({ draftId: text, path: text, oldText: text, newText: text, replaceAll: { type: "boolean" } }, ["draftId", "path", "oldText", "newText"])),
    label: "定点修改插件文件",
    changesState: true,
  },
  {
    definition: tool("validate_plugin_draft", "检查插件草稿的文件路径、Manifest、入口文件、API 版本、积木命名空间及代码生成运行对象契约；IR 草稿基于最新编译产物验证，warnings 不阻塞安装。", objectSchema({ draftId: text }, ["draftId"])),
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
    definition: tool("run_plugin_draft_checks", "Run the plugin draft in the host, verify activation, toolbox references, and generated code before installation. 该检查会在宿主中执行插件草稿的 JavaScript，需要用户确认。", objectSchema({ draftId: text }, ["draftId"])),
    label: "运行插件检查",
    requiresPermission: true,
    longRunning: true,
  },
];

export function pluginDraftSummary(draft: PluginDraft, context: PluginDraftValidationContext = {}) {
  const validation = validatePluginDraft(draft, context);
  return {
    draftId: draft.id,
    mode: draft.mode,
    phase: draft.phase,
    plan: draft.plan,
    files: Object.keys(draft.files),
    ...(draft.importWarnings?.length ? { importWarnings: draft.importWarnings } : {}),
    validation,
    ...(draft.runtimeValidation ? { runtimeValidation: draft.runtimeValidation } : {}),
    updatedAt: draft.updatedAt,
  };
}
