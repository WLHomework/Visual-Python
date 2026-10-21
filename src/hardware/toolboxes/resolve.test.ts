import { describe, expect, it } from "vitest";
import type * as Blockly from "blockly/core";
import { resolveBoardToolbox } from "./resolve";
import type { BoardToolboxSpec, ToolboxCategorySpec, ToolboxEntry, ToolboxEntryIndex } from "./types";

const logicCompare: ToolboxEntry = {
  kind: "block",
  type: "logic_compare",
  inputs: { A: { shadow: { type: "math_number", fields: { NUM: 0 } } } },
};
const controlsIf: ToolboxEntry = {
  kind: "block",
  type: "controls_if",
  inputs: { IF0: { shadow: { type: "logic_boolean", fields: { BOOL: "TRUE" } } } },
};
const listEntry: ToolboxEntry = {
  kind: "block",
  type: "python_sequence_collection",
  fields: { KIND: "list" },
  extraState: { itemCount: 3 },
};
const tupleEntry: ToolboxEntry = {
  kind: "block",
  type: "python_sequence_collection",
  fields: { KIND: "tuple" },
  extraState: { itemCount: 2 },
};
const countEntry: ToolboxEntry = { kind: "block", type: "python_sequence_query", fields: { METHOD: "count" } };
const indexEntry: ToolboxEntry = { kind: "block", type: "python_sequence_query", fields: { METHOD: "index" } };
const variablesCategory = { kind: "category", name: "变量", categorystyle: "variable_category", custom: "USED_VARIABLES" };

const baseToolbox = {
  kind: "categoryToolbox",
  contents: [
    { kind: "category", name: "逻辑", colour: "#111111", contents: [logicCompare, controlsIf] },
    { kind: "category", name: "集合", colour: "#222222", contents: [listEntry, tupleEntry, countEntry, indexEntry] },
    variablesCategory,
  ],
} as unknown as Blockly.utils.toolbox.ToolboxDefinition;

const pinWrite: ToolboxEntry = { kind: "block", type: "hardware_pin_write", fields: { PIN: "2" } };
const sleepMs: ToolboxEntry = {
  kind: "block",
  type: "hardware_sleep_ms",
  inputs: { MS: { shadow: { type: "math_number", fields: { NUM: 100 } } } },
};
const hardwareEntries: ToolboxEntryIndex = new Map([
  ["hardware_pin_write", [pinWrite]],
  ["hardware_sleep_ms", [sleepMs]],
]);

type ResolvedCategory = {
  kind: string;
  name?: string;
  colour?: string;
  custom?: string;
  contents?: Array<Record<string, unknown>>;
};
type ResolvedDefinition = { kind: string; contents: ResolvedCategory[] };

const spec = (categories: ToolboxCategorySpec[]): BoardToolboxSpec => ({ boardId: "esp32-s3", categories });
const resolve = (categories: ToolboxCategorySpec[]): ResolvedDefinition =>
  resolveBoardToolbox(spec(categories), { baseToolbox, hardwareEntries }) as unknown as ResolvedDefinition;
const contentsOf = (category: ResolvedCategory) => category.contents ?? [];

describe("resolveBoardToolbox", () => {
  it("treats a string selector like { type } and copies the source entry", () => {
    const definition = resolve([
      { id: "logic", name: "逻辑", colour: "#111111", items: ["logic_compare", { type: "logic_compare" }] },
    ]);

    expect(definition.kind).toBe("categoryToolbox");
    const [category] = definition.contents;
    expect(category).toMatchObject({ kind: "category", name: "逻辑", colour: "#111111" });
    const contents = contentsOf(category);
    expect(contents).toHaveLength(2);
    for (const entry of contents) {
      expect(entry).toEqual(logicCompare);
      // 整条复制：不与来源条目共享对象，避免后续修改串到工具箱。
      expect(entry).not.toBe(logicCompare);
    }
  });

  it("picks the right entry with a fields selector", () => {
    const [category] = resolve([
      { id: "list", name: "列表", colour: "#222222", items: [{ type: "python_sequence_collection", fields: { KIND: "list" } }] },
    ]).contents;

    expect(contentsOf(category)).toEqual([listEntry]);
  });

  it("requires fields when the source has several entries of the same type", () => {
    expect(() =>
      resolve([{ id: "collections", name: "集合", colour: "#222222", items: ["python_sequence_collection"] }]),
    ).toThrow(/python_sequence_collection/);
  });

  it("skips hardware blocks the board lacks but rejects misspelled types", () => {
    const [category] = resolve([
      { id: "led", name: "灯光", colour: "#333333", items: ["hardware_builtin_led", "hardware_pin_write"] },
    ]).contents;
    // hardware_builtin_led 已注册，但这块板卡没有：静默跳过。
    expect(contentsOf(category).map((entry) => entry.type)).toEqual(["hardware_pin_write"]);

    expect(() =>
      resolve([{ id: "input", name: "输入", colour: "#333333", items: ["hardware_pin_writ"] }]),
    ).toThrow(/hardware_pin_writ/);
  });

  it("drops categories without any available block", () => {
    const definition = resolve([
      { id: "led", name: "灯光", colour: "#333333", items: ["hardware_builtin_led"] },
      { id: "control", name: "控制", colour: "#444444", items: ["hardware_sleep_ms"] },
    ]);

    expect(definition.contents.map((category) => category.name)).toEqual(["控制"]);
  });

  it("copies dynamic base categories and rejects unknown names", () => {
    const [category] = resolve([{ id: "variables", fromBase: "变量" }]).contents;

    expect(category).toEqual(variablesCategory);
    expect(category).not.toBe(variablesCategory);
    expect(category.custom).toBe("USED_VARIABLES");

    expect(() => resolve([{ id: "missing", fromBase: "不存在的分类" }])).toThrow(/不存在的分类/);
  });

  it("emits labels and separators with the toolbox shapes", () => {
    const [category] = resolve([
      { id: "io", name: "输入输出", colour: "#555555", items: [{ label: "分组" }, { sep: true }, "logic_compare"] },
    ]).contents;
    const contents = contentsOf(category);

    expect(contents[0]).toEqual({ kind: "label", text: "分组", "web-class": "python-standard-library-label" });
    expect(contents[1]).toEqual({ kind: "sep", gap: 20 });
    expect(contents[2]).toEqual(logicCompare);
  });

  it("keeps the declared order of categories and items", () => {
    const definition = resolve([
      { id: "second", name: "第二", colour: "#666666", items: ["controls_if", "logic_compare"] },
      { id: "first", name: "第一", colour: "#777777", items: ["hardware_sleep_ms"] },
      { id: "variables", fromBase: "变量" },
    ]);

    expect(definition.contents.map((category) => category.name)).toEqual(["第二", "第一", "变量"]);
    expect(contentsOf(definition.contents[0]).map((entry) => entry.type)).toEqual(["controls_if", "logic_compare"]);
  });
});
