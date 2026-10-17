export type BlockPlanPrimitive = string | number | boolean;

export type BlockPlanInput =
  | BlockPlanPrimitive
  | { ref: string }
  | { refs: string[] };

export type BlockPlanReference = { ref: string };

export type BlockPlanTarget =
  | { blockId: string; inputName?: string }
  | { ref: string; inputName?: string }
  | { afterBlockId: string }
  | { afterRef: string };

export type BlockPlanCreateOperation = {
  action: "create";
  ref: string;
  block: string;
  fields?: Record<string, BlockPlanPrimitive>;
  inputs?: Record<string, BlockPlanInput>;
};

export type BlockPlanUpdateOperation = {
  action: "update";
  target: BlockPlanTarget;
  fields?: Record<string, BlockPlanPrimitive>;
  inputs?: Record<string, BlockPlanInput>;
};

export type BlockPlanDeleteOperation = {
  action: "delete";
  target: BlockPlanTarget;
};

export type BlockPlanConnectOperation = {
  action: "connect";
  from: BlockPlanReference;
  to: BlockPlanTarget;
};

export type BlockPlanOperation =
  | BlockPlanCreateOperation
  | BlockPlanUpdateOperation
  | BlockPlanDeleteOperation
  | BlockPlanConnectOperation;

export type BlockPlan = {
  version: 1;
  mode: "append" | "replace" | "patch";
  operations: BlockPlanOperation[];
};

export type BlockPlanIssueCode =
  | "INVALID_PLAN"
  | "INVALID_OPERATION"
  | "INVALID_FIELD"
  | "INVALID_INPUT"
  | "RAW_BLOCKLY_STATE"
  | "DUPLICATE_REF"
  | "UNKNOWN_REF"
  | "INVALID_TARGET"
  | "UNKNOWN_BLOCK"
  | "CONNECTION_MISMATCH"
  | "CONTEXT_VALIDATION_FAILED"
  | "CODE_VALIDATION_FAILED"
  | "ABORTED";

export type BlockPlanIssue = {
  code: BlockPlanIssueCode;
  message: string;
  operationIndex?: number;
  blockType?: string;
  fieldName?: string;
  inputName?: string;
  ref?: string;
};

export class BlockPlanValidationError extends Error {
  readonly issue: BlockPlanIssue;

  constructor(issue: BlockPlanIssue) {
    super(issue.message);
    this.name = "BlockPlanValidationError";
    this.issue = issue;
  }
}

const primitive = (value: unknown): value is BlockPlanPrimitive =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean";

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const rawBlocklyKeys = new Set(["id", "next", "shadow", "x", "y", "collapsed", "disabled", "comment"]);

function issue(
  code: BlockPlanIssueCode,
  message: string,
  operationIndex?: number,
  extra: Partial<Pick<BlockPlanIssue, "blockType" | "fieldName" | "inputName" | "ref">> = {},
): never {
  throw new BlockPlanValidationError({ code, message, ...(operationIndex === undefined ? {} : { operationIndex }), ...extra });
}

function rejectRawState(value: unknown, operationIndex?: number): void {
  if (!record(value)) return;
  for (const key of Object.keys(value)) {
    if (rawBlocklyKeys.has(key)) issue("RAW_BLOCKLY_STATE", `不允许提交原生 Blockly 字段：${key}`, operationIndex);
  }
  for (const nested of Object.values(value)) {
    if (record(nested) || Array.isArray(nested)) rejectRawState(nested, operationIndex);
  }
}

function parseFields(value: unknown, operationIndex: number, blockType?: string): Record<string, BlockPlanPrimitive> | undefined {
  if (value === undefined) return undefined;
  if (!record(value)) issue("INVALID_FIELD", "fields 必须是对象", operationIndex, { blockType });
  const fields: Record<string, BlockPlanPrimitive> = {};
  for (const [name, fieldValue] of Object.entries(value)) {
    if (!name.trim() || !primitive(fieldValue)) issue("INVALID_FIELD", `字段 ${name || "<empty>"} 必须是字符串、数字或布尔值`, operationIndex, { blockType, fieldName: name });
    fields[name] = fieldValue;
  }
  return fields;
}

function parseInput(value: unknown, operationIndex: number, inputName: string, blockType?: string): BlockPlanInput {
  if (primitive(value)) return value;
  if (!record(value)) issue("INVALID_INPUT", `输入槽 ${inputName} 的值无效`, operationIndex, { blockType, inputName });
  const keys = Object.keys(value);
  if (keys.length === 1 && typeof value.ref === "string" && value.ref.trim()) return { ref: value.ref.trim() };
  if (keys.length === 1 && Array.isArray(value.refs) && value.refs.length > 0 && value.refs.every((ref) => typeof ref === "string" && ref.trim())) {
    return { refs: value.refs.map((ref) => ref.trim()) };
  }
  issue("INVALID_INPUT", `输入槽 ${inputName} 必须是值、{ref} 或 {refs}`, operationIndex, { blockType, inputName });
}

function parseInputs(value: unknown, operationIndex: number, blockType?: string): Record<string, BlockPlanInput> | undefined {
  if (value === undefined) return undefined;
  if (!record(value)) issue("INVALID_INPUT", "inputs 必须是对象", operationIndex, { blockType });
  const inputs: Record<string, BlockPlanInput> = {};
  for (const [name, inputValue] of Object.entries(value)) inputs[name] = parseInput(inputValue, operationIndex, name, blockType);
  return inputs;
}

function parseTarget(value: unknown, operationIndex: number): BlockPlanTarget {
  if (!record(value)) issue("INVALID_TARGET", "target 必须是对象", operationIndex);
  const keys = Object.keys(value);
  const valid = ["blockId", "ref", "afterBlockId", "afterRef", "inputName"];
  if (keys.some((key) => !valid.includes(key))) issue("INVALID_TARGET", "target 只能包含 blockId、ref、afterBlockId 或 afterRef", operationIndex);
  const ids = ["blockId", "ref", "afterBlockId", "afterRef"].filter((key) => typeof value[key] === "string" && value[key].trim());
  if (ids.length !== 1) issue("INVALID_TARGET", "target 必须准确指定一个目标", operationIndex);
  const key = ids[0]!;
  const id = String(value[key]).trim();
  if (key === "blockId") return { blockId: id, ...(value.inputName === undefined ? {} : { inputName: String(value.inputName) }) };
  if (key === "ref") return { ref: id, ...(value.inputName === undefined ? {} : { inputName: String(value.inputName) }) };
  return key === "afterBlockId" ? { afterBlockId: id } : { afterRef: id };
}

function parseOperation(value: unknown, operationIndex: number): BlockPlanOperation {
  rejectRawState(value, operationIndex);
  if (!record(value) || typeof value.action !== "string") issue("INVALID_OPERATION", "每个操作必须包含 action", operationIndex);
  switch (value.action) {
    case "create": {
      if (typeof value.ref !== "string" || !value.ref.trim()) issue("INVALID_OPERATION", "create 必须包含非空 ref", operationIndex);
      if (typeof value.block !== "string" || !value.block.trim()) issue("INVALID_OPERATION", "create 必须包含非空 block", operationIndex);
      const blockType = value.block.trim();
      return { action: "create", ref: value.ref.trim(), block: blockType, fields: parseFields(value.fields, operationIndex, blockType), inputs: parseInputs(value.inputs, operationIndex, blockType) };
    }
    case "update":
      return { action: "update", target: parseTarget(value.target, operationIndex), fields: parseFields(value.fields, operationIndex), inputs: parseInputs(value.inputs, operationIndex) };
    case "delete":
      return { action: "delete", target: parseTarget(value.target, operationIndex) };
    case "connect":
      if (!record(value.from) || typeof value.from.ref !== "string" || !value.from.ref.trim()) issue("INVALID_OPERATION", "connect.from 必须是 {ref}", operationIndex);
      return { action: "connect", from: { ref: value.from.ref.trim() }, to: parseTarget(value.to, operationIndex) };
    default:
      issue("INVALID_OPERATION", `不支持的操作：${value.action}`, operationIndex);
  }
}

export function parseBlockPlan(value: unknown): BlockPlan {
  rejectRawState(value);
  if (!record(value)) issue("INVALID_PLAN", "BlockPlan 必须是对象");
  const keys = Object.keys(value);
  if (keys.some((key) => !["version", "mode", "operations"].includes(key))) issue("INVALID_PLAN", "BlockPlan 包含未知字段");
  if (value.version !== 1) issue("INVALID_PLAN", "BlockPlan.version 必须为 1");
  if (value.mode !== "append" && value.mode !== "replace" && value.mode !== "patch") issue("INVALID_PLAN", "BlockPlan.mode 必须为 append、replace 或 patch");
  if (!Array.isArray(value.operations) || value.operations.length === 0) issue("INVALID_PLAN", "BlockPlan.operations 不能为空");
  if (value.operations.length > 200) issue("INVALID_PLAN", "BlockPlan.operations 不能超过 200 个操作");
  const operations = value.operations.map((operation, index) => parseOperation(operation, index));
  const refs = new Set<string>();
  for (const [operationIndex, operation] of operations.entries()) {
    if (operation.action !== "create") continue;
    if (refs.has(operation.ref)) issue("DUPLICATE_REF", `重复的 ref：${operation.ref}`, operationIndex, { ref: operation.ref });
    refs.add(operation.ref);
  }
  for (const [operationIndex, operation] of operations.entries()) {
    const candidates = operation.action === "connect"
      ? [operation.from.ref, ...targetRefs(operation.to)]
      : [...inputRefs(operation.action === "create" || operation.action === "update" ? operation.inputs : undefined), ...targetRefs(operation.action === "update" || operation.action === "delete" ? operation.target : undefined)];
    for (const ref of candidates) {
      if (ref && !refs.has(ref)) issue("UNKNOWN_REF", `未知的积木 ref：${ref}`, operationIndex, { ref });
    }
  }
  return { version: 1, mode: value.mode, operations };
}

function inputRefs(inputs: Record<string, BlockPlanInput> | undefined): string[] {
  return Object.values(inputs ?? {}).flatMap((input) => typeof input === "object" && "ref" in input ? [input.ref] : typeof input === "object" && "refs" in input ? input.refs : []);
}

function targetRefs(target: BlockPlanTarget | undefined): string[] {
  if (!target) return [];
  return "ref" in target ? [target.ref] : "afterRef" in target ? [target.afterRef] : [];
}

export function blockPlanToolSchema() {
  const primitiveSchema = { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] };
  const inputSchema = { anyOf: [primitiveSchema, { type: "object", properties: { ref: { type: "string", minLength: 1 } }, required: ["ref"], additionalProperties: false }, { type: "object", properties: { refs: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1 } }, required: ["refs"], additionalProperties: false }] };
  const targetSchema = { type: "object", properties: { blockId: { type: "string" }, ref: { type: "string" }, inputName: { type: "string" }, afterBlockId: { type: "string" }, afterRef: { type: "string" } }, additionalProperties: false };
  const operationSchema = { oneOf: [
    { type: "object", properties: { action: { const: "create" }, ref: { type: "string", minLength: 1 }, block: { type: "string", minLength: 1 }, fields: { type: "object", additionalProperties: primitiveSchema }, inputs: { type: "object", additionalProperties: inputSchema } }, required: ["action", "ref", "block"], additionalProperties: false },
    { type: "object", properties: { action: { const: "update" }, target: targetSchema, fields: { type: "object", additionalProperties: primitiveSchema }, inputs: { type: "object", additionalProperties: inputSchema } }, required: ["action", "target"], additionalProperties: false },
    { type: "object", properties: { action: { const: "delete" }, target: targetSchema }, required: ["action", "target"], additionalProperties: false },
    { type: "object", properties: { action: { const: "connect" }, from: { type: "object", properties: { ref: { type: "string", minLength: 1 } }, required: ["ref"], additionalProperties: false }, to: targetSchema }, required: ["action", "from", "to"], additionalProperties: false },
  ] };
  return { type: "object", properties: { version: { const: 1 }, mode: { type: "string", enum: ["append", "replace", "patch"] }, operations: { type: "array", minItems: 1, maxItems: 200, items: operationSchema } }, required: ["version", "mode", "operations"], additionalProperties: false };
}
