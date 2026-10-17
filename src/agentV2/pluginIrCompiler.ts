// IR → 插件文件编译器：确定性输出 plugin.json / codegen.json / index.js / README.md + 额外文本文件。
// 输入必须是 parsePluginIr 的产物（或 parsePluginIr 可接受的等价结构）；编译期不再做用户可修复的校验，
// 但仍会对缺失的生成器做默认补全，并把 imports/init 静态去重替换到 {IMPORTS}/{INIT} 占位符。

import {
  parsePluginIr,
  pluginIrPrefix,
  type PluginIr,
  type PluginIrBlock,
  type PluginIrField,
  type PluginIrGenerator,
  type PluginIrInput,
  type PluginIrToolboxCategory,
} from "./pluginIr";

export type PluginIrCompiledFiles = Record<string, string>;

const DEFAULT_COLOUR = "#397ca5";

const indentText = (text: string, spaces: number) => text.split("\n").map((line) => (line ? `${" ".repeat(spaces)}${line}` : line)).join("\n");

// JSON.stringify 输出里位于行首的对象键可以安全去引号：字符串值中的引号在 JSON 里是 \u005c 转义的。
const dequoteKeys = (text: string) => text.replace(/^([ \t]*)"([A-Za-z_$][A-Za-z0-9_$]*)":/gm, "$1$2:");

const reindentJson = (value: unknown, baseIndent: number) => dequoteKeys(JSON.stringify(value, null, 2))
  .split("\n")
  .map((line, index) => (index === 0 ? line : `${" ".repeat(baseIndent)}${line}`))
  .join("\n");

const compactJson = (value: unknown) => JSON.stringify(value);

const functionNameOf = (type: string) => type.replace(/[^A-Za-z0-9_]/g, "_");

function defaultGenerator(block: PluginIrBlock): PluginIrGenerator {
  if (block.generator) return block.generator;
  const inputs = block.inputs || [];
  const valueInputs = inputs.filter((item) => item.kind === "value");
  const statementInputs = inputs.filter((item) => item.kind === "statement");
  const functionName = functionNameOf(block.type);
  if (block.output) return { template: `${functionName}(${valueInputs.map((item) => `{INPUT:${item.name}}`).join(", ")})` };
  if (statementInputs.length) return { template: statementInputs.map((item) => `{STMTS:${item.name}}`).join("\n") };
  return { template: `# ${functionName}\n` };
}

function collectStaticLines(ir: PluginIr): { imports: string[]; init: string[] } {
  const imports: string[] = [];
  const init: string[] = [];
  const seenImports = new Set<string>();
  const seenInit = new Set<string>();
  for (const block of ir.blocks) {
    for (const line of block.generator?.imports || []) if (!seenImports.has(line)) { seenImports.add(line); imports.push(line); }
    for (const line of block.generator?.init || []) if (!seenInit.has(line)) { seenInit.add(line); init.push(line); }
  }
  return { imports, init };
}

function replaceStaticPlaceholder(template: string, marker: string, lines: string[]): string {
  let result = template;
  let index = result.indexOf(marker);
  while (index >= 0) {
    const lineStart = result.lastIndexOf("\n", index - 1) + 1;
    const column = index - lineStart;
    const replacement = lines.map((line) => (line ? `${" ".repeat(column)}${line}` : line)).join("\n");
    result = `${result.slice(0, index)}${replacement}${result.slice(index + marker.length)}`;
    index = result.indexOf(marker, index + replacement.length);
  }
  return result;
}

const placeholderPattern = /\{(INPUT|STMTS|FIELD):([A-Za-z_][A-Za-z0-9_]*)\}/;

type TemplatePart = { kind: "literal"; text: string } | { kind: "input"; name: string } | { kind: "statements"; name: string } | { kind: "field"; name: string };

function splitTemplate(template: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let rest = template;
  while (rest) {
    const match = placeholderPattern.exec(rest);
    if (!match || match.index === undefined) {
      parts.push({ kind: "literal", text: rest });
      break;
    }
    if (match.index > 0) parts.push({ kind: "literal", text: rest.slice(0, match.index) });
    const kind = match[1] === "INPUT" ? "input" : match[1] === "STMTS" ? "statements" : "field";
    parts.push({ kind, name: match[2] } as TemplatePart);
    rest = rest.slice(match.index + match[0].length);
  }
  return parts;
}

function generatorBody(block: PluginIrBlock, generator: PluginIrGenerator): string[] {
  const template = generator.template;
  if (block.output) {
    const parts = splitTemplate(template);
    const expression = parts.map((part) => {
      if (part.kind === "literal") return JSON.stringify(part.text);
      if (part.kind === "input") return `(generator.valueToCode(block, ${JSON.stringify(part.name)}, 0) || "None")`;
      if (part.kind === "field") return `block.getFieldValue(${JSON.stringify(part.name)})`;
      return `(generator.statementToCode(block, ${JSON.stringify(part.name)}) || "    pass\\n")`;
    }).join(" + ");
    return [`return [${expression}, 0];`];
  }
  const solePlaceholder = template.trim().match(/^\{STMTS:([A-Za-z_][A-Za-z0-9_]*)\}$/);
  if (solePlaceholder) {
    const name = JSON.stringify(solePlaceholder[1]);
    return [
      `const body = generator.statementToCode(block, ${name});`,
      `return body || "pass\\n";`,
    ];
  }
  const parts = splitTemplate(template);
  const expression = parts.map((part) => {
    if (part.kind === "literal") return JSON.stringify(part.text);
    if (part.kind === "input") return `(generator.valueToCode(block, ${JSON.stringify(part.name)}, 0) || "None")`;
    if (part.kind === "field") return `String(block.getFieldValue(${JSON.stringify(part.name)}))`;
    return `(generator.statementToCode(block, ${JSON.stringify(part.name)}) || "    pass\\n")`;
  }).join(" + ");
  return [`return ${expression};`];
}

function fieldArg(field: PluginIrField): Record<string, unknown> {
  if (field.kind === "dropdown") return { type: "field_dropdown", name: field.name, options: field.options };
  if (field.kind === "checkbox") return { type: "field_checkbox", name: field.name, checked: field.default === true };
  return { type: "field_input", name: field.name, text: field.default ?? "" };
}

function inputArg(input: PluginIrInput): Record<string, unknown> {
  if (input.kind === "statement") return { type: "input_statement", name: input.name };
  return {
    type: "input_value",
    name: input.name,
    ...(input.check ? { check: input.check } : {}),
    ...(input.shadow ? { shadow: { type: input.shadow.type, ...(input.shadow.fields ? { fields: input.shadow.fields } : {}) } } : {}),
  };
}

function buildDefinition(block: PluginIrBlock): Record<string, unknown> {
  const inputs = block.inputs || [];
  const fields = block.fields || [];
  const valueInputs = inputs.filter((item) => item.kind === "value");
  const statementInputs = inputs.filter((item) => item.kind === "statement");
  const byField = new Map(fields.map((field) => [field.name, field]));
  const byInput = new Map(inputs.map((item) => [item.name, item]));
  const args: Array<Record<string, unknown>> = [];
  const segments: string[] = [];
  const referencedFields = new Set<string>();
  const referencedInputs = new Set<string>();

  if (block.message) {
    for (const segment of block.message) {
      if (typeof segment === "string") {
        segments.push(segment);
        continue;
      }
      const target = "field" in segment ? byField.get(segment.field) : byInput.get(segment.input);
      if (!target) continue; // parse 已校验；防御性跳过
      if ("field" in segment) referencedFields.add(segment.field);
      else referencedInputs.add(segment.input);
      args.push(target.kind === "value" || target.kind === "statement" ? inputArg(target) : fieldArg(target));
      segments.push(`%${args.length}`);
    }
    for (const field of fields) {
      if (referencedFields.has(field.name)) continue;
      args.push(fieldArg(field));
      segments.push(`%${args.length}`);
    }
    for (const input of valueInputs) {
      if (referencedInputs.has(input.name)) continue;
      args.push(inputArg(input));
      segments.push(`%${args.length}`);
    }
    for (const input of statementInputs) {
      if (referencedInputs.has(input.name)) continue;
      args.push(inputArg(input));
      segments.push(`%${args.length}`);
    }
  } else {
    const leading = block.agent.purpose.trim() || block.type;
    for (const input of valueInputs) args.push(inputArg(input));
    for (const field of fields) args.push(fieldArg(field));
    for (const input of statementInputs) args.push(inputArg(input));
    segments.push([leading, ...args.map(() => "%1")].join(" "));
  }

  return {
    type: block.type,
    message0: segments.join(" "),
    ...(args.length ? { args0: args } : {}),
    ...(block.output ? { output: block.output } : { previousStatement: null, nextStatement: null }),
    colour: block.colour || DEFAULT_COLOUR,
    ...(block.tooltip ? { tooltip: block.tooltip } : {}),
    agent: {
      description: block.agent.purpose,
      capabilities: block.agent.capabilities?.length ? block.agent.capabilities : [block.agent.purpose],
      keywords: block.agent.keywords?.length ? block.agent.keywords : [block.agent.purpose, block.type],
      examples: block.agent.examples?.length ? block.agent.examples : [block.agent.purpose],
      ...(block.agent.inputDescriptions && Object.keys(block.agent.inputDescriptions).length ? { inputDescriptions: block.agent.inputDescriptions } : {}),
    },
  };
}

function resolveToolbox(ir: PluginIr): PluginIrToolboxCategory[] {
  if (ir.toolbox) return ir.toolbox;
  if (!ir.blocks.length) return [];
  return [{ name: ir.manifest.name, colour: DEFAULT_COLOUR, contents: ir.blocks.map((block) => ({ ref: block.ref })) }];
}

function toolboxSource(category: PluginIrToolboxCategory, blocksByRef: Map<string, PluginIrBlock>, toolboxId: string): string[] {
  const lines = [
    "    context.registerToolboxCategory({",
    `      id: ${compactJson(toolboxId)},`,
    `      name: ${compactJson(category.name)},`,
    `      colour: ${compactJson(category.colour || DEFAULT_COLOUR)},`,
    "      contents: [",
  ];
  for (const item of category.contents) {
    if ("label" in item) {
      lines.push(`        ${compactJson({ kind: "label", text: item.label })},`);
      continue;
    }
    if ("separator" in item) {
      lines.push(`        ${compactJson({ kind: "sep" })},`);
      continue;
    }
    const block = blocksByRef.get(item.ref) as PluginIrBlock | undefined;
    let shadowInputs: Record<string, unknown> | undefined;
    if (item.inputs) shadowInputs = item.inputs;
    else if (block) {
      const shadows = Object.fromEntries((block.inputs || [])
        .filter((input): input is Extract<PluginIrInput, { kind: "value" }> => input.kind === "value")
        .filter((input) => Boolean(input.shadow))
        .map((input) => [input.name, { shadow: { type: input.shadow!.type, ...(input.shadow!.fields ? { fields: input.shadow!.fields } : {}) } }]));
      if (Object.keys(shadows).length) shadowInputs = shadows;
    }
    const entry = { kind: "block", type: block?.type, ...(shadowInputs ? { inputs: shadowInputs } : {}) };
    lines.push(`        ${compactJson(entry)},`);
  }
  lines.push("      ],", "    });");
  return lines;
}

export function compilePluginIr(input: PluginIr): PluginIrCompiledFiles {
  const ir = parsePluginIr(input);
  const prefix = pluginIrPrefix(ir.manifest.id);
  const staticLines = collectStaticLines(ir);

  const blocksByRef = new Map(ir.blocks.map((block) => [block.ref, block]));
  const blockSources: string[] = [];
  for (const block of ir.blocks) {
    if (!block.type.startsWith(prefix)) throw new Error(`积木类型必须以插件命名空间开头（${prefix}）：${block.type}`);
    const generator = defaultGenerator(block);
    let template = generator.template;
    template = replaceStaticPlaceholder(template, "{IMPORTS}", staticLines.imports);
    template = replaceStaticPlaceholder(template, "{INIT}", staticLines.init);
    if (block.output && (template.includes("{IMPORTS}") || template.includes("{INIT}") || template.includes("{STMTS:"))) {
      throw new Error(`值是输出的积木 ${block.ref} 的模板只能包含 {INPUT:...} 和 {FIELD:...} 占位符`);
    }
    const definition = buildDefinition(block);
    const body = generatorBody(block, { ...generator, template });
    blockSources.push([
      "  {",
      `    definition: ${reindentJson(definition, 4)},`,
      "    generator(block, generator) {",
      indentText(body.join("\n"), 6),
      "    },",
      "  },",
    ].join("\n"));
  }

  const moduleHooks = (ir.hooks || []).filter((hook) => hook.slot === "module").map((hook) => hook.code);
  const activateHooks = (ir.hooks || []).filter((hook) => hook.slot === "activate").map((hook) => hook.code);
  const toolbox = resolveToolbox(ir);

  const activateLines: string[] = [];
  if (ir.blocks.length) activateLines.push("    for (const item of BLOCKS) context.registerBlock(item.definition, item.generator);");
  if (toolbox.length) {
    const toolboxId = `${ir.manifest.id}.toolbox`;
    for (const category of toolbox) activateLines.push(...toolboxSource(category, blocksByRef, toolboxId));
  }
  for (const code of activateHooks) activateLines.push(indentText(code.replace(/\s+$/, ""), 4));

  const indexSource = [
    ...(moduleHooks.length ? [moduleHooks.map((code) => code.replace(/\s+$/, "")).join("\n"), ""] : []),
    "const BLOCKS = [",
    blockSources.join("\n"),
    "];",
    "",
    "export default {",
    "  activate(context) {",
    ...activateLines,
    "  },",
    "};",
    "",
  ].join("\n");

  const codegenBlocks = Object.fromEntries(ir.blocks.map((block) => [block.type, {
    purpose: block.agent.purpose,
    inputs: (block.inputs || []).filter((item) => item.kind === "value").map((item) => item.name),
    capabilities: block.agent.capabilities?.length ? block.agent.capabilities : [block.agent.purpose],
    keywords: block.agent.keywords?.length ? block.agent.keywords : [block.agent.purpose, block.type],
    examples: block.agent.examples?.length ? block.agent.examples : [block.agent.purpose],
    ...(block.agent.inputDescriptions ? { inputDescriptions: block.agent.inputDescriptions } : {}),
    ...(block.output ? { output: block.output } : {}),
    ...(block.inputs?.some((item) => item.kind === "statement") ? { statementInput: (block.inputs.find((item) => item.kind === "statement") as Extract<PluginIrInput, { kind: "statement" }>).name } : {}),
  }]));

  const files: PluginIrCompiledFiles = {
    "plugin.json": `${JSON.stringify({
      id: ir.manifest.id,
      name: ir.manifest.name,
      version: ir.manifest.version || "1.0.0",
      apiVersion: "1",
      description: ir.manifest.description,
      entry: "index.js",
      agent: { description: ir.manifest.description, detect: "project" },
    }, null, 2)}\n`,
    "codegen.json": `${JSON.stringify({
      version: 1,
      mode: ir.manifest.kind || "standalone",
      ...(ir.manifest.kind === "extension" ? { provider: ir.manifest.provider, runtimeNames: ir.manifest.runtimeNames } : {}),
      blocks: codegenBlocks,
    }, null, 2)}\n`,
    "index.js": indexSource,
    "README.md": `# ${ir.manifest.name}\n\n${ir.manifest.description}\n`,
  };
  for (const [path, content] of Object.entries(ir.files || {})) files[path] = content;
  return files;
}

export function draftFilesHaveIrMarker(files: Record<string, string>): boolean {
  return typeof files[".ai-ir.json"] === "string";
}
