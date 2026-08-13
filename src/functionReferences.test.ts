import * as Blockly from "blockly/core";
import { afterEach, describe, expect, it } from "vitest";
import "./pythonBlocks";
import {
  buildFunctionReferenceIndex,
  findFunctionReferencesForDefinition,
  hasBlocklyInsertionMarkerClass,
  isFunctionCallBlock,
  isFunctionDefinitionBlock,
} from "./functionReferences";

describe("function references", () => {
  let workspace: Blockly.Workspace | null = null;

  afterEach(() => {
    workspace?.dispose();
    workspace = null;
  });

  it("finds legacy and structured calls for a Chinese function name", () => {
    workspace = new Blockly.Workspace();
    const definition = workspace.newBlock("python_function_structured");
    definition.setFieldValue("计算面积", "NAME");

    const legacyValueCall = workspace.newBlock("python_call");
    legacyValueCall.setFieldValue("计算面积", "NAME");
    const legacyStatementCall = workspace.newBlock("python_call_statement");
    legacyStatementCall.setFieldValue("计算面积", "NAME");
    const structuredValueCall = workspace.newBlock("python_call_structured");
    structuredValueCall.setFieldValue("计算面积", "TARGET");
    const structuredStatementCall = workspace.newBlock("python_call_statement_structured");
    structuredStatementCall.setFieldValue("计算面积", "TARGET");
    const unrelatedCall = workspace.newBlock("python_call_structured");
    unrelatedCall.setFieldValue("其他函数", "TARGET");

    const references = findFunctionReferencesForDefinition(
      definition,
      buildFunctionReferenceIndex(workspace),
    );

    expect(references?.name).toBe("计算面积");
    expect(references?.calls.map((block) => block.id)).toEqual([
      legacyValueCall.id,
      legacyStatementCall.id,
      structuredValueCall.id,
      structuredStatementCall.id,
    ]);
  });

  it("recognizes supported function blocks without treating methods as functions", () => {
    workspace = new Blockly.Workspace();
    const legacyDefinition = workspace.newBlock("python_function_def");
    const asyncDefinition = workspace.newBlock("python_async_function_structured");
    const typedDefinition = workspace.newBlock("python_typed_function_structured");
    const asyncTypedDefinition = workspace.newBlock("python_async_typed_function_structured");
    const methodDefinition = workspace.newBlock("python_method_structured");
    const functionCall = workspace.newBlock("python_call_structured");
    const methodCall = workspace.newBlock("python_method_call_structured");

    expect([
      legacyDefinition,
      asyncDefinition,
      typedDefinition,
      asyncTypedDefinition,
    ].every(isFunctionDefinitionBlock)).toBe(true);
    expect(isFunctionDefinitionBlock(methodDefinition)).toBe(false);
    expect(isFunctionCallBlock(functionCall)).toBe(true);
    expect(isFunctionCallBlock(methodCall)).toBe(false);
  });

  it("ignores Blockly insertion markers created while rearranging a stack", () => {
    workspace = new Blockly.Workspace();
    const definition = workspace.newBlock("python_function_structured");
    definition.setFieldValue("计算面积", "NAME");
    const realCall = workspace.newBlock("python_call_structured");
    realCall.setFieldValue("计算面积", "TARGET");
    const insertionMarker = workspace.newBlock("python_call_structured");
    insertionMarker.setFieldValue("计算面积", "TARGET");
    insertionMarker.setInsertionMarker(true);

    const references = findFunctionReferencesForDefinition(
      definition,
      buildFunctionReferenceIndex(workspace),
    );

    expect(references?.calls.map((block) => block.id)).toEqual([realCall.id]);
  });

  it("recognizes insertion markers represented by the rendered SVG class", () => {
    expect(hasBlocklyInsertionMarkerClass("blocklyBlock blocklyInsertionMarker")).toBe(true);
    expect(hasBlocklyInsertionMarkerClass("blocklyBlock blocklyDragging")).toBe(false);
    expect(hasBlocklyInsertionMarkerClass(null)).toBe(false);
  });
});
