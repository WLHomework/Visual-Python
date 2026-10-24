import * as Blockly from "blockly/core";
import type { AgentHost, AgentTool } from "./types";
import type { AiChatToolDefinition } from "../aiConfig";
import type { WorkspaceMode } from "../workspaceMode";
import { hydrateAllDeferredInputs, saveWorkspaceState } from "../pythonBlocks";
import { getRequiredInputNames } from "../pythonSyntaxBlocks";
import type { BlockCatalogContract, BlockCatalogField, BlockTaskDirectory } from "../blockSearch";
import { BlockPlanValidationError, parseBlockPlan, type BlockPlan } from "./blockPlan";
import { blockTreeToPlan, blockTreeToolSchema, parseBlockTree } from "./blockTree";
import { compileBlockPlan } from "./blockPlanCompiler";

export type BlockInputSlot = { name: string; kind: "statement" | "value"; check?: string[] };
export type BlockFieldDescription = BlockCatalogField;
export type BlockTemplate = {
  type: string;
  label: string;
  category: string;
  state: Record<string, unknown>;
  inputSlots: BlockInputSlot[];
  outputCheck?: string[] | null;
  previousCheck?: string[] | null;
  nextCheck?: string[] | null;
  fields?: BlockFieldDescription[];
  requiredInputs?: string[];
  optionalValueInputs?: string[];
};

type ContextIssue = { blockId?: string; message: string };
export type BlocklyAgentServices = {
  workspace: Blockly.Workspace;
  selectedBlockId: () => string | null;
  getTaskBlockDirectory?: (task: string, limit?: number) => BlockTaskDirectory;
  searchBlocks(query: string, limit: number): BlockTemplate[];
  getBlockTemplates(types: string[]): BlockTemplate[];
  generateCode(workspace: Blockly.Workspace): string;
  validateContexts(workspace: Blockly.Workspace): ContextIssue[];
  validateCode(code: string): Promise<void>;
  convertPythonToWorkspace?: (code: string) => object;
  commit(state: object, code: string): void;
  entryBlockTypes?: string[];
};

const objectSchema = (properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});
const tool = (name: string, description: string, parameters: Record<string, unknown> = {}): AiChatToolDefinition => ({
  type: "function",
  function: { name, description, parameters: objectSchema(parameters) },
});

export const pythonToBlocksAgentTool: AgentTool = {
  definition: {
    type: "function",
    function: {
      name: "apply_python_as_blocks",
      description: "Preferred graphical write path (code-first). Submit one complete Python (Manim workbench) or MicroPython (hardware workbench) program; the host deterministically converts it to real Blockly blocks, validates the workspace and generated code in isolation, and commits once. Call this before any block directory/search tools; only fall back to apply_block_program after conversion fails or returns fallbackCount > 0. This is a block-generation tool, not the pure-code editor: use it even when the user asks for blocks only. Do not also call apply_block_program for the same program.",
      parameters: {
        type: "object",
        properties: {
          version: { const: 1 },
          mode: { const: "replace" },
          summary: { type: "string", maxLength: 240 },
          code: { type: "string", minLength: 1, maxLength: 50000 },
        },
        required: ["version", "mode", "code"],
        additionalProperties: false,
      },
    },
  },
  label: "代码转积木",
  workspaceModes: ["visual", "split"] as WorkspaceMode[],
  changesState: true,
  mutation: true,
};

const allBlocklyTools: AgentTool[] = [
  { definition: tool("get_workspace", "Read a compact summary of the current graphical workspace. Set includeState=true only when the serialized state is explicitly required.", { includeState: { type: "boolean" } }), label: "读取图形化工作区", workspaceModes: ["visual", "split"] as WorkspaceMode[], readOnly: true },
  { definition: tool("get_task_block_directory", "Return task-relevant toolbox categories and candidate blocks in one batch, each with its field, input and required-input contract. Use this before searching individual blocks.", { task: { type: "string", minLength: 1 }, limit: { type: "integer", minimum: 1, maximum: 80 } }), label: "读取任务积木目录", workspaceModes: ["visual", "split"] as WorkspaceMode[], readOnly: true },
  { definition: tool("search_blocks", "Search the registered block catalog only when the task directory cannot identify a required block. Returns type, label, category and field/connection contracts. Use one broad query instead of repeated single-block searches.", { query: { type: "string", minLength: 1 }, limit: { type: "integer", minimum: 1, maximum: 50 } }), label: "搜索积木", workspaceModes: ["visual", "split"] as WorkspaceMode[], readOnly: true },
  { definition: tool("get_block_templates", "Read the real fields, input slots, required inputs and connection contracts for a batch of required block types. Reports notFound for types outside the toolbox. Do not request full Blockly serialization state.", { types: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 50 } }), label: "读取积木模板", workspaceModes: ["visual", "split"] as WorkspaceMode[], readOnly: true },
  { definition: { type: "function", function: { name: "apply_block_program", description: "Graphical workspace write operation using a nested program tree (fallback when code conversion via apply_python_as_blocks fails or returns fallbackCount > 0, or for structures only expressible as blocks). Submit a complete nested BlockProgram using type, fields, values, statements and optional next. The host creates real block templates, fills defaults, connects statement chains, applies mutations/shadow values and validates in an isolated workspace before committing once. Do not submit id, shadow, coordinates, refs, connect operations or raw Blockly state. Use this for new programs, whole scenes, plugin blocks and patches that add or replace blocks.", parameters: blockTreeToolSchema() } }, label: "应用积木程序", workspaceModes: ["visual", "split"] as WorkspaceMode[], changesState: true, mutation: true },
  pythonToBlocksAgentTool,
];
export const blocklyAgentTools: AgentTool[] = allBlocklyTools;
export const allBlocklyToolNames = blocklyAgentTools.map((candidate) => candidate.definition.function.name);

const checkedArray = (value: unknown, name: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value;
};
const blockSummary = (block: Blockly.Block) => ({
  id: block.id,
  type: block.type,
  label: block.toString(100, "").replace(/\s+/g, " ").trim(),
  fields: Object.fromEntries(block.inputList.flatMap((input) => input.fieldRow).map((field) => [field.name, field.getValue()]).filter(([name]) => Boolean(name))),
  parentId: block.getParent()?.id ?? null,
  nextId: block.getNextBlock()?.id ?? null,
});
const workspaceState = (workspace: Blockly.Workspace) => saveWorkspaceState(workspace);

function lastStatementBlock(start: Blockly.Block | null) {
  let current = start;
  while (current?.getNextBlock()) current = current.getNextBlock();
  return current;
}
function isEntryBlock(block: Blockly.Block) {
  return !block.previousConnection && !block.nextConnection
    && block.inputList.some((input) => input.type === Blockly.inputs.inputTypes.STATEMENT);
}
function statementEntryBlocks(workspace: Blockly.Workspace, entryBlockTypes: readonly string[] = []): Blockly.Block[] {
  const topBlocks = workspace.getTopBlocks(false);
  const entryTypes = new Set(entryBlockTypes);
  const declared = topBlocks.filter((block) => entryTypes.has(block.type)
    && block.inputList.some((input) => input.type === Blockly.inputs.inputTypes.STATEMENT));
  return declared.length ? declared : topBlocks.filter(isEntryBlock);
}
function sceneStatementTail(workspace: Blockly.Workspace, entryBlockTypes: readonly string[] = []) {
  const entries = statementEntryBlocks(workspace, entryBlockTypes);
  if (entries.length !== 1) return null;
  const scene = entries[0];
  if (!scene) return null;
  const statementInput = scene.inputList.find((input) => input.type === Blockly.inputs.inputTypes.STATEMENT);
  if (!statementInput) return null;
  const last = lastStatementBlock(statementInput.connection?.targetBlock() ?? null);
  return {
    sceneId: scene.id,
    sceneName: String(scene.getFieldValue("NAME") || scene.getFieldValue("name") || scene.type),
    inputName: statementInput.name,
    lastBlockId: last?.id ?? null,
  };
}
function normalizedCheck(connection: Blockly.Connection | null | undefined): string[] | null {
  return connection?.getCheck() ?? null;
}

export function describeBlocklyBlockContract(type: string, state?: Record<string, unknown>, workspace?: Blockly.Workspace): BlockCatalogContract {
  const ownsWorkspace = !workspace;
  const previewWorkspace = workspace ?? new Blockly.Workspace();
  let block: Blockly.Block | null = null;
  try {
    if (state) {
      const serialized = structuredClone(state);
      delete serialized.kind;
      delete serialized.gap;
      block = Blockly.serialization.blocks.append(serialized as unknown as Blockly.serialization.blocks.State, previewWorkspace);
    } else {
      block = previewWorkspace.newBlock(type);
    }
    const fields: BlockFieldDescription[] = block.inputList.flatMap((input) => input.fieldRow)
      .filter((field) => Boolean(field.name))
      .map((field) => {
        const value = field.getValue();
        const description: BlockFieldDescription = {
          name: field.name ?? "",
          value: typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null,
          text: field.getText(),
        };
        const getOptions = (field as Blockly.Field & { getOptions?: () => Array<[string, string]> }).getOptions;
        if (typeof getOptions === "function") {
          try {
            description.options = getOptions.call(field).map(([label, optionValue]) => ({ label, value: optionValue }));
          } catch {
            // Dynamic dropdowns may need a live workspace.
          }
        }
        return description;
      });
    const inputSlots: BlockInputSlot[] = block.inputList.filter((input) => Boolean(input.connection)).map((input) => ({
      name: input.name,
      kind: input.type === Blockly.inputs.inputTypes.STATEMENT ? "statement" as const : "value" as const,
      ...(input.connection?.getCheck() ? { check: input.connection.getCheck()! } : {}),
    }));
    const requiredInputs = getRequiredInputNames(block);
    return {
      inputSlots,
      hasOutputConnection: Boolean(block.outputConnection),
      outputCheck: normalizedCheck(block.outputConnection),
      hasPreviousConnection: Boolean(block.previousConnection),
      previousCheck: normalizedCheck(block.previousConnection),
      hasNextConnection: Boolean(block.nextConnection),
      nextCheck: normalizedCheck(block.nextConnection),
      fields,
      requiredInputs,
      optionalValueInputs: inputSlots.filter((input) => input.kind === "value" && !requiredInputs.includes(input.name)).map((input) => input.name),
    };
  } catch {
    return { inputSlots: [], hasOutputConnection: false, outputCheck: null, hasPreviousConnection: false, previousCheck: null, hasNextConnection: false, nextCheck: null, fields: [] };
  } finally {
    block?.dispose(false);
    if (ownsWorkspace) previewWorkspace.dispose();
  }
}

export function describeBlocklyBlockInputs(type: string): BlockInputSlot[] {
  return describeBlocklyBlockContract(type).inputSlots;
}

function templateContract({ state: _state, ...template }: BlockTemplate): Omit<BlockTemplate, "state"> {
  const needsInputSlots = !template.inputSlots?.length;
  const needsRequiredInputs = !template.requiredInputs?.length;
  const needsOptionalInputs = template.optionalValueInputs === undefined;
  if (!needsInputSlots && !needsRequiredInputs && !needsOptionalInputs) return { ...template };
  const contract = describeBlocklyBlockContract(template.type);
  const inputSlots = needsInputSlots ? contract.inputSlots : template.inputSlots!;
  const requiredInputs = needsRequiredInputs ? contract.requiredInputs ?? [] : template.requiredInputs!;
  return { ...template, inputSlots, ...(requiredInputs.length ? { requiredInputs } : {}), optionalValueInputs: template.optionalValueInputs ?? contract.optionalValueInputs ?? [] };
}

function invalidPlanResult(error: unknown): Record<string, unknown> {
  if (error instanceof BlockPlanValidationError) return { ok: false, changed: false, issues: [error.issue] };
  return { ok: false, changed: false, issues: [{ code: "INVALID_PLAN", message: error instanceof Error ? error.message : String(error) }] };
}

function rawStatementCount(state: unknown): number {
  if (Array.isArray(state)) return state.reduce<number>((total, item) => total + rawStatementCount(item), 0);
  if (!state || typeof state !== "object") return 0;
  const record = state as Record<string, unknown>;
  const own = record.type === "python_raw_statement" ? 1 : 0;
  return own + Object.values(record).reduce<number>((total, value) => total + rawStatementCount(value), 0);
}

export function createBlocklyToolExecutor(services: BlocklyAgentServices): AgentHost["executeTool"] {
  return async (name, args, signal) => {
    if (signal.aborted) throw new Error("Agent task stopped");

    const compilePlan = async (plan: BlockPlan, options: { allowReplace?: boolean } = {}) => {
      hydrateAllDeferredInputs(services.workspace);
      const result = await compileBlockPlan(plan, {
        workspace: services.workspace,
        getBlockTemplates: services.getBlockTemplates,
        generateCode: services.generateCode,
        validateContexts: services.validateContexts,
        validateCode: services.validateCode,
        commit: services.commit,
        entryBlockTypes: services.entryBlockTypes,
        allowReplace: options.allowReplace,
      }, signal);
      const { state: _state, code: _code, ...compact } = result;
      if (compact.ok === false && Array.isArray(compact.issues)) {
        const types = [...new Set(compact.issues.flatMap((issue) => {
          if (!issue || typeof issue !== "object") return [];
          const blockType = (issue as Record<string, unknown>).blockType;
          return typeof blockType === "string" && blockType ? [blockType] : [];
        }))].slice(0, 12);
        if (types.length) return { ...compact, contracts: services.getBlockTemplates(types).map(templateContract) };
      }
      return compact as Record<string, unknown>;
    };

    if (name === "get_workspace") {
      hydrateAllDeferredInputs(services.workspace);
      const blocks = services.workspace.getAllBlocks(false);
      const selectedBlockId = services.selectedBlockId();
      return {
        blockCount: blocks.length,
        topBlockIds: services.workspace.getTopBlocks(true).map((block) => block.id),
        selectedBlockId,
        selectedBlock: selectedBlockId ? blocks.find((block) => block.id === selectedBlockId) ? blockSummary(blocks.find((block) => block.id === selectedBlockId)!) : null : null,
        statementTail: sceneStatementTail(services.workspace, services.entryBlockTypes),
        blocks: blocks.slice(0, 200).map(blockSummary),
        code: services.generateCode(services.workspace),
        ...(args.includeState === true ? { workspace: workspaceState(services.workspace) } : {}),
      };
    }

    if (name === "search_blocks") {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      if (!query) throw new Error("query must not be empty");
      const limit = typeof args.limit === "number" && Number.isInteger(args.limit) ? Math.max(1, Math.min(50, args.limit)) : 20;
      return { query, matches: services.searchBlocks(query, limit).map(templateContract) };
    }

    if (name === "get_task_block_directory") {
      const task = typeof args.task === "string" ? args.task.trim() : "";
      if (!task) throw new Error("task must not be empty");
      const limit = typeof args.limit === "number" && Number.isInteger(args.limit) ? Math.max(1, Math.min(80, args.limit)) : 40;
      if (!services.getTaskBlockDirectory) throw new Error("Task block directory is not available");
      return services.getTaskBlockDirectory(task, limit) as unknown as Record<string, unknown>;
    }

    if (name === "get_block_templates") {
      const types = checkedArray(args.types, "types").filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
      if (!types.length || types.length > 50) throw new Error("types must contain 1 to 50 block types");
      const templates = services.getBlockTemplates(types).map(templateContract);
      const found = new Set(templates.map((template) => template.type));
      const notFound = [...new Set(types)].filter((type) => !found.has(type));
      return { templates, ...(notFound.length ? { notFound } : {}) };
    }

    if (name === "apply_python_as_blocks") {
      if (!services.convertPythonToWorkspace) return { ok: false, changed: false, issues: [{ code: "INVALID_OPERATION", message: "当前工程没有可用的 Python→积木转换器" }] };
      if (args.version !== undefined && args.version !== 1 && args.version !== "1") return { ok: false, changed: false, issues: [{ code: "INVALID_PLAN", message: "version 必须为 1" }] };
      if (args.mode !== undefined && args.mode !== "replace") return { ok: false, changed: false, issues: [{ code: "INVALID_OPERATION", message: "代码转积木当前只支持 mode=replace" }] };
      if (typeof args.code !== "string" || !args.code.trim()) return { ok: false, changed: false, issues: [{ code: "INVALID_INPUT", message: "code 不能为空" }] };
      if (args.code.length > 50_000) return { ok: false, changed: false, issues: [{ code: "INVALID_INPUT", message: "code 不能超过 50000 个字符" }] };
      try {
        await services.validateCode(args.code);
        const converted = services.convertPythonToWorkspace(args.code);
        const candidate = new Blockly.Workspace();
        try {
          Blockly.serialization.workspaces.load(converted as Parameters<typeof Blockly.serialization.workspaces.load>[0], candidate);
          const contextIssues = services.validateContexts(candidate);
          if (contextIssues.length) {
            return { ok: false, changed: false, issues: contextIssues.map((issue) => ({ code: "CONTEXT_VALIDATION_FAILED", message: issue.message, ...(issue.blockId ? { blockId: issue.blockId } : {}) })) };
          }
          const generatedCode = services.generateCode(candidate);
          await services.validateCode(generatedCode);
          const before = Blockly.serialization.workspaces.save(services.workspace);
          const after = Blockly.serialization.workspaces.save(candidate);
          const changed = JSON.stringify(before) !== JSON.stringify(after);
          if (changed) services.commit(after, generatedCode);
          return {
            ok: true,
            changed,
            blockCount: candidate.getAllBlocks(false).length,
            sourceLines: args.code.split("\n").length,
            fallbackCount: rawStatementCount(after),
            ...(rawStatementCount(after) ? { warnings: [`${rawStatementCount(after)} 条语句使用了原始语句积木，请检查是否仍有对应积木`] } : {}),
          };
        } finally {
          candidate.dispose();
        }
      } catch (error) {
        return invalidPlanResult(error);
      }
    }

    if (name === "apply_block_program" || name === "apply_block_tree") {
      try {
        return await compilePlan(blockTreeToPlan(parseBlockTree(args)), { allowReplace: true });
      } catch (error) {
        return invalidPlanResult(error);
      }
    }

    if (name === "apply_block_plan") {
      let plan: BlockPlan;
      try {
        plan = parseBlockPlan(args);
      } catch (error) {
        return invalidPlanResult(error);
      }
      return compilePlan(plan);
    }

    throw new Error(`Unsupported graphical workspace tool: ${name}`);
  };
}
