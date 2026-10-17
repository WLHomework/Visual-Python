import * as Blockly from "blockly/core";
import type { BlockPlan, BlockPlanInput, BlockPlanIssue, BlockPlanOperation, BlockPlanTarget } from "./blockPlan";
import type { BlockTemplate } from "./blocklyHost";

type ContextIssue = { blockId?: string; blockType?: string; message: string };

export type BlockPlanCompilerServices = {
  workspace: Blockly.Workspace;
  getBlockTemplates(types: string[]): BlockTemplate[];
  generateCode(workspace: Blockly.Workspace): string;
  validateContexts(workspace: Blockly.Workspace): ContextIssue[];
  validateCode(code: string): Promise<void>;
  commit(state: object, code: string): void;
  entryBlockTypes?: string[];
};

export type BlockPlanCompilation = {
  ok: boolean;
  changed: boolean;
  blockCount?: number;
  autoChained?: number;
  state?: object;
  code?: string;
  issues?: BlockPlanIssue[];
  changedBlockIds?: string[];
  refIds?: Record<string, string>;
};

class PlanCompileError extends Error {
  readonly issue: BlockPlanIssue;

  constructor(issue: BlockPlanIssue) {
    super(issue.message);
    this.issue = issue;
  }
}

const statementType = Blockly.inputs.inputTypes.STATEMENT;

function issue(code: BlockPlanIssue["code"], message: string, operationIndex: number, extra: Partial<BlockPlanIssue> = {}): never {
  throw new PlanCompileError({ code, message, operationIndex, ...extra });
}

function stateOf(workspace: Blockly.Workspace): object {
  return Blockly.serialization.workspaces.save(workspace) as object;
}

function cleanTemplateState(template: BlockTemplate): Blockly.serialization.blocks.State {
  const state = structuredClone(template.state) as Record<string, unknown>;
  delete state.kind;
  delete state.gap;
  if (typeof state.type !== "string" || !state.type.trim()) state.type = template.type;
  return state as unknown as Blockly.serialization.blocks.State;
}

function targetBlock(
  target: BlockPlanTarget,
  refs: Map<string, Blockly.Block>,
  workspace: Blockly.Workspace,
  operationIndex: number,
): Blockly.Block {
  if ("ref" in target) {
    const block = refs.get(target.ref);
    if (!block) issue("UNKNOWN_REF", `Unknown block ref: ${target.ref}`, operationIndex, { ref: target.ref });
    return block;
  }
  if ("blockId" in target) {
    const block = workspace.getBlockById(target.blockId);
    if (!block) issue("INVALID_TARGET", `Block does not exist: ${target.blockId}`, operationIndex);
    return block;
  }
  if ("afterBlockId" in target) {
    const block = workspace.getBlockById(target.afterBlockId);
    if (!block) issue("INVALID_TARGET", `Block does not exist: ${target.afterBlockId}`, operationIndex);
    return block;
  }
  if ("afterRef" in target) {
    const block = refs.get(target.afterRef);
    if (!block) issue("UNKNOWN_REF", `Unknown block ref: ${target.afterRef}`, operationIndex, { ref: target.afterRef });
    return block;
  }
  issue("INVALID_TARGET", "This operation requires a blockId or ref target", operationIndex);
}

function clearInput(input: Blockly.Input) {
  const child = input.connection?.targetBlock();
  if (!child) return;
  input.connection?.disconnect();
  child.dispose(child.isShadow() ? false : true);
}

function literal(workspace: Blockly.Workspace, value: string | number | boolean, operationIndex: number, inputName: string): Blockly.Block {
  const type = typeof value === "number" ? "math_number" : typeof value === "boolean" ? "logic_boolean" : "text";
  try {
    const block = workspace.newBlock(type);
    const fieldName = type === "math_number" ? "NUM" : type === "logic_boolean" ? "BOOL" : "TEXT";
    block.setFieldValue(type === "logic_boolean" ? (value ? "TRUE" : "FALSE") : String(value), fieldName);
    return block;
  } catch (error) {
    issue("INVALID_INPUT", `Cannot create literal for input ${inputName}: ${error instanceof Error ? error.message : String(error)}`, operationIndex, { blockType: type, inputName });
  }
}

type DeferredField = { block: Blockly.Block; field: Blockly.Field; fieldName: string; value: string; operationIndex: number };

function dropdownRefresher(field: Blockly.Field): ((useCache?: boolean) => Array<[string, string]>) | null {
  const getOptions = (field as Blockly.Field & { getOptions?: (useCache?: boolean) => Array<[string, string]> }).getOptions;
  return typeof getOptions === "function" ? getOptions : null;
}

function dropdownOptionList(field: Blockly.Field): string | null {
  const getOptions = dropdownRefresher(field);
  if (!getOptions) return null;
  try {
    const options = getOptions.call(field, false).map(([label, value]) => (label === value ? String(value) : `${label}(${value})`));
    return options.length ? options.slice(0, 12).join("、") : null;
  } catch {
    return null;
  }
}

function setFields(block: Blockly.Block, fields: Record<string, string | number | boolean> | undefined, operationIndex: number, deferred: Map<Blockly.Field, DeferredField>) {
  for (const [fieldName, value] of Object.entries(fields ?? {})) {
    const field = block.getField(fieldName);
    if (!field) issue("INVALID_FIELD", `积木 ${block.type} 不包含字段 ${fieldName}`, operationIndex, { blockType: block.type, fieldName });
    const normalized = String(value);
    try {
      field.setValue(normalized);
    } catch (error) {
      issue("INVALID_FIELD", `字段 ${fieldName} 的值无效（积木 ${block.type}）：${error instanceof Error ? error.message : String(error)}`, operationIndex, { blockType: block.type, fieldName });
    }
    if (String(field.getValue()) === normalized) {
      deferred.delete(field);
      continue;
    }
    // Dynamic dropdowns (for example Manim object references) only offer values whose
    // dependencies are already connected elsewhere in the workspace. Retry after every
    // operation connected its inputs instead of failing the whole plan on ordering.
    deferred.set(field, { block, field, fieldName, value: normalized, operationIndex });
  }
}

function flushDeferredFields(deferred: Map<Blockly.Field, DeferredField>) {
  for (const entry of deferred.values()) {
    if ((entry.block as { workspace?: Blockly.Workspace | null }).workspace == null) continue;
    try { dropdownRefresher(entry.field)?.call(entry.field, false); } catch { /* keep the previous options */ }
    try { entry.field.setValue(entry.value); } catch { /* reported below */ }
    if (String(entry.field.getValue()) === entry.value) continue;
    const options = dropdownOptionList(entry.field);
    issue(
      "INVALID_FIELD",
      `字段 ${entry.fieldName} 拒绝值“${entry.value}”（积木 ${entry.block.type}）${options ? `；当前可选值：${options}` : ""}。请让该值来自工作区当前可用的选项，或先创建它依赖的积木再设置。`,
      entry.operationIndex,
      { blockType: entry.block.type, fieldName: entry.fieldName },
    );
  }
}

function connectValue(
  block: Blockly.Block,
  inputName: string,
  value: BlockPlanInput,
  refs: Map<string, Blockly.Block>,
  workspace: Blockly.Workspace,
  operationIndex: number,
) {
  const input = block.getInput(inputName);
  if (!input?.connection) issue("INVALID_INPUT", `Block ${block.type} does not contain input ${inputName}`, operationIndex, { blockType: block.type, inputName });
  if (input.type === statementType) issue("CONNECTION_MISMATCH", `Input ${inputName} expects a statement chain`, operationIndex, { blockType: block.type, inputName });
  if (typeof value === "object" && "refs" in value) issue("CONNECTION_MISMATCH", `Input ${inputName} expects one value block`, operationIndex, { blockType: block.type, inputName });
  clearInput(input);
  const child = typeof value === "object" && "ref" in value
    ? refs.get(value.ref)
    : literal(workspace, value, operationIndex, inputName);
  if (!child) issue("UNKNOWN_REF", `Unknown block ref: ${(value as { ref: string }).ref}`, operationIndex, { blockType: block.type, inputName, ref: (value as { ref: string }).ref });
  if (!child.outputConnection) issue("CONNECTION_MISMATCH", `Block ${child.type} has no value output for input ${inputName}`, operationIndex, { blockType: block.type, inputName });
  try {
    input.connection.connect(child.outputConnection);
  } catch (error) {
    issue("CONNECTION_MISMATCH", `Cannot connect ${child.type} to ${block.type}.${inputName}: ${error instanceof Error ? error.message : String(error)}`, operationIndex, { blockType: block.type, inputName });
  }
}

function connectStatements(
  block: Blockly.Block,
  inputName: string,
  refsToConnect: string[],
  refs: Map<string, Blockly.Block>,
  operationIndex: number,
) {
  const input = block.getInput(inputName);
  if (!input?.connection) issue("INVALID_INPUT", `Block ${block.type} does not contain input ${inputName}`, operationIndex, { blockType: block.type, inputName });
  if (input.type !== statementType) issue("CONNECTION_MISMATCH", `Input ${inputName} expects a value block`, operationIndex, { blockType: block.type, inputName });
  clearInput(input);
  let connection: Blockly.Connection = input.connection;
  for (const ref of refsToConnect) {
    const child = refs.get(ref);
    if (!child) issue("UNKNOWN_REF", `Unknown block ref: ${ref}`, operationIndex, { blockType: block.type, inputName, ref });
    if (!child.previousConnection) issue("CONNECTION_MISMATCH", `Block ${child.type} cannot be used in a statement chain`, operationIndex, { blockType: block.type, inputName, ref });
    if (child.getParent()) issue("CONNECTION_MISMATCH", `Block ref ${ref} is already connected`, operationIndex, { blockType: block.type, inputName, ref });
    try {
      connection.connect(child.previousConnection);
    } catch (error) {
      issue("CONNECTION_MISMATCH", `Cannot connect ${child.type} to ${block.type}.${inputName}: ${error instanceof Error ? error.message : String(error)}`, operationIndex, { blockType: block.type, inputName, ref });
    }
    if (child.nextConnection) connection = child.nextConnection;
  }
}

function setInputs(
  block: Blockly.Block,
  inputs: Record<string, BlockPlanInput> | undefined,
  refs: Map<string, Blockly.Block>,
  workspace: Blockly.Workspace,
  operationIndex: number,
) {
  for (const [inputName, value] of Object.entries(inputs ?? {})) {
    if (typeof value === "object" && "refs" in value) connectStatements(block, inputName, value.refs, refs, operationIndex);
    else connectValue(block, inputName, value, refs, workspace, operationIndex);
  }
}

function targetConnection(
  source: Blockly.Block,
  target: BlockPlanTarget,
  refs: Map<string, Blockly.Block>,
  workspace: Blockly.Workspace,
  operationIndex: number,
): { parent: Blockly.Connection; child: Blockly.Connection } {
  if ("afterBlockId" in target || "afterRef" in target) {
    const after = targetBlock(target, refs, workspace, operationIndex);
    if (!after.nextConnection) issue("CONNECTION_MISMATCH", `Block ${after.type} has no next connection`, operationIndex, { blockType: after.type });
    if (!source.previousConnection) issue("CONNECTION_MISMATCH", `Block ${source.type} has no previous connection`, operationIndex, { blockType: source.type });
    return { parent: after.nextConnection, child: source.previousConnection };
  }
  const parent = targetBlock(target, refs, workspace, operationIndex);
  if (!target.inputName) issue("INVALID_TARGET", "inputName is required when connecting to a block", operationIndex, { blockType: parent.type });
  const input = parent.getInput(target.inputName);
  if (!input?.connection) issue("INVALID_INPUT", `Block ${parent.type} does not contain input ${target.inputName}`, operationIndex, { blockType: parent.type, inputName: target.inputName });
  const child = input.type === statementType ? source.previousConnection : source.outputConnection;
  if (!child) issue("CONNECTION_MISMATCH", `Block ${source.type} is incompatible with ${parent.type}.${target.inputName}`, operationIndex, { blockType: parent.type, inputName: target.inputName });
  return { parent: input.connection, child };
}

function applyConnect(
  operation: Extract<BlockPlanOperation, { action: "connect" }>,
  refs: Map<string, Blockly.Block>,
  workspace: Blockly.Workspace,
  operationIndex: number,
) {
  const source = refs.get(operation.from.ref);
  if (!source) issue("UNKNOWN_REF", `Unknown block ref: ${operation.from.ref}`, operationIndex, { ref: operation.from.ref });
  const { parent, child } = targetConnection(source, operation.to, refs, workspace, operationIndex);
  try {
    parent.connect(child);
  } catch (error) {
    issue("CONNECTION_MISMATCH", `Cannot connect ${source.type}: ${error instanceof Error ? error.message : String(error)}`, operationIndex, {
      blockType: source.type,
      inputName: "inputName" in operation.to ? operation.to.inputName : undefined,
    });
  }
}

function applyTargetDelete(target: BlockPlanTarget, refs: Map<string, Blockly.Block>, workspace: Blockly.Workspace, operationIndex: number) {
  const block = targetBlock(target, refs, workspace, operationIndex);
  block.dispose(true);
}

function statementTail(start: Blockly.Block | null): Blockly.Block | null {
  let current = start;
  while (current?.getNextBlock()) current = current.getNextBlock();
  return current;
}

function statementInput(block: Blockly.Block): Blockly.Input | null {
  const statementInputs = block.inputList.filter((input) => input.type === statementType && input.connection);
  return statementInputs.length === 1 ? statementInputs[0]! : null;
}

function statementFreeConnection(block: Blockly.Block): Blockly.Connection | null {
  const input = statementInput(block);
  if (!input?.connection) return null;
  if (!input.connection.isConnected()) return input.connection;
  const tail = statementTail(input.connection.targetBlock());
  return tail?.nextConnection && !tail.nextConnection.isConnected() ? tail.nextConnection : null;
}

function isStatementEntry(block: Blockly.Block, entryTypes: ReadonlySet<string>): boolean {
  if (!statementInput(block)) return false;
  return entryTypes.has(block.type) || (!block.previousConnection && !block.nextConnection);
}

function connectStatementPair(parent: Blockly.Block, child: Blockly.Block): boolean {
  const parentConnection = parent.nextConnection;
  const childConnection = child.previousConnection;
  if (!parentConnection || !childConnection || parentConnection.isConnected() || childConnection.isConnected()) return false;
  if (!parent.workspace.connectionChecker.canConnect(parentConnection, childConnection, false)) return false;
  parentConnection.connect(childConnection);
  return true;
}

function existingStatementTailConnection(workspace: Blockly.Workspace, createdIds: Set<string>, entryTypes: ReadonlySet<string>): Blockly.Connection | null {
  const existingTopBlocks = workspace.getTopBlocks(false).filter((block) => !createdIds.has(block.id));
  const declaredEntries = existingTopBlocks.filter((block) => entryTypes.has(block.type) && Boolean(statementInput(block)));
  if (declaredEntries.length === 1) return statementFreeConnection(declaredEntries[0]!);
  if (declaredEntries.length > 1) return null;
  const chainRoots = existingTopBlocks.filter((block) => Boolean(block.previousConnection));
  if (chainRoots.length === 1) {
    const tail = statementTail(chainRoots[0]!);
    return tail?.nextConnection && !tail.nextConnection.isConnected() ? tail.nextConnection : null;
  }
  const entries = existingTopBlocks.filter((block) => !block.previousConnection && !block.nextConnection && Boolean(statementInput(block)));
  if (entries.length !== 1) return null;
  return statementFreeConnection(entries[0]!);
}

function autoChainCreatedStatements(
  plan: BlockPlan,
  workspace: Blockly.Workspace,
  created: Array<{ block: Blockly.Block; operationIndex: number }>,
  entryTypes: ReadonlySet<string>,
): number {
  const createdIds = new Set(created.map(({ block }) => block.id));
  const roots = created
    .filter(({ block }) => Boolean(block.previousConnection) && !block.getParent() && !isStatementEntry(block, entryTypes))
    .map(({ block }) => block);
  let autoChained = 0;
  for (let index = 1; index < roots.length; index += 1) {
    const previousTail = statementTail(roots[index - 1]!);
    if (previousTail && connectStatementPair(previousTail, roots[index]!)) autoChained += 1;
  }
  const createdEntries = workspace.getTopBlocks(false).filter((block) => createdIds.has(block.id) && isStatementEntry(block, entryTypes));
  const firstCreatedRoot = roots.find((block) => !block.getParent()) || null;
  if (createdEntries.length === 1 && firstCreatedRoot?.previousConnection && !firstCreatedRoot.previousConnection.isConnected()) {
    const free = statementFreeConnection(createdEntries[0]!);
    if (free && workspace.connectionChecker.canConnect(free, firstCreatedRoot.previousConnection, false)) {
      free.connect(firstCreatedRoot.previousConnection);
      autoChained += 1;
    }
  }
  if (roots.length > 0 && (plan.mode === "append" || plan.mode === "patch") && !firstCreatedRoot?.getParent()) {
    const existingConnection = existingStatementTailConnection(workspace, createdIds, entryTypes);
    const first = firstCreatedRoot || roots[0]!;
    if (existingConnection && first.previousConnection && !first.previousConnection.isConnected() && workspace.connectionChecker.canConnect(existingConnection, first.previousConnection, false)) {
      existingConnection.connect(first.previousConnection);
      autoChained += 1;
    }
  }
  return autoChained;
}

function applyOperations(plan: BlockPlan, candidate: Blockly.Workspace, templates: Map<string, BlockTemplate>, entryTypes: ReadonlySet<string>) {
  const refs = new Map<string, Blockly.Block>();
  const created: Array<{ block: Blockly.Block; operationIndex: number }> = [];
  const deferredFields = new Map<Blockly.Field, DeferredField>();
  const createOperations = plan.operations.filter((operation): operation is Extract<BlockPlanOperation, { action: "create" }> => operation.action === "create");
  for (const operation of createOperations) {
    const operationIndex = plan.operations.indexOf(operation);
    const template = templates.get(operation.block);
    if (!template) issue("UNKNOWN_BLOCK", `No registered block template for ${operation.block}`, operationIndex, { blockType: operation.block, ref: operation.ref });
    let block: Blockly.Block | null = null;
    try {
      block = Blockly.serialization.blocks.append(cleanTemplateState(template), candidate);
    } catch (error) {
      issue("UNKNOWN_BLOCK", `Cannot create block ${operation.block}: ${error instanceof Error ? error.message : String(error)}`, operationIndex, { blockType: operation.block, ref: operation.ref });
    }
    if (!block) issue("UNKNOWN_BLOCK", `Cannot create block ${operation.block}`, operationIndex, { blockType: operation.block, ref: operation.ref });
    if (block.type !== operation.block) issue("UNKNOWN_BLOCK", `Template type mismatch for ${operation.block}`, operationIndex, { blockType: operation.block, ref: operation.ref });
    refs.set(operation.ref, block);
    created.push({ block, operationIndex });
    setFields(block, operation.fields, operationIndex, deferredFields);
  }
  for (const [operationIndex, operation] of plan.operations.entries()) {
    if (operation.action === "create") {
      const block = refs.get(operation.ref)!;
      setInputs(block, operation.inputs, refs, candidate, operationIndex);
    } else if (operation.action === "update") {
      const block = targetBlock(operation.target, refs, candidate, operationIndex);
      setFields(block, operation.fields, operationIndex, deferredFields);
      setInputs(block, operation.inputs, refs, candidate, operationIndex);
    } else if (operation.action === "delete") {
      applyTargetDelete(operation.target, refs, candidate, operationIndex);
    } else {
      applyConnect(operation, refs, candidate, operationIndex);
    }
  }
  flushDeferredFields(deferredFields);
  return { refs, autoChained: autoChainCreatedStatements(plan, candidate, created, entryTypes) };
}

export async function compileBlockPlan(plan: BlockPlan, services: BlockPlanCompilerServices, signal: AbortSignal): Promise<BlockPlanCompilation> {
  if (signal.aborted) return { ok: false, changed: false, issues: [{ code: "ABORTED", message: "Agent task stopped" }] };
  const entryTypes = new Set(services.entryBlockTypes ?? []);
  const existingBlocks = services.workspace.getAllBlocks(false).filter((block) => !block.isShadow?.());
  if (plan.mode === "replace" && existingBlocks.length > 0) {
    return {
      ok: false,
      changed: false,
      issues: [{
        code: "REPLACE_NOT_ALLOWED",
        message: `工作区已有 ${existingBlocks.length} 个积木，replace 只允许在空工作区使用，失败不会改动工作区。请改用 append/patch，只提交需要新增或修正的操作；确需整体重建时，请在同一计划里先用 delete 删除根积木（如场景），再重新创建。`,
      }],
    };
  }
  const before = stateOf(services.workspace);
  const candidate = new Blockly.Workspace();
  try {
    if (plan.mode !== "replace") Blockly.serialization.workspaces.load(structuredClone(before), candidate);
    const types = [...new Set(plan.operations.filter((operation): operation is Extract<BlockPlanOperation, { action: "create" }> => operation.action === "create").map((operation) => operation.block))];
    const templates = new Map(services.getBlockTemplates(types).map((template) => [template.type, template]));
    const { refs, autoChained } = applyOperations(plan, candidate, templates, entryTypes);
    if (signal.aborted) return { ok: false, changed: false, issues: [{ code: "ABORTED", message: "Agent task stopped" }] };
    const contextIssues = services.validateContexts(candidate);
    if (contextIssues.length) {
      const refByBlockId = new Map([...refs.entries()].map(([ref, block]) => [block.id, ref]));
      return {
        ok: false,
        changed: false,
        issues: contextIssues.map((entry) => {
          const planRef = entry.blockId ? refByBlockId.get(entry.blockId) : undefined;
          return {
            code: "CONTEXT_VALIDATION_FAILED",
            message: entry.message,
            ...(planRef || entry.blockId ? { ref: planRef ?? entry.blockId } : {}),
            ...(entry.blockType || entry.blockId ? { blockType: entry.blockType || (entry.blockId ? candidate.getBlockById(entry.blockId)?.type : undefined) } : {}),
          };
        }),
      };
    }
    const code = services.generateCode(candidate);
    try {
      await services.validateCode(code);
    } catch (error) {
      return { ok: false, changed: false, issues: [{ code: "CODE_VALIDATION_FAILED", message: error instanceof Error ? error.message : String(error) }] };
    }
    if (signal.aborted) return { ok: false, changed: false, issues: [{ code: "ABORTED", message: "Agent task stopped" }] };
    const after = stateOf(candidate);
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    if (changed) services.commit(after, code);
    return {
      ok: true,
      changed,
      autoChained,
      blockCount: candidate.getAllBlocks(false).length,
      state: after,
      code,
      changedBlockIds: [...refs.values()].map((block) => block.id),
      refIds: Object.fromEntries([...refs.entries()].map(([ref, block]) => [ref, block.id])),
    };
  } catch (error) {
    if (error instanceof PlanCompileError) return { ok: false, changed: false, issues: [error.issue] };
    return { ok: false, changed: false, issues: [{ code: "INVALID_OPERATION", message: error instanceof Error ? error.message : String(error) }] };
  } finally {
    candidate.dispose();
  }
}
