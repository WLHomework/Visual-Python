import type * as Blockly from "blockly/core";

const functionDefinitionTypes = new Set([
  "python_function_def",
  "python_function_structured",
  "python_async_function_structured",
  "python_typed_function_structured",
  "python_async_typed_function_structured",
]);

const functionCallTypes = new Set([
  "python_call",
  "python_call_statement",
  "python_call_structured",
  "python_call_statement_structured",
]);

export type FunctionReferenceGroup = {
  name: string;
  definition: Blockly.Block;
  calls: Blockly.Block[];
};

export type FunctionReferenceIndex = ReadonlyMap<string, FunctionReferenceGroup>;

const normalizedName = (value: unknown) => String(value ?? "").normalize("NFKC").trim();

export const hasBlocklyInsertionMarkerClass = (className: string | null | undefined) =>
  Boolean(className?.split(/\s+/).includes("blocklyInsertionMarker"));

export const isBlocklyInsertionMarkerBlock = (block: Blockly.Block) => {
  if (block.isInsertionMarker()) return true;
  if (!block.rendered) return false;
  const root = (block as Blockly.BlockSvg).getSvgRoot();
  return hasBlocklyInsertionMarkerClass(root.getAttribute("class"))
    || hasBlocklyInsertionMarkerClass(root.parentElement?.getAttribute("class"));
};

const functionName = (block: Blockly.Block) => normalizedName(block.getFieldValue("NAME"));

const callTarget = (block: Blockly.Block) => normalizedName(
  block.getFieldValue(block.type.endsWith("_structured") ? "TARGET" : "NAME"),
);

export const isFunctionDefinitionBlock = (block: Blockly.Block) => functionDefinitionTypes.has(block.type);

export const isFunctionCallBlock = (block: Blockly.Block) => functionCallTypes.has(block.type);

export function buildFunctionReferenceIndex(workspace: Blockly.Workspace): FunctionReferenceIndex {
  const definitions: Blockly.Block[] = [];
  const callsByName = new Map<string, Blockly.Block[]>();

  for (const block of workspace.getAllBlocks(false)) {
    if (isBlocklyInsertionMarkerBlock(block)) continue;
    if (isFunctionDefinitionBlock(block)) {
      definitions.push(block);
      continue;
    }
    if (!isFunctionCallBlock(block)) continue;
    const name = callTarget(block);
    if (!name) continue;
    const calls = callsByName.get(name) ?? [];
    calls.push(block);
    callsByName.set(name, calls);
  }

  const referencesByDefinitionId = new Map<string, FunctionReferenceGroup>();
  for (const definition of definitions) {
    const name = functionName(definition);
    if (!name) continue;
    referencesByDefinitionId.set(definition.id, {
      name,
      definition,
      calls: [...(callsByName.get(name) ?? [])],
    });
  }
  return referencesByDefinitionId;
}

export function findFunctionReferencesForDefinition(
  definition: Blockly.Block,
  index: FunctionReferenceIndex,
): FunctionReferenceGroup | null {
  if (!isFunctionDefinitionBlock(definition)) return null;
  return index.get(definition.id) ?? null;
}
