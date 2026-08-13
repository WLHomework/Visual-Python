import * as Blockly from "blockly/core";
import { afterEach, describe, expect, it } from "vitest";
import "./pythonBlocks";
import {
  buildFunctionCallPath,
  createFunctionCallForDefinition,
  functionCallLinkEndpoints,
  functionCallLinkMenuMode,
  isLiveFunctionCallLinkRefreshEvent,
  isSettledFunctionCallLinkRefreshEvent,
  surfaceBoundsFromScreenRect,
  surfacePointFromScreenMatrix,
} from "./functionCallLinks";

describe("function call links", () => {
  let workspace: Blockly.Workspace | null = null;

  afterEach(() => {
    workspace?.dispose();
    workspace = null;
  });

  it("connects the definition right edge to the call left edge", () => {
    const endpoints = functionCallLinkEndpoints(
      { x: 20, y: 30, width: 160, height: 48 },
      { x: 430, y: 210, width: 120, height: 40 },
    );

    expect(endpoints).toEqual({ start: { x: 180, y: 54 }, end: { x: 430, y: 230 } });
    expect(buildFunctionCallPath(endpoints)).toBe("M 180 54 C 305 54, 305 230, 430 230");
  });

  it("routes backward references with enough curvature to remain visible", () => {
    const endpoints = functionCallLinkEndpoints(
      { x: 400, y: 220, width: 150, height: 50 },
      { x: 80, y: 40, width: 120, height: 40 },
    );

    expect(buildFunctionCallPath(endpoints)).toBe("M 550 245 C 315 245, 315 60, 80 60");
  });

  it("uses function-name row anchors instead of whole-block centers", () => {
    expect(functionCallLinkEndpoints(
      { x: 20, y: 30, width: 160, height: 96, anchorY: 48 },
      { x: 430, y: 210, width: 120, height: 40, anchorY: 224 },
    )).toEqual({ start: { x: 180, y: 48 }, end: { x: 430, y: 224 } });
  });

  it("reuses the menu action to hide links from the definition or a related call", () => {
    const relatedCallIds = new Set(["call-1", "call-2"]);
    expect(functionCallLinkMenuMode(true, "definition", null, relatedCallIds)).toBe("show");
    expect(functionCallLinkMenuMode(true, "definition", "definition", relatedCallIds)).toBe("hide");
    expect(functionCallLinkMenuMode(false, "call-1", "definition", relatedCallIds)).toBe("hide");
    expect(functionCallLinkMenuMode(false, "other", "definition", relatedCallIds)).toBeNull();
  });

  it("waits for Blockly layout after move and drag-end events", () => {
    expect(isSettledFunctionCallLinkRefreshEvent("move")).toBe(true);
    expect(isSettledFunctionCallLinkRefreshEvent("drag-end")).toBe(true);
    expect(isSettledFunctionCallLinkRefreshEvent("viewport")).toBe(false);
  });

  it("refreshes links live while a block is being dragged", () => {
    expect(isLiveFunctionCallLinkRefreshEvent("drag-start")).toBe(true);
    expect(isLiveFunctionCallLinkRefreshEvent("move")).toBe(true);
    expect(isLiveFunctionCallLinkRefreshEvent("drag-end")).toBe(false);
  });

  it("converts rendered SVG coordinates into the link layer coordinate space", () => {
    expect(surfacePointFromScreenMatrix(
      { x: 240, y: 180 },
      { a: 0.5, b: 0, c: 0, d: 0.5, e: -20, f: -30 },
    )).toEqual({ x: 100, y: 60 });
  });

  it("converts an actual rendered field rectangle into link-layer coordinates", () => {
    expect(surfaceBoundsFromScreenRect(
      { left: 120, top: 180, right: 220, bottom: 214 },
      { a: 1, b: 0, c: 0, d: 1, e: 0, f: -32 },
    )).toEqual({ x: 120, y: 148, width: 100, height: 34 });
  });

  it("creates a statement call for a legacy function definition with a Chinese name", () => {
    workspace = new Blockly.Workspace();
    const definition = workspace.newBlock("python_function_def");
    definition.setFieldValue("计算面积", "NAME");
    definition.setFieldValue("宽度, 高度", "PARAMS");

    const call = createFunctionCallForDefinition(definition);

    expect(call?.type).toBe("python_call_statement_structured");
    expect(call?.getFieldValue("TARGET")).toBe("计算面积");
    expect((call as Blockly.Block & { arguments_?: unknown[] }).arguments_).toEqual([
      { kind: "positional", name: "" },
      { kind: "positional", name: "" },
    ]);
  });

  it("copies only required parameters from a structured function definition", () => {
    workspace = new Blockly.Workspace();
    const definition = workspace.newBlock("python_function_structured") as Blockly.Block & {
      loadExtraState(state: object): void;
    };
    definition.setFieldValue("生成报告", "NAME");
    definition.loadExtraState({ parameters: [
      { kind: "positional", name: "数据" },
      { kind: "default", name: "标题" },
      { kind: "keyword_only", name: "格式" },
      { kind: "kwargs", name: "选项" },
    ] });

    const call = createFunctionCallForDefinition(definition);

    expect(call?.getFieldValue("TARGET")).toBe("生成报告");
    expect((call as Blockly.Block & { arguments_?: unknown[] }).arguments_).toEqual([
      { kind: "positional", name: "" },
      { kind: "keyword", name: "格式" },
    ]);
  });

  it("does not create a normal function call for a method definition", () => {
    workspace = new Blockly.Workspace();
    const method = workspace.newBlock("python_method_structured");

    expect(createFunctionCallForDefinition(method)).toBeNull();
    expect(workspace.getAllBlocks(false)).toEqual([method]);
  });
});
