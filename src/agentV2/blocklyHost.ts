import * as Blockly from "blockly/core";
import type { AgentHost, AgentTool } from "./types";
import type { AiChatToolDefinition } from "../aiConfig";
import type { WorkspaceMode } from "../workspaceMode";
import { hydrateAllDeferredInputs, saveWorkspaceState } from "../pythonBlocks";
import type { BlockCatalogContract, BlockCatalogField, BlockTaskDirectory } from "../blockSearch";
import { BlockPlanValidationError, blockPlanToolSchema, parseBlockPlan } from "./blockPlan";
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
  commit(state: object, code: string): void;
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

const allBlocklyTools: AgentTool[] = [
  { definition: tool("get_workspace", "Read a compact summary of the current graphical workspace. Set includeState=true only when the serialized state is explicitly required.", { includeState: { type: "boolean" } }), label: "读取图形化工作区", workspaceModes: ["visual", "split"] as WorkspaceMode[], readOnly: true },
  { definition: tool("get_task_block_directory", "Return task-relevant toolbox categories and candidate blocks in one batch. Use this before searching individual blocks.", { task: { type: "string", minLength: 1 }, limit: { type: "integer", minimum: 1, maximum: 80 } }), label: "读取任务积木目录", workspaceModes: ["visual", "split"] as WorkspaceMode[], readOnly: true },
  { definition: tool("search_blocks", "Search the registered block catalog only when the task directory cannot identify a required block. Use one broad query instead of repeated single-block searches.", { query: { type: "string", minLength: 1 }, limit: { type: "integer", minimum: 1, maximum: 50 } }), label: "搜索积木", workspaceModes: ["visual", "split"] as WorkspaceMode[], readOnly: true },
  { definition: tool("get_block_templates", "Read the real fields and connection contracts for a batch of required block types. Do not request full Blockly serialization state.", { types: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 50 } }), label: "读取积木模板", workspaceModes: ["visual", "split"] as WorkspaceMode[], readOnly: true },
  { definition: { type: "function", function: { name: "apply_block_plan", description: "The only graphical workspace write operation. Submit a BlockPlan with semantic create, update, delete and connect operations. The host builds and validates it in an isolated workspace, then commits once. Do not submit id, next, shadow, coordinates, or native Blockly state.", parameters: blockPlanToolSchema() } }, label: "应用积木方案", workspaceModes: ["visual", "split"] as WorkspaceMode[], changesState: true, mutation: true },
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
function sceneStatementTail(workspace: Blockly.Workspace) {
  const entries = workspace.getTopBlocks(false).filter(isEntryBlock);
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
    return {
      inputSlots: block.inputList.filter((input) => Boolean(input.connection)).map((input) => ({
        name: input.name,
        kind: input.type === Blockly.inputs.inputTypes.STATEMENT ? "statement" as const : "value" as const,
        ...(input.connection?.getCheck() ? { check: input.connection.getCheck()! } : {}),
      })),
      hasOutputConnection: Boolean(block.outputConnection),
      outputCheck: normalizedCheck(block.outputConnection),
      hasPreviousConnection: Boolean(block.previousConnection),
      previousCheck: normalizedCheck(block.previousConnection),
      hasNextConnection: Boolean(block.nextConnection),
      nextCheck: normalizedCheck(block.nextConnection),
      fields,
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

function invalidPlanResult(error: unknown): Record<string, unknown> {
  if (error instanceof BlockPlanValidationError) return { ok: false, changed: false, issues: [error.issue] };
  return { ok: false, changed: false, issues: [{ code: "INVALID_PLAN", message: error instanceof Error ? error.message : String(error) }] };
}

export function createBlocklyToolExecutor(services: BlocklyAgentServices): AgentHost["executeTool"] {
  return async (name, args, signal) => {
    if (signal.aborted) throw new Error("Agent task stopped");

    if (name === "get_workspace") {
      hydrateAllDeferredInputs(services.workspace);
      const blocks = services.workspace.getAllBlocks(false);
      const selectedBlockId = services.selectedBlockId();
      return {
        blockCount: blocks.length,
        topBlockIds: services.workspace.getTopBlocks(true).map((block) => block.id),
        selectedBlockId,
        selectedBlock: selectedBlockId ? blocks.find((block) => block.id === selectedBlockId) ? blockSummary(blocks.find((block) => block.id === selectedBlockId)!) : null : null,
        statementTail: sceneStatementTail(services.workspace),
        blocks: blocks.slice(0, 200).map(blockSummary),
        code: services.generateCode(services.workspace),
        ...(args.includeState === true ? { workspace: workspaceState(services.workspace) } : {}),
      };
    }

    if (name === "search_blocks") {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      if (!query) throw new Error("query must not be empty");
      const limit = typeof args.limit === "number" && Number.isInteger(args.limit) ? Math.max(1, Math.min(50, args.limit)) : 20;
      return { query, matches: services.searchBlocks(query, limit).map(({ type, label, category }) => ({ type, label, category })) };
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
      return {
        templates: services.getBlockTemplates(types).map((template) => {
          const { state: _state, ...contract } = template;
          return { ...contract, inputSlots: template.inputSlots.length ? template.inputSlots : describeBlocklyBlockInputs(template.type) };
        }),
      };
    }

    if (name === "apply_block_plan") {
      hydrateAllDeferredInputs(services.workspace);
      let plan;
      try {
        plan = parseBlockPlan(args);
      } catch (error) {
        return invalidPlanResult(error);
      }
      const result = await compileBlockPlan(plan, {
        workspace: services.workspace,
        getBlockTemplates: services.getBlockTemplates,
        generateCode: services.generateCode,
        validateContexts: services.validateContexts,
        validateCode: services.validateCode,
        commit: services.commit,
      }, signal);
      const { state: _state, code: _code, ...compact } = result;
      return compact as Record<string, unknown>;
    }

    throw new Error(`Unsupported graphical workspace tool: ${name}`);
  };
}
