// 插件 IR：AI 插件草稿的唯一结构写入口。
// 本模块只负责类型、解析与校验（issue 带 ref/字段定位）；IR→文件 的编译在 pluginIrCompiler.ts。
// 导入的既有插件草稿保留 files 模式；IR 草稿通过 apply_plugin_plan 操作修改。

export type PluginIrPrimitive = string | number | boolean;

export type PluginIrShadow = {
  type: string;
  fields?: Record<string, PluginIrPrimitive>;
};

export type PluginIrInput =
  | { name: string; kind: "value"; check?: string; shadow?: PluginIrShadow }
  | { name: string; kind: "statement" };

export type PluginIrField =
  | { name: string; kind: "text"; default?: string }
  | { name: string; kind: "checkbox"; default?: boolean }
  | { name: string; kind: "dropdown"; options: Array<[string, string]>; default?: string };

export type PluginIrMessageSegment = string | { field: string } | { input: string };

export type PluginIrGenerator = {
  template: string;
  imports?: string[];
  init?: string[];
};

export type PluginIrAgentMetadata = {
  purpose: string;
  capabilities?: string[];
  keywords?: string[];
  examples?: string[];
  inputDescriptions?: Record<string, string>;
};

export type PluginIrBlock = {
  ref: string;
  type: string;
  message?: PluginIrMessageSegment[];
  inputs?: PluginIrInput[];
  fields?: PluginIrField[];
  output?: string;
  colour?: string;
  tooltip?: string;
  agent: PluginIrAgentMetadata;
  generator?: PluginIrGenerator;
};

export type PluginIrToolboxItem = { ref: string; inputs?: Record<string, unknown> } | { label: string } | { separator: true };

export type PluginIrToolboxCategory = {
  name: string;
  colour?: string;
  contents: PluginIrToolboxItem[];
};

export type PluginIrHook = {
  ref: string;
  slot: "module" | "activate";
  code: string;
};

export type PluginIrManifest = {
  id: string;
  name: string;
  version?: string;
  description: string;
  kind?: "standalone" | "extension";
  provider?: string;
  runtimeNames?: string[];
};

export type PluginIr = {
  version: 1;
  manifest: PluginIrManifest;
  blocks: PluginIrBlock[];
  toolbox?: PluginIrToolboxCategory[];
  hooks?: PluginIrHook[];
  files?: Record<string, string>;
};

export type PluginIrIssueCode =
  | "INVALID_IR"
  | "INVALID_OPERATION"
  | "INVALID_MANIFEST"
  | "INVALID_BLOCK"
  | "INVALID_INPUT"
  | "INVALID_FIELD"
  | "INVALID_GENERATOR"
  | "INVALID_TOOLBOX"
  | "INVALID_HOOK"
  | "INVALID_FILES"
  | "DUPLICATE_REF"
  | "UNKNOWN_REF";

export type PluginIrIssue = {
  code: PluginIrIssueCode;
  message: string;
  ref?: string;
  fieldName?: string;
  inputName?: string;
  operationIndex?: number;
};

export class PluginIrError extends Error {
  readonly issue: PluginIrIssue;

  constructor(issue: PluginIrIssue) {
    super(issue.message);
    this.name = "PluginIrError";
    this.issue = issue;
  }
}

export type PluginPlanBlockInputSpec = {
  name: string;
  kind?: "value" | "statement";
  check?: string;
  shadow?: PluginIrShadow;
};

export type PluginPlanBlockSpec = {
  ref?: string;
  type?: string;
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

export type PluginPlanSpec = {
  id: string;
  name: string;
  description: string;
  version?: string;
  kind?: "standalone" | "extension";
  provider?: string;
  runtimeNames?: string[];
  blocks?: PluginPlanBlockSpec[];
};

export type PluginPlanOperation =
  | { action: "add_block"; block: PluginIrBlock }
  | { action: "update_block"; ref: string; set: Record<string, unknown> }
  | { action: "delete_block"; ref: string }
  | { action: "set_manifest"; set: Record<string, unknown> }
  | { action: "set_toolbox"; toolbox: PluginIrToolboxCategory[] | null }
  | { action: "add_hook"; hook: PluginIrHook }
  | { action: "update_hook"; ref: string; set: Record<string, unknown> }
  | { action: "delete_hook"; ref: string };

export const PLUGIN_IR_VERSION = 1;

export const pluginIrGeneratedPaths = ["plugin.json", "codegen.json", "index.js"] as const;

export const pluginIrPathSafe = (value: string) => {
  const normalized = value.replace(/\\/g, "/");
  return normalized === value && normalized.length > 0 && !normalized.startsWith("/") && !normalized.split("/").some((part) => !part || part === "." || part === "..");
};

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const refPattern = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const pluginIdPattern = /^[a-z][a-z0-9.-]*$/;
const versionPattern = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const placeholderPattern = /\{(INPUT|STMTS|FIELD):([A-Za-z_][A-Za-z0-9_]*)\}/g;

export const pluginIrPrefix = (id: string) => `${id.replace(/[^A-Za-z0-9_]/g, "_")}_`;

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

function issue(code: PluginIrIssueCode, message: string, extra: Partial<Pick<PluginIrIssue, "ref" | "fieldName" | "inputName" | "operationIndex">> = {}): never {
  throw new PluginIrError({ code, message, ...extra });
}

function withIndex(error: unknown, operationIndex: number): never {
  if (error instanceof PluginIrError) {
    if (error.issue.operationIndex === undefined) error.issue.operationIndex = operationIndex;
    throw error;
  }
  throw error;
}

function readString(value: unknown, label: string, extra: Partial<PluginIrIssue> = {}): string {
  if (typeof value !== "string" || !value.trim()) issue("INVALID_IR", `${label} 必须是非空字符串`, extra);
  return value.trim();
}

function readOptionalString(value: unknown, label: string, extra: Partial<PluginIrIssue> = {}): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") issue("INVALID_IR", `${label} 必须是字符串`, extra);
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readStringList(value: unknown, label: string, extra: Partial<PluginIrIssue> = {}): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) issue("INVALID_IR", `${label} 必须是字符串数组`, extra);
  const items = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
  return items.length ? [...new Set(items)] : undefined;
}

function parseShadow(value: unknown, inputName: string, extra: Partial<PluginIrIssue>): PluginIrShadow {
  if (!record(value)) issue("INVALID_INPUT", `输入 ${inputName} 的 shadow 必须是对象`, { ...extra, inputName });
  const type = readString(value.type, `输入 ${inputName} 的 shadow.type`, { ...extra, inputName });
  let fields: Record<string, PluginIrPrimitive> | undefined;
  if (value.fields !== undefined) {
    if (!record(value.fields)) issue("INVALID_INPUT", `输入 ${inputName} 的 shadow.fields 必须是对象`, { ...extra, inputName });
    fields = {};
    for (const [name, fieldValue] of Object.entries(value.fields)) {
      if (!name.trim() || (typeof fieldValue !== "string" && typeof fieldValue !== "number" && typeof fieldValue !== "boolean")) {
        issue("INVALID_INPUT", `输入 ${inputName} 的 shadow.fields.${name || "<empty>"} 必须是字符串、数字或布尔值`, { ...extra, inputName });
      }
      fields[name] = fieldValue;
    }
  }
  return { type, ...(fields && Object.keys(fields).length ? { fields } : {}) };
}

function parseInputs(value: unknown, extra: Partial<PluginIrIssue>): PluginIrInput[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) issue("INVALID_INPUT", "inputs 必须是数组", extra);
  const inputs: PluginIrInput[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const entry = typeof raw === "string" ? { name: raw, kind: "value" } : record(raw) ? raw : issue("INVALID_INPUT", "输入项必须是名称字符串或对象", extra);
    const name = readString(entry.name, "输入名", extra);
    if (!identifierPattern.test(name)) issue("INVALID_INPUT", `输入名不是合法标识符：${name}`, { ...extra, inputName: name });
    if (seen.has(name)) issue("INVALID_INPUT", `输入名重复：${name}`, { ...extra, inputName: name });
    seen.add(name);
    const kind = entry.kind === undefined ? "value" : entry.kind;
    if (kind === "statement") {
      inputs.push({ name, kind: "statement" });
      continue;
    }
    if (kind !== "value") issue("INVALID_INPUT", `输入 ${name} 的 kind 必须是 value 或 statement`, { ...extra, inputName: name });
    const check = readOptionalString(entry.check, `输入 ${name} 的 check`, { ...extra, inputName: name });
    const shadow = entry.shadow === undefined || entry.shadow === null ? undefined : parseShadow(entry.shadow, name, extra);
    inputs.push({ name, kind: "value", ...(check ? { check } : {}), ...(shadow ? { shadow } : {}) });
  }
  return inputs.length ? inputs : undefined;
}

function parseFields(value: unknown, extra: Partial<PluginIrIssue>): PluginIrField[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) issue("INVALID_FIELD", "fields 必须是数组", extra);
  const fields: PluginIrField[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!record(raw)) issue("INVALID_FIELD", "字段项必须是对象", extra);
    const name = readString(raw.name, "字段名", extra);
    if (!identifierPattern.test(name)) issue("INVALID_FIELD", `字段名不是合法标识符：${name}`, { ...extra, fieldName: name });
    if (seen.has(name)) issue("INVALID_FIELD", `字段名重复：${name}`, { ...extra, fieldName: name });
    seen.add(name);
    const kind = raw.kind === undefined ? "text" : raw.kind;
    if (kind === "checkbox") {
      const fallback = raw.default === undefined ? undefined : raw.default;
      if (fallback !== undefined && typeof fallback !== "boolean") issue("INVALID_FIELD", `字段 ${name} 的默认值必须是布尔值`, { ...extra, fieldName: name });
      fields.push({ name, kind: "checkbox", ...(fallback === undefined ? {} : { default: fallback }) });
      continue;
    }
    if (kind === "text") {
      const fallback = raw.default === undefined ? undefined : raw.default;
      if (fallback !== undefined && typeof fallback !== "string") issue("INVALID_FIELD", `字段 ${name} 的默认值必须是字符串`, { ...extra, fieldName: name });
      fields.push({ name, kind: "text", ...(fallback === undefined ? {} : { default: fallback }) });
      continue;
    }
    if (kind !== "dropdown") issue("INVALID_FIELD", `字段 ${name} 的 kind 必须是 dropdown、checkbox 或 text`, { ...extra, fieldName: name });
    if (!Array.isArray(raw.options) || !raw.options.length) issue("INVALID_FIELD", `下拉字段 ${name} 必须提供非空 options`, { ...extra, fieldName: name });
    const options: Array<[string, string]> = [];
    for (const option of raw.options) {
      if (typeof option === "string" && option.trim()) options.push([option, option]);
      else if (Array.isArray(option) && option.length === 2 && typeof option[0] === "string" && typeof option[1] === "string" && option[1].trim()) options.push([option[0], option[1]]);
      else issue("INVALID_FIELD", `下拉字段 ${name} 的选项必须是字符串或 [标签, 值] 对`, { ...extra, fieldName: name });
    }
    const fallback = raw.default === undefined || raw.default === null ? undefined : readString(raw.default, `字段 ${name} 的默认值`, { ...extra, fieldName: name });
    if (fallback !== undefined && !options.some(([, optionValue]) => optionValue === fallback)) {
      issue("INVALID_FIELD", `字段 ${name} 的默认值不在选项中：${fallback}`, { ...extra, fieldName: name });
    }
    fields.push({ name, kind: "dropdown", options, ...(fallback === undefined ? {} : { default: fallback }) });
  }
  return fields.length ? fields : undefined;
}

function parseMessage(value: unknown, extra: Partial<PluginIrIssue>): PluginIrMessageSegment[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) issue("INVALID_IR", "message 必须是数组", extra);
  const segments: PluginIrMessageSegment[] = [];
  for (const raw of value) {
    if (typeof raw === "string") {
      if (!raw) continue;
      segments.push(raw);
      continue;
    }
    if (record(raw)) {
      if (typeof raw.field === "string" && raw.field.trim()) {
        segments.push({ field: raw.field.trim() });
        continue;
      }
      if (typeof raw.input === "string" && raw.input.trim()) {
        segments.push({ input: raw.input.trim() });
        continue;
      }
    }
    issue("INVALID_IR", "message 段必须是文本、{field:名字} 或 {input:名字}", extra);
  }
  return segments.length ? segments : undefined;
}

function parseGenerator(value: unknown, blockType: string, inputs: PluginIrInput[] | undefined, fields: PluginIrField[] | undefined, extra: Partial<PluginIrIssue>): PluginIrGenerator | undefined {
  if (value === undefined || value === null) return undefined;
  if (!record(value)) issue("INVALID_GENERATOR", `积木 ${blockType} 的 generator 必须是对象`, extra);
  const template = readString(value.template, `积木 ${blockType} 的 generator.template`, extra);
  if (template.length > 4000) issue("INVALID_GENERATOR", `积木 ${blockType} 的 generator.template 过长`, extra);
  const imports = value.imports === undefined ? undefined : readStringList(value.imports, `积木 ${blockType} 的 generator.imports`, extra);
  const init = value.init === undefined ? undefined : readStringList(value.init, `积木 ${blockType} 的 generator.init`, extra);
  for (const match of template.matchAll(placeholderPattern)) {
    const kind = match[1];
    const name = match[2];
    const input = (inputs || []).find((item) => item.name === name);
    if (kind === "INPUT") {
      if (!input || input.kind !== "value") issue("INVALID_GENERATOR", `模板引用了未声明的值输入：{INPUT:${name}}`, { ...extra, inputName: name });
    } else if (kind === "STMTS") {
      if (!input || input.kind !== "statement") issue("INVALID_GENERATOR", `模板引用了未声明的语句输入：{STMTS:${name}}`, { ...extra, inputName: name });
    } else if (!(fields || []).some((item) => item.name === name)) {
      issue("INVALID_GENERATOR", `模板引用了未声明的字段：{FIELD:${name}}`, { ...extra, fieldName: name });
    }
  }
  return { template, ...(imports ? { imports } : {}), ...(init ? { init } : {}) };
}

function parseBlock(raw: unknown, index: number, seenRefs: Set<string>, seenTypes: Set<string>, extra: Partial<PluginIrIssue>): PluginIrBlock {
  if (!record(raw)) issue("INVALID_BLOCK", `blocks[${index}] 必须是对象`, extra);
  const ref = readOptionalString(raw.ref, "积木 ref") || `block_${index + 1}`;
  if (!refPattern.test(ref)) issue("INVALID_BLOCK", `积木 ref 不合法：${ref}`, { ...extra, ref });
  if (seenRefs.has(ref)) issue("DUPLICATE_REF", `积木 ref 重复：${ref}`, { ...extra, ref });
  seenRefs.add(ref);
  const type = readString(raw.type, `积木 ${ref} 的 type`, { ...extra, ref });
  if (!identifierPattern.test(type)) issue("INVALID_BLOCK", `积木 ${ref} 的 type 必须是块类型标识符（只含字母、数字、下划线）`, { ...extra, ref });
  if (seenTypes.has(type)) issue("INVALID_BLOCK", `积木类型重复：${type}`, { ...extra, ref });
  seenTypes.add(type);
  const inputs = parseInputs(raw.inputs, { ...extra, ref });
  const fields = parseFields(raw.fields, { ...extra, ref });
  const message = parseMessage(raw.message, { ...extra, ref });
  const output = raw.output === undefined || raw.output === null ? undefined : readString(raw.output, `积木 ${ref} 的 output`, { ...extra, ref });
  const colour = readOptionalString(raw.colour, `积木 ${ref} 的 colour`, { ...extra, ref });
  const tooltip = readOptionalString(raw.tooltip, `积木 ${ref} 的 tooltip`, { ...extra, ref });
  if (raw.agent === undefined || raw.agent === null || !record(raw.agent)) issue("INVALID_BLOCK", `积木 ${ref} 必须包含 agent 元数据对象`, { ...extra, ref });
  const purpose = readString(raw.agent.purpose, `积木 ${ref} 的 agent.purpose`, { ...extra, ref });
  if (purpose.length > 1000) issue("INVALID_BLOCK", `积木 ${ref} 的 agent.purpose 过长`, { ...extra, ref });
  const capabilities = readStringList(raw.agent.capabilities, `积木 ${ref} 的 agent.capabilities`, { ...extra, ref });
  const keywords = readStringList(raw.agent.keywords, `积木 ${ref} 的 agent.keywords`, { ...extra, ref });
  const examples = readStringList(raw.agent.examples, `积木 ${ref} 的 agent.examples`, { ...extra, ref });
  let inputDescriptions: Record<string, string> | undefined;
  if (raw.agent.inputDescriptions !== undefined && raw.agent.inputDescriptions !== null) {
    if (!record(raw.agent.inputDescriptions)) issue("INVALID_BLOCK", `积木 ${ref} 的 agent.inputDescriptions 必须是对象`, { ...extra, ref });
    inputDescriptions = {};
    for (const [name, description] of Object.entries(raw.agent.inputDescriptions)) {
      if (typeof description !== "string" || !description.trim()) issue("INVALID_BLOCK", `积木 ${ref} 的 agent.inputDescriptions.${name} 必须是非空字符串`, { ...extra, ref });
      inputDescriptions[name] = description.trim();
    }
  }
  const generator = parseGenerator(raw.generator, type, inputs, fields, { ...extra, ref });
  for (const segment of message || []) {
    if (typeof segment === "string") continue;
    if ("field" in segment && !(fields || []).some((field) => field.name === segment.field)) {
      issue("INVALID_IR", `message 引用了未声明的字段：{field:${segment.field}}`, { ...extra, ref, fieldName: segment.field });
    }
    if ("input" in segment && !(inputs || []).some((input) => input.name === segment.input)) {
      issue("INVALID_IR", `message 引用了未声明的输入：{input:${segment.input}}`, { ...extra, ref, inputName: segment.input });
    }
  }
  if (generator && output && (generator.template.includes("{STMTS:") || generator.template.includes("{IMPORTS}") || generator.template.includes("{INIT}"))) {
    issue("INVALID_GENERATOR", `值是输出的积木 ${ref} 的模板只能包含 {INPUT:...} 和 {FIELD:...} 占位符`, { ...extra, ref });
  }
  return {
    ref,
    type,
    ...(message ? { message } : {}),
    ...(inputs ? { inputs } : {}),
    ...(fields ? { fields } : {}),
    ...(output ? { output } : {}),
    ...(colour ? { colour } : {}),
    ...(tooltip ? { tooltip } : {}),
    agent: { purpose, ...(capabilities ? { capabilities } : {}), ...(keywords ? { keywords } : {}), ...(examples ? { examples } : {}), ...(inputDescriptions ? { inputDescriptions } : {}) },
    ...(generator ? { generator } : {}),
  };
}

function parseToolbox(value: unknown, extra: Partial<PluginIrIssue>): PluginIrToolboxCategory[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) issue("INVALID_TOOLBOX", "toolbox 必须是分类数组", extra);
  if (!value.length) return undefined;
  const categories: PluginIrToolboxCategory[] = [];
  value.forEach((raw, index) => {
    if (!record(raw)) issue("INVALID_TOOLBOX", `toolbox[${index}] 必须是对象`, extra);
    const name = readString(raw.name, `toolbox[${index}] 的 name`, extra);
    const colour = readOptionalString(raw.colour, `toolbox[${index}] 的 colour`, extra);
    if (!Array.isArray(raw.contents)) issue("INVALID_TOOLBOX", `工具箱分类 ${name} 必须提供 contents 数组`, extra);
    const contents: PluginIrToolboxItem[] = [];
    for (const item of raw.contents) {
      if (typeof item === "string") {
        if (item.trim() === "sep") contents.push({ separator: true });
        else issue("INVALID_TOOLBOX", `工具箱分类 ${name} 的字符串项只支持 "sep"`, extra);
        continue;
      }
      if (!record(item)) issue("INVALID_TOOLBOX", `工具箱分类 ${name} 的项必须是对象`, extra);
      if (item.separator === true) {
        contents.push({ separator: true });
        continue;
      }
      if (typeof item.label === "string" && item.label.trim()) {
        contents.push({ label: item.label.trim() });
        continue;
      }
      const ref = readString(item.ref, `工具箱分类 ${name} 项的 ref`, extra);
      let inputs: Record<string, unknown> | undefined;
      if (item.inputs !== undefined && item.inputs !== null) {
        if (!record(item.inputs)) issue("INVALID_TOOLBOX", `工具箱项 ${ref} 的 inputs 必须是对象`, extra);
        inputs = item.inputs;
      }
      contents.push({ ref, ...(inputs ? { inputs } : {}) });
    }
    categories.push({ name, ...(colour ? { colour } : {}), contents });
  });
  return categories;
}

function parseHooks(value: unknown, extra: Partial<PluginIrIssue>): PluginIrHook[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) issue("INVALID_HOOK", "hooks 必须是数组", extra);
  const hooks: PluginIrHook[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!record(raw)) issue("INVALID_HOOK", "hook 必须是对象", extra);
    const ref = readString(raw.ref, "hook 的 ref", extra);
    if (!refPattern.test(ref)) issue("INVALID_HOOK", `hook ref 不合法：${ref}`, { ...extra, ref });
    if (seen.has(ref)) issue("DUPLICATE_REF", `hook ref 重复：${ref}`, { ...extra, ref });
    seen.add(ref);
    if (raw.slot !== "module" && raw.slot !== "activate") issue("INVALID_HOOK", `hook ${ref} 的 slot 必须是 module 或 activate`, { ...extra, ref });
    const code = readString(raw.code, `hook ${ref} 的 code`, { ...extra, ref });
    if (code.length > 8000) issue("INVALID_HOOK", `hook ${ref} 的 code 过长`, { ...extra, ref });
    hooks.push({ ref, slot: raw.slot, code });
  }
  return hooks.length ? hooks : undefined;
}

function parseFiles(value: unknown, extra: Partial<PluginIrIssue>): Record<string, string> | undefined {
  if (value === undefined || value === null) return undefined;
  if (!record(value)) issue("INVALID_FILES", "files 必须是路径到文本内容的对象", extra);
  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(value)) {
    if (typeof content !== "string") issue("INVALID_FILES", `文件内容必须是文本：${path}`, extra);
    if (!pluginIrPathSafe(path)) issue("INVALID_FILES", `文件路径不安全：${path}`, extra);
    if ((pluginIrGeneratedPaths as readonly string[]).includes(path)) issue("INVALID_FILES", `files 不能覆盖编译器生成的文件：${path}`, extra);
    files[path] = content;
  }
  return Object.keys(files).length ? files : undefined;
}

export function parsePluginIr(value: unknown): PluginIr {
  if (!record(value)) issue("INVALID_IR", "插件 IR 必须是对象");
  if (value.version !== undefined && value.version !== PLUGIN_IR_VERSION) issue("INVALID_IR", `插件 IR 的 version 必须是 ${PLUGIN_IR_VERSION}`);
  if (!record(value.manifest)) issue("INVALID_MANIFEST", "插件 IR 缺少 manifest 对象");
  const rawManifest = value.manifest as Record<string, unknown>;
  const id = readString(rawManifest.id, "manifest.id");
  if (!pluginIdPattern.test(id)) issue("INVALID_MANIFEST", `manifest.id 无效：${id}`);
  const name = readString(rawManifest.name, "manifest.name");
  const description = readString(rawManifest.description, "manifest.description");
  const version = readOptionalString(rawManifest.version, "manifest.version") || "1.0.0";
  if (!versionPattern.test(version)) issue("INVALID_MANIFEST", `manifest.version 无效：${version}`);
  const kind = rawManifest.kind === undefined ? "standalone" : rawManifest.kind;
  if (kind !== "standalone" && kind !== "extension") issue("INVALID_MANIFEST", "manifest.kind 必须是 standalone 或 extension");
  const provider = readOptionalString(rawManifest.provider, "manifest.provider");
  const runtimeNames = readStringList(rawManifest.runtimeNames, "manifest.runtimeNames");
  if (kind === "extension") {
    if (!provider || !pluginIdPattern.test(provider)) issue("INVALID_MANIFEST", "extension 插件必须声明有效的 manifest.provider");
    if (!runtimeNames?.length) issue("INVALID_MANIFEST", "extension 插件必须声明 manifest.runtimeNames");
  } else if (provider || runtimeNames?.length) {
    issue("INVALID_MANIFEST", "standalone 插件不能声明 provider 或 runtimeNames");
  }
  const manifest: PluginIrManifest = { id, name, description, version, kind, ...(provider ? { provider } : {}), ...(runtimeNames ? { runtimeNames } : {}) };

  const blockSpecs = value.blocks === undefined ? [] : value.blocks;
  if (!Array.isArray(blockSpecs)) issue("INVALID_IR", "blocks 必须是数组");
  const seenRefs = new Set<string>();
  const seenTypes = new Set<string>();
  const blocks = blockSpecs.map((raw, index) => parseBlock(raw, index, seenRefs, seenTypes, {}));
  const hookRefs = new Set<string>();
  for (const block of blocks) hookRefs.add(block.ref);
  const hooks = (() => {
    const parsed = parseHooks(value.hooks, {});
    if (!parsed) return undefined;
    for (const hook of parsed) {
      if (hookRefs.has(hook.ref)) issue("DUPLICATE_REF", `hook ref 与积木 ref 重复：${hook.ref}`, { ref: hook.ref });
      hookRefs.add(hook.ref);
    }
    return parsed;
  })();

  const prefix = pluginIrPrefix(id);
  for (const block of blocks) {
    if (!block.type.startsWith(prefix)) issue("INVALID_BLOCK", `积木类型必须以插件命名空间开头（${prefix}）：${block.type}`, { ref: block.ref });
  }

  const toolbox = parseToolbox(value.toolbox, {});
  if (toolbox) {
    const refs = new Set(blocks.map((block) => block.ref));
    for (const category of toolbox) {
      for (const item of category.contents) {
        if ("ref" in item && !refs.has(item.ref)) issue("INVALID_TOOLBOX", `工具箱分类 ${category.name} 引用了不存在的积木 ref：${item.ref}`, { ref: item.ref });
      }
    }
  }

  const files = parseFiles(value.files, {});

  const declaredImports = blocks.some((block) => block.generator?.imports?.length);
  const declaredInit = blocks.some((block) => block.generator?.init?.length);
  const usesImports = blocks.some((block) => block.generator?.template.includes("{IMPORTS}"));
  const usesInit = blocks.some((block) => block.generator?.template.includes("{INIT}"));
  if (declaredImports && !usesImports) {
    const owner = blocks.find((block) => block.generator?.imports?.length)!;
    issue("INVALID_GENERATOR", "generator.imports 已声明，但没有任何模板包含 {IMPORTS} 占位符；请在入口积木模板中加入 {IMPORTS}", { ref: owner.ref });
  }
  if (declaredInit && !usesInit) {
    const owner = blocks.find((block) => block.generator?.init?.length)!;
    issue("INVALID_GENERATOR", "generator.init 已声明，但没有任何模板包含 {INIT} 占位符；请在入口积木模板中加入 {INIT}", { ref: owner.ref });
  }

  return {
    version: PLUGIN_IR_VERSION,
    manifest,
    blocks,
    ...(toolbox ? { toolbox } : {}),
    ...(hooks ? { hooks } : {}),
    ...(files ? { files } : {}),
  };
}

export function parsePluginPlanOperations(value: unknown): PluginPlanOperation[] {
  if (!record(value)) issue("INVALID_OPERATION", "operations 必须是对象");
  if (value.version !== undefined && value.version !== PLUGIN_IR_VERSION) issue("INVALID_OPERATION", `operations.version 必须是 ${PLUGIN_IR_VERSION}`);
  if (!Array.isArray(value.operations) || !value.operations.length) issue("INVALID_OPERATION", "operations 必须是非空数组");
  return value.operations.map((raw, operationIndex) => {
    if (!record(raw)) issue("INVALID_OPERATION", `operations[${operationIndex}] 必须是对象`, { operationIndex });
    try {
      const action = raw.action;
      if (action === "add_block") {
        if (raw.block === undefined) issue("INVALID_OPERATION", "add_block 必须提供 block", { operationIndex });
        const seenRefs = new Set<string>();
        const seenTypes = new Set<string>();
        return { action: "add_block" as const, block: parseBlock(raw.block, 0, seenRefs, seenTypes, { operationIndex }) };
      }
      if (action === "delete_block") return { action: "delete_block" as const, ref: readString(raw.ref, "delete_block 的 ref", { operationIndex }) };
      if (action === "update_block") {
        const ref = readString(raw.ref, "update_block 的 ref", { operationIndex });
        if (!record(raw.set)) issue("INVALID_OPERATION", "update_block 必须提供 set 对象", { operationIndex, ref });
        return { action: "update_block" as const, ref, set: raw.set };
      }
      if (action === "set_manifest") {
        if (!record(raw.set)) issue("INVALID_OPERATION", "set_manifest 必须提供 set 对象", { operationIndex });
        return { action: "set_manifest" as const, set: raw.set };
      }
      if (action === "set_toolbox") {
        const toolbox = raw.toolbox === null || raw.toolbox === undefined ? null : parseToolbox(raw.toolbox, { operationIndex }) ?? null;
        return { action: "set_toolbox" as const, toolbox };
      }
      if (action === "add_hook") {
        if (raw.hook === undefined) issue("INVALID_OPERATION", "add_hook 必须提供 hook", { operationIndex });
        const hooks = parseHooks([raw.hook], { operationIndex });
        return { action: "add_hook" as const, hook: hooks![0] };
      }
      if (action === "update_hook") {
        const ref = readString(raw.ref, "update_hook 的 ref", { operationIndex });
        if (!record(raw.set)) issue("INVALID_OPERATION", "update_hook 必须提供 set 对象", { operationIndex, ref });
        return { action: "update_hook" as const, ref, set: raw.set };
      }
      if (action === "delete_hook") return { action: "delete_hook" as const, ref: readString(raw.ref, "delete_hook 的 ref", { operationIndex }) };
      issue("INVALID_OPERATION", `不支持的 action：${String(action)}`, { operationIndex });
    } catch (error) {
      withIndex(error, operationIndex);
    }
  });
}

const cleanPartial = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));

export function applyPluginOperations(ir: PluginIr, operations: PluginPlanOperation[]): PluginIr {
  let current = structuredClone(ir);
  operations.forEach((operation, operationIndex) => {
    try {
      if (operation.action === "add_block") {
        if (current.blocks.some((block) => block.ref === operation.block.ref)) issue("DUPLICATE_REF", `积木 ref 已存在：${operation.block.ref}`, { operationIndex, ref: operation.block.ref });
        current = structuredClone({ ...current, blocks: [...current.blocks, operation.block] });
      } else if (operation.action === "delete_block") {
        if (!current.blocks.some((block) => block.ref === operation.ref)) issue("UNKNOWN_REF", `积木不存在：${operation.ref}`, { operationIndex, ref: operation.ref });
        current = structuredClone({ ...current, blocks: current.blocks.filter((block) => block.ref !== operation.ref) });
      } else if (operation.action === "update_block") {
        const index = current.blocks.findIndex((block) => block.ref === operation.ref);
        if (index < 0) issue("UNKNOWN_REF", `积木不存在：${operation.ref}`, { operationIndex, ref: operation.ref });
        const block = current.blocks[index] as unknown as Record<string, unknown>;
        const set = cleanPartial(operation.set);
        const next: Record<string, unknown> = { ...block, ...set };
        if (set.output === null) delete next.output;
        if (set.generator === null) delete next.generator;
        if (record(set.agent)) next.agent = { ...(block.agent as Record<string, unknown>), ...set.agent };
        if (record(set.generator)) next.generator = { ...((block.generator as Record<string, unknown>) || {}), ...set.generator };
        const blocks = [...current.blocks];
        const seenRefs = new Set(blocks.filter((_, itemIndex) => itemIndex !== index).map((item) => item.ref));
        const seenTypes = new Set(blocks.filter((_, itemIndex) => itemIndex !== index).map((item) => item.type));
        blocks[index] = parseBlock(next, index, seenRefs, seenTypes, { operationIndex, ref: operation.ref });
        current = structuredClone({ ...current, blocks });
      } else if (operation.action === "set_manifest") {
        const set = cleanPartial(operation.set);
        current = structuredClone({ ...current, manifest: { ...current.manifest, ...set } as PluginIrManifest });
      } else if (operation.action === "set_toolbox") {
        const next = { ...current };
        if (operation.toolbox === null) delete next.toolbox;
        else next.toolbox = operation.toolbox;
        current = structuredClone(next);
      } else if (operation.action === "add_hook") {
        const hooks = current.hooks || [];
        if (hooks.some((hook) => hook.ref === operation.hook.ref)) issue("DUPLICATE_REF", `hook ref 已存在：${operation.hook.ref}`, { operationIndex, ref: operation.hook.ref });
        current = structuredClone({ ...current, hooks: [...hooks, operation.hook] });
      } else if (operation.action === "update_hook") {
        const hooks = current.hooks || [];
        const index = hooks.findIndex((hook) => hook.ref === operation.ref);
        if (index < 0) issue("UNKNOWN_REF", `hook 不存在：${operation.ref}`, { operationIndex, ref: operation.ref });
        const set = cleanPartial(operation.set);
        const nextHooks = [...hooks];
        nextHooks[index] = { ...hooks[index], ...set } as PluginIrHook;
        current = structuredClone({ ...current, hooks: nextHooks });
      } else {
        const hooks = current.hooks || [];
        if (!hooks.some((hook) => hook.ref === operation.ref)) issue("UNKNOWN_REF", `hook 不存在：${operation.ref}`, { operationIndex, ref: operation.ref });
        const nextHooks = hooks.filter((hook) => hook.ref !== operation.ref);
        const next = { ...current };
        if (nextHooks.length) next.hooks = nextHooks;
        else delete next.hooks;
        current = structuredClone(next);
      }
      current = parsePluginIr(current);
    } catch (error) {
      withIndex(error, operationIndex);
    }
  });
  return current;
}

export function pluginIrFromPlan(input: PluginPlanSpec): PluginIr {
  const id = readString(input.id, "插件 ID");
  const name = readString(input.name, "插件名称");
  const description = readString(input.description, "插件描述");
  const prefix = pluginIrPrefix(id);
  const specs = input.blocks?.length ? input.blocks : [{ purpose: "Output text", inputs: ["TEXT"], generator: { template: "print({INPUT:TEXT})" } }];
  const blocks: PluginIrBlock[] = specs.map((spec, index) => {
    if (!record(spec)) issue("INVALID_BLOCK", `blocks[${index}] 必须是对象`);
    const ref = spec.ref?.trim() || `block_${index + 1}`;
    const type = spec.type?.trim() || `${prefix}block_${index + 1}`;
    const inputs: PluginIrInput[] = [];
    for (const raw of spec.inputs || []) {
      if (typeof raw === "string") inputs.push({ name: raw.trim(), kind: "value" });
      else if (record(raw)) {
        const inputName = readString(raw.name, `积木 ${ref} 的输入名`);
        if (raw.kind === "statement") inputs.push({ name: inputName, kind: "statement" });
        else inputs.push({ name: inputName, kind: "value", ...(typeof raw.check === "string" && raw.check.trim() ? { check: raw.check.trim() } : {}), ...(raw.shadow ? { shadow: parseShadow(raw.shadow, inputName, { ref }) } : {}) });
      } else issue("INVALID_INPUT", `积木 ${ref} 的输入项必须是名称或对象`, { ref });
    }
    if (spec.statementInput?.trim()) inputs.push({ name: spec.statementInput.trim(), kind: "statement" });
    const functionName = type.replace(/[^A-Za-z0-9_]/g, "_");
    const valueInputs = inputs.filter((item) => item.kind === "value");
    const statementInputs = inputs.filter((item) => item.kind === "statement");
    const parsedFields = spec.fields ? parseFields(spec.fields, { ref }) : undefined;
    const defaultTemplate = spec.output
      ? `${functionName}(${valueInputs.map((item) => `{INPUT:${item.name}}`).join(", ")})`
      : statementInputs.length
        ? statementInputs.map((item) => `{STMTS:${item.name}}`).join("\n")
        : `# ${functionName}\n`;
    const generatorInput = {
      template: spec.generator?.template?.trim() ? spec.generator.template : defaultTemplate,
      ...(spec.generator?.imports ? { imports: spec.generator.imports } : {}),
      ...(spec.generator?.init ? { init: spec.generator.init } : {}),
    };
    return {
      ref,
      type,
      ...(spec.message ? { message: parseMessage(spec.message, { ref }) } : {}),
      ...(inputs.length ? { inputs } : {}),
      ...(parsedFields ? { fields: parsedFields } : {}),
      ...(spec.output ? { output: spec.output } : {}),
      ...(spec.colour?.trim() ? { colour: spec.colour.trim() } : {}),
      ...(spec.tooltip?.trim() ? { tooltip: spec.tooltip.trim() } : {}),
      agent: {
        purpose: spec.purpose?.trim() || functionName,
        ...(spec.capabilities?.length ? { capabilities: spec.capabilities } : {}),
        ...(spec.keywords?.length ? { keywords: spec.keywords } : {}),
        ...(spec.examples?.length ? { examples: spec.examples } : {}),
        ...(spec.inputDescriptions && Object.keys(spec.inputDescriptions).length ? { inputDescriptions: spec.inputDescriptions } : {}),
      },
      generator: parseGenerator(generatorInput, type, inputs, parsedFields, { ref }),
    };
  });
  return parsePluginIr({
    version: PLUGIN_IR_VERSION,
    manifest: {
      id,
      name,
      description,
      ...(input.version?.trim() ? { version: input.version.trim() } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.runtimeNames?.length ? { runtimeNames: input.runtimeNames } : {}),
    },
    blocks,
  });
}

export function serializePluginIrFile(ir: PluginIr): string {
  return `${JSON.stringify(ir, null, 2)}\n`;
}

export function pluginIrFromJsonFile(text: string): PluginIr {
  return parsePluginIr(JSON.parse(text) as unknown);
}

export type PluginIrSummary = {
  manifest: PluginIrManifest;
  blocks: Array<{ ref: string; type: string; purpose: string; output: string | null; inputs: string[]; statementInputs: string[]; fields: string[]; template: string; imports: number; init: number }>;
  toolbox: Array<{ name: string; colour?: string; items: string[] }>;
  hooks: Array<{ ref: string; slot: string }>;
  files: string[];
};

export function pluginIrSummary(ir: PluginIr, options: { maxBlocks?: number } = {}): PluginIrSummary & { blocksTruncated?: true } {
  const maxBlocks = options.maxBlocks ?? 80;
  const blocks = ir.blocks.slice(0, maxBlocks).map((block) => ({
    ref: block.ref,
    type: block.type,
    purpose: block.agent.purpose,
    output: block.output ?? null,
    inputs: (block.inputs || []).filter((item) => item.kind === "value").map((item) => item.name),
    statementInputs: (block.inputs || []).filter((item) => item.kind === "statement").map((item) => item.name),
    fields: (block.fields || []).map((item) => item.name),
    template: block.generator ? (block.generator.template.length > 160 ? `${block.generator.template.slice(0, 160)}…` : block.generator.template) : "",
    imports: block.generator?.imports?.length || 0,
    init: block.generator?.init?.length || 0,
  }));
  return {
    manifest: ir.manifest,
    blocks,
    toolbox: (ir.toolbox || []).map((category) => ({
      name: category.name,
      ...(category.colour ? { colour: category.colour } : {}),
      items: category.contents.map((item) => ("ref" in item ? item.ref : "separator" in item ? "---" : item.label)),
    })),
    hooks: (ir.hooks || []).map((hook) => ({ ref: hook.ref, slot: hook.slot })),
    files: Object.keys(ir.files || {}),
    ...(ir.blocks.length > maxBlocks ? { blocksTruncated: true as const } : {}),
  };
}
