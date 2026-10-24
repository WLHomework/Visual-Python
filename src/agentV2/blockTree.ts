import type { BlockPlan, BlockPlanCreateOperation, BlockPlanInput, BlockPlanOperation } from "./blockPlan";

export type BlockTreePrimitive = string | number | boolean;

export type BlockTreeNode = {
  type: string;
  fields?: Record<string, BlockTreePrimitive>;
  values?: Record<string, BlockTreePrimitive | BlockTreeNode>;
  statements?: Record<string, BlockTreeNode[]>;
  next?: BlockTreeNode;
};

export type BlockTree = {
  version: 1;
  mode: "append" | "replace" | "patch";
  tree: BlockTreeNode | BlockTreeNode[];
  summary?: string;
};

export type ParsedBlockTree = {
  version: 1;
  mode: BlockTree["mode"];
  roots: BlockTreeNode[];
  summary?: string;
};

const primitive = (value: unknown): value is BlockTreePrimitive =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean";

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const allowedNodeKeys = new Set(["type", "fields", "values", "statements", "next"]);
const maxNodes = 120;

export class BlockTreeValidationError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(`${path}: ${message}`);
    this.name = "BlockTreeValidationError";
    this.path = path;
  }
}

function fail(message: string, path: string): never {
  throw new BlockTreeValidationError(message, path);
}

// qwen 等模型偶尔会把深层嵌套参数整体字符串化（双重 JSON 编码），这里透明解码一层。
function decodeMaybeJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function parseFields(value: unknown, path: string): Record<string, BlockTreePrimitive> | undefined {
  if (value === undefined) return undefined;
  if (!record(value)) fail("fields 必须是对象", path);
  const fields: Record<string, BlockTreePrimitive> = {};
  for (const [name, fieldValue] of Object.entries(value)) {
    if (!name.trim() || !primitive(fieldValue)) fail(`字段 ${name || "<empty>"} 必须是字符串、数字或布尔值`, `${path}.fields`);
    fields[name] = fieldValue;
  }
  return fields;
}

function parseNode(value: unknown, path: string, count: { value: number }): BlockTreeNode {
  count.value += 1;
  if (count.value > maxNodes) fail(`积木节点不能超过 ${maxNodes} 个`, path);
  if (!record(value)) fail("积木节点必须是对象", path);
  for (const key of Object.keys(value)) {
    if (!allowedNodeKeys.has(key)) fail(`不支持的节点字段：${key}`, path);
  }
  if (typeof value.type !== "string" || !value.type.trim()) fail("type 必须是非空字符串", path);
  const node: BlockTreeNode = { type: value.type.trim() };
  const fields = parseFields(value.fields, path);
  if (fields) node.fields = fields;
  if (value.values !== undefined) {
    if (!record(value.values)) fail("values 必须是对象", path);
    node.values = {};
    for (const [name, input] of Object.entries(value.values)) {
      if (primitive(input)) node.values[name] = input;
      else node.values[name] = parseNode(input, `${path}.values.${name}`, count);
    }
  }
  if (value.statements !== undefined) {
    if (!record(value.statements)) fail("statements 必须是对象", path);
    node.statements = {};
    for (const [name, statements] of Object.entries(value.statements)) {
      if (!Array.isArray(statements)) fail(`statements.${name} 必须是数组`, path);
      node.statements[name] = statements.map((statement, index) => parseNode(statement, `${path}.statements.${name}[${index}]`, count));
    }
  }
  if (value.next !== undefined) node.next = parseNode(value.next, `${path}.next`, count);
  return node;
}

export function parseBlockTree(value: unknown): ParsedBlockTree {
  const decoded = decodeMaybeJsonString(value);
  if (!record(decoded)) fail("BlockTree 必须是对象", "$");
  if (decoded.version !== undefined && decoded.version !== 1 && decoded.version !== "1") fail("version 必须为 1", "$");
  const rawMode = decoded.mode === undefined ? "append" : decoded.mode;
  if (rawMode !== "append" && rawMode !== "replace" && rawMode !== "patch") fail("mode 必须是 append、replace 或 patch", "$");
  if (decoded.summary !== undefined && typeof decoded.summary !== "string") fail("summary 必须是字符串", "$");
  if (decoded.tree === undefined) fail("tree 不能为空", "$");
  const tree = decodeMaybeJsonString(decoded.tree);
  const count = { value: 0 };
  const roots = Array.isArray(tree)
    ? tree.map((node, index) => parseNode(node, `tree[${index}]`, count))
    : [parseNode(tree, "tree", count)];
  if (!roots.length) fail("tree 至少包含一个根积木", "tree");
  return { version: 1, mode: rawMode, roots, ...(typeof decoded.summary === "string" ? { summary: decoded.summary } : {}) };
}

/** 把嵌套树展开成宿主已经理解的 BlockPlan；连接由这里生成，模型不需要写 ref/connect。 */
export function blockTreeToPlan(tree: ParsedBlockTree): BlockPlan {
  const create: BlockPlanCreateOperation[] = [];
  const connects: BlockPlanOperation[] = [];
  let nextId = 0;

  const visit = (node: BlockTreeNode, path: string): string => {
    const ref = `tree-${++nextId}`;
    const inputs: Record<string, BlockPlanInput> = {};
    for (const [name, input] of Object.entries(node.values ?? {})) {
      inputs[name] = primitive(input) ? input : { ref: visit(input, `${path}.values.${name}`) };
    }
    create.push({ action: "create", ref, block: node.type, ...(node.fields ? { fields: node.fields } : {}), ...(Object.keys(inputs).length ? { inputs } : {}) });
    for (const [name, statements] of Object.entries(node.statements ?? {})) {
      let previous: string | null = null;
      for (const statement of statements) {
        const childRef = visit(statement, `${path}.statements.${name}`);
        connects.push(previous
          ? { action: "connect", from: { ref: childRef }, to: { afterRef: previous } }
          : { action: "connect", from: { ref: childRef }, to: { ref, inputName: name } });
        previous = childRef;
      }
    }
    if (node.next) {
      const next = visit(node.next, `${path}.next`);
      connects.push({ action: "connect", from: { ref: next }, to: { afterRef: ref } });
    }
    return ref;
  };

  for (const [index, root] of tree.roots.entries()) visit(root, `tree[${index}]`);
  return { version: 1, mode: tree.mode, operations: [...create, ...connects] };
}

export function blockTreeToolSchema() {
  const primitiveSchema = { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] };
  const nodeSchema = {
    type: "object",
    properties: {
      type: { type: "string", minLength: 1, description: "真实积木类型，必须来自任务积木目录。" },
      fields: { type: "object", additionalProperties: primitiveSchema, description: "字段值；未填字段使用真实模板默认值。" },
      values: { type: "object", additionalProperties: true, description: "值输入名称到字面量或嵌套积木节点。" },
      statements: { type: "object", additionalProperties: { type: "array", items: { type: "object" } }, description: "语句输入名称到有序积木节点数组。" },
      next: { type: "object", description: "同层语句链的下一个积木节点；宿主负责串接。" },
    },
    required: ["type"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: {
      version: { const: 1 },
      mode: { type: "string", enum: ["append", "replace", "patch"] },
      summary: { type: "string", maxLength: 240 },
      tree: { oneOf: [nodeSchema, { type: "array", minItems: 1, maxItems: 20, items: nodeSchema }], description: "单个根积木，或多个独立入口根积木组成的数组。" },
    },
    required: ["tree"],
    additionalProperties: false,
  };
}
