import * as Blockly from "blockly/core";
import type { AgentHost } from "./types";
import type { AiChatToolDefinition } from "../aiConfig";
import type { AgentTool } from "./types";
import type { WorkspaceMode } from "../workspaceMode";
import { hydrateAllDeferredInputs, saveWorkspaceState } from "../pythonBlocks";

export type BlockInputSlot = {
  name: string;
  kind: "statement" | "value";
  check?: string[];
};

export type BlockTemplate = {
  type: string;
  label: string;
  category: string;
  state: Record<string, unknown>;
  inputSlots: BlockInputSlot[];
};
type ContextIssue = { blockId?: string; message: string };

export type BlocklyAgentServices = {
  workspace: Blockly.Workspace;
  selectedBlockId: () => string | null;
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

export const blocklyAgentTools: AgentTool[] = [
  { definition: tool("get_workspace", "读取当前图形化工作区摘要、选中积木和生成的 Python 代码。需要完整序列化状态时传 includeState=true。", { includeState: { type: "boolean" } }), label: "读取图形化工作区", workspaceModes: ["visual", "split"] as WorkspaceMode[], readOnly: true },
  { definition: tool("search_blocks", "按中文名称或积木类型搜索当前工具箱中的可用积木。", { query: { type: "string", minLength: 1 }, limit: { type: "integer", minimum: 1, maximum: 50 } }), label: "搜索积木", workspaceModes: ["visual", "split"] as WorkspaceMode[], readOnly: true },
  { definition: tool("get_block_templates", "读取指定积木类型的真实 Blockly 模板，先搜索积木再调用此工具。", { types: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 50 } }), label: "读取积木模板", workspaceModes: ["visual", "split"] as WorkspaceMode[], readOnly: true },
  { definition: tool("add_workspace_block", "逐个创建一个 Blockly 积木并立即连接。通过 parentBlockId 和 inputName 连接到输入槽，或通过 afterBlockId 接入语句链。不要一次提交一批断开的积木。", { block: { type: "object", description: "单个 Blockly 序列化积木状态" }, parentBlockId: { type: "string" }, inputName: { type: "string" }, afterBlockId: { type: "string" } }), label: "逐个添加积木", workspaceModes: ["visual", "split"] as WorkspaceMode[], changesState: true, mutation: true },
  { definition: tool("apply_workspace", "事务性修改图形化工作区。候选工作区会先检查积木连接和 Python 语法，全部通过后才提交。", { mode: { type: "string", enum: ["replace", "append", "patch"] }, blocks: { type: "array", maxItems: 200 }, fieldUpdates: { type: "array" }, deleteBlockIds: { type: "array", items: { type: "string" } } }), label: "修改图形化工作区", workspaceModes: ["visual", "split"] as WorkspaceMode[], changesState: true, mutation: true },
];

const checkedArray = (value: unknown, name: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${name} 必须是数组`);
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

export function describeBlocklyBlockInputs(type: string): BlockInputSlot[] {
  const previewWorkspace = new Blockly.Workspace();
  try {
    const block = previewWorkspace.newBlock(type);
    return block.inputList
      .filter((input) => Boolean(input.connection))
      .map((input) => ({
        name: input.name,
        kind: input.type === Blockly.inputs.inputTypes.STATEMENT ? "statement" as const : "value" as const,
        ...(input.connection?.getCheck() ? { check: input.connection.getCheck()! } : {}),
      }));
  } catch {
    return [];
  } finally {
    previewWorkspace.dispose();
  }
}

function submittedBlockTypes(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => submittedBlockTypes(item));
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const type = typeof record.type === "string" ? [record.type] : [];
  const nested = [record.block, record.shadow, record.next, record.inputs]
    .flatMap((item) => submittedBlockTypes(item));
  return [...type, ...nested];
}

function formatBlocklyConnectionError(error: unknown, submittedBlocks: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const missingMatch = message.match(/missing a\(n\)\s+([A-Za-z_][A-Za-z0-9_]*)\s+connection/i);
  if (!missingMatch) return message;

  const missingInput = missingMatch[1];
  const blockType = submittedBlockTypes(submittedBlocks).find((type) => {
    const slots = describeBlocklyBlockInputs(type);
    return slots.length > 0 && !slots.some((slot) => slot.name === missingInput);
  });
  const slots = blockType ? describeBlocklyBlockInputs(blockType) : [];
  const available = slots.map((slot) => `${slot.name}（${slot.kind === "statement" ? "语句" : "值"}）`).join("、");
  if (blockType === "visual_python_turtle_program" && missingInput === "DO") {
    return "Turtle 连接无效：海龟绘图程序入口没有 DO 输入，入口的语句槽是 BODY。请把普通绘图积木连接到 BODY；DO 只用于按键、画布点击和海龟点击事件积木。";
  }
  return `积木连接无效：${blockType ? `积木 ${blockType} ` : "当前积木 "}没有 ${missingInput} 输入槽。可用输入槽：${available || "请先调用 get_block_templates 读取真实模板"}。请按模板中的 inputSlots 重新连接。`;
}

export function createBlocklyToolExecutor(services: BlocklyAgentServices): AgentHost["executeTool"] {
  return async (name, args, signal) => {
    if (signal.aborted) throw new Error("已停止生成");

    if (name === "get_workspace") {
      hydrateAllDeferredInputs(services.workspace);
      const blocks = services.workspace.getAllBlocks(false);
      const selectedBlockId = services.selectedBlockId();
      return {
        blockCount: blocks.length,
        topBlockIds: services.workspace.getTopBlocks(true).map((block) => block.id),
        selectedBlockId,
        selectedBlock: selectedBlockId ? blocks.find((block) => block.id === selectedBlockId) ? blockSummary(blocks.find((block) => block.id === selectedBlockId)!) : null : null,
        blocks: blocks.slice(0, 200).map(blockSummary),
        code: services.generateCode(services.workspace),
        ...(args.includeState === true ? { workspace: workspaceState(services.workspace) } : {}),
      };
    }

    if (name === "search_blocks") {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      if (!query) throw new Error("query 不能为空");
      const limit = typeof args.limit === "number" && Number.isInteger(args.limit) ? Math.max(1, Math.min(50, args.limit)) : 20;
      return { query, matches: services.searchBlocks(query, limit) };
    }

    if (name === "get_block_templates") {
      const types = checkedArray(args.types, "types").filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
      if (!types.length || types.length > 50) throw new Error("types 必须包含 1 到 50 个积木类型");
      return {
        templates: services.getBlockTemplates(types).map((template) => ({
          ...template,
          inputSlots: template.inputSlots.length ? template.inputSlots : describeBlocklyBlockInputs(template.type),
        })),
      };
    }

    if (name === "add_workspace_block") {
      hydrateAllDeferredInputs(services.workspace);
      const blockValue = args.block;
      if (!blockValue || typeof blockValue !== "object" || Array.isArray(blockValue)) throw new Error("block 必须是单个 Blockly 积木状态对象");
      const blockState = structuredClone(blockValue) as Blockly.serialization.blocks.State;
      if (typeof blockState.type !== "string" || !blockState.type.trim()) throw new Error("block.type 必须是有效的积木类型");
      const parentBlockId = args.parentBlockId === undefined ? "" : String(args.parentBlockId).trim();
      const inputName = args.inputName === undefined ? "" : String(args.inputName).trim();
      const afterBlockId = args.afterBlockId === undefined ? "" : String(args.afterBlockId).trim();
      if (parentBlockId && afterBlockId) throw new Error("parentBlockId 和 afterBlockId 只能选择一个");
      if (parentBlockId && !inputName) throw new Error("通过 parentBlockId 连接时必须提供 inputName");
      if (!parentBlockId && inputName) throw new Error("没有 parentBlockId 时不能单独提供 inputName");

      const before = workspaceState(services.workspace);
      const candidate = new Blockly.Workspace();
      try {
        Blockly.serialization.workspaces.load(structuredClone(before), candidate);
        const parent = parentBlockId ? candidate.getBlockById(parentBlockId) : null;
        if (parentBlockId && !parent) throw new Error(`找不到父积木：${parentBlockId}`);
        const after = afterBlockId ? candidate.getBlockById(afterBlockId) : null;
        if (afterBlockId && !after) throw new Error(`找不到顺序积木：${afterBlockId}`);

        let targetConnection: Blockly.Connection | null = null;
        if (parent) {
          const input = parent.getInput(inputName);
          if (!input?.connection) {
            const available = describeBlocklyBlockInputs(parent.type).map((slot) => slot.name).join("、") || "无";
            throw new Error(`积木 ${parent.type} 没有 ${inputName} 输入槽。可用输入槽：${available}`);
          }
          const existing = input.connection.targetBlock();
          if (existing && !existing.isShadow()) throw new Error(`输入槽 ${inputName} 已经连接积木，不能覆盖现有内容`);
          targetConnection = input.connection;
        } else if (after) {
          if (!after.nextConnection) throw new Error(`积木 ${after.type} 没有后续连接槽`);
          if (after.nextConnection.targetBlock()) throw new Error(`积木 ${afterBlockId} 的后续连接槽已经被占用`);
          targetConnection = after.nextConnection;
        }

        const inserted = Blockly.serialization.blocks.append(blockState, candidate);
        if (!inserted) throw new Error("Blockly 没有创建出新积木");
        if (targetConnection) {
          const isStatementInput = parent?.getInput(inputName)?.type === Blockly.inputs.inputTypes.STATEMENT;
          const connection = isStatementInput || after ? inserted.previousConnection : inserted.outputConnection;
          if (!connection) throw new Error(`积木 ${inserted.type} 不能连接到指定位置`);
          targetConnection.connect(connection);
        }

        const blockCount = candidate.getAllBlocks(false).length;
        if (blockCount > 1000) throw new Error("工作区积木数量不能超过 1000");
        const issues = services.validateContexts(candidate);
        if (issues.length) throw new Error(`积木连接检查未通过：${issues.map((issue) => issue.message).join("；")}`);
        const code = services.generateCode(candidate);
        await services.validateCode(code);
        if (signal.aborted) throw new Error("已停止生成");
        const afterState = workspaceState(candidate);
        const changed = JSON.stringify(before) !== JSON.stringify(afterState);
        if (changed) services.commit(afterState, code);
        const committedBlock = candidate.getBlockById(inserted.id) || inserted;
        return { ok: true, changed, block: blockSummary(committedBlock), blockCount, code };
      } catch (error) {
        throw new Error(formatBlocklyConnectionError(error, blockValue));
      } finally {
        candidate.dispose();
      }
    }

    if (name === "apply_workspace") {
      const mode = args.mode;
      if (mode !== "replace" && mode !== "append" && mode !== "patch") throw new Error("mode 必须是 replace、append 或 patch");
      const before = workspaceState(services.workspace);
      const candidate = new Blockly.Workspace();
      try {
        if (mode !== "replace") Blockly.serialization.workspaces.load(structuredClone(before), candidate);
        if (mode === "replace" || mode === "append") {
          const blocks = checkedArray(args.blocks, "blocks");
          if (!blocks.length || blocks.length > 200) throw new Error("blocks 必须包含 1 到 200 个顶层积木");
          if (mode === "replace") Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: structuredClone(blocks) } }, candidate);
          else for (const block of blocks) Blockly.serialization.blocks.append(structuredClone(block) as Blockly.serialization.blocks.State, candidate);
        }
        if (mode === "patch") {
          const updates = args.fieldUpdates === undefined ? [] : checkedArray(args.fieldUpdates, "fieldUpdates");
          const deletes = args.deleteBlockIds === undefined ? [] : checkedArray(args.deleteBlockIds, "deleteBlockIds");
          if (!updates.length && !deletes.length) throw new Error("patch 至少需要一个字段更新或删除操作");
          for (const candidateUpdate of updates) {
            if (!candidateUpdate || typeof candidateUpdate !== "object" || Array.isArray(candidateUpdate)) throw new Error("fieldUpdates 格式无效");
            const update = candidateUpdate as Record<string, unknown>;
            const blockId = typeof update.blockId === "string" ? update.blockId : "";
            const block = candidate.getBlockById(blockId);
            if (!block) throw new Error(`积木不存在：${blockId}`);
            if (!update.fields || typeof update.fields !== "object" || Array.isArray(update.fields)) throw new Error(`积木 ${blockId} 的 fields 格式无效`);
            for (const [fieldName, value] of Object.entries(update.fields as Record<string, unknown>)) {
              if (!block.getField(fieldName)) throw new Error(`积木 ${blockId} 不包含字段 ${fieldName}`);
              block.setFieldValue(value as string | number, fieldName);
            }
          }
          for (const blockId of deletes) {
            if (typeof blockId !== "string") throw new Error("deleteBlockIds 必须是字符串数组");
            const block = candidate.getBlockById(blockId);
            if (!block) throw new Error(`积木不存在：${blockId}`);
            block.dispose(true);
          }
        }
        const blockCount = candidate.getAllBlocks(false).length;
        if (blockCount > 1000) throw new Error("工作区积木数量不能超过 1000");
        const issues = services.validateContexts(candidate);
        if (issues.length) throw new Error(`积木连接检查未通过：${issues.map((issue) => issue.message).join("；")}`);
        const code = services.generateCode(candidate);
        await services.validateCode(code);
        if (signal.aborted) throw new Error("已停止生成");
        const after = workspaceState(candidate);
        const changed = JSON.stringify(before) !== JSON.stringify(after);
        if (changed) services.commit(after, code);
        return { ok: true, changed, blockCount, code, workspace: after };
      } catch (error) {
        throw new Error(formatBlocklyConnectionError(error, args.blocks));
      } finally {
        candidate.dispose();
      }
    }

    throw new Error(`未实现图形化工作区工具：${name}`);
  };
}
