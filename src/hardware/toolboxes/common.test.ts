import { afterEach, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { toolbox as baseToolbox } from "../../pythonBlocks";
import { setActiveHardwareBoard } from "../blocks/shared";
import {
  assignmentCategory,
  baseCategoryColour,
  callsCategory,
  controlCategory,
  functionCategory,
  listCategory,
  logicCategory,
  mathCategory,
  serialCategory,
  textCategory,
  variablesCategory,
} from "./common";
import { hardwareBlockEntries } from "./hardwareEntries";
import { resolveBoardToolbox } from "./resolve";
import type { ToolboxCategorySpec } from "./types";

type ResolvedCategory = {
  kind?: string;
  name?: string;
  colour?: string | number;
  custom?: string;
  contents?: Array<Record<string, unknown>>;
};

const categorySpecs: ToolboxCategorySpec[] = [
  controlCategory(),
  logicCategory(),
  mathCategory(),
  textCategory(),
  listCategory(),
  assignmentCategory(),
  variablesCategory,
  functionCategory(),
  callsCategory,
  serialCategory(),
];

const resolveCategories = (categories: ToolboxCategorySpec[]) =>
  resolveBoardToolbox(
    { boardId: "esp32-s3", categories },
    { baseToolbox, hardwareEntries: hardwareBlockEntries("esp32-s3") },
  ) as unknown as { contents: ResolvedCategory[] };

afterEach(() => {
  setActiveHardwareBoard(undefined);
});

describe("common 分类声明", () => {
  it("reuses the colour of the same-named Python category", () => {
    expect(baseCategoryColour("输入输出")).toBe("#2f9e8f");

    const classicStyles = (Blockly.Themes.Classic as unknown as { categoryStyles: Record<string, { colour: string | number }> }).categoryStyles;
    expect(baseCategoryColour("循环")).toBe(String(classicStyles.loop_category.colour));

    expect(() => baseCategoryColour("不存在的分类")).toThrow(/不存在的分类/);
  });

  it("resolves every common category against the real base toolbox", () => {
    const definition = resolveCategories(categorySpecs);

    expect(definition.contents.map((category) => category.name)).toEqual([
      "控制", "逻辑", "数学", "文本", "列表", "赋值", "变量", "函数", "调用", "串口",
    ]);
    for (const category of definition.contents) {
      // 「变量」「调用」是动态分类：整体复制基础工具箱的分类，没有静态条目，颜色由 categorystyle 决定。
      if (category.custom) {
        expect(category.contents).toBeUndefined();
        continue;
      }
      expect(category.colour ?? "").not.toBe("");
      expect(category.contents?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("keeps the declared order and mixes base and hardware entries", () => {
    const [control] = resolveCategories([controlCategory()]).contents;

    expect(control.contents?.map((entry) => entry.type)).toEqual([
      "controls_repeat_ext",
      "controls_whileUntil",
      "controls_for",
      "controls_flow_statements",
      "hardware_forever",
      "hardware_sleep_ms",
    ]);
  });

  it("keeps the conditional statement with the logic blocks", () => {
    const [logic] = resolveCategories([logicCategory()]).contents;

    expect(logic.contents?.map((entry) => entry.type)).toEqual([
      "controls_if",
      "logic_compare",
      "logic_operation",
      "logic_negate",
      "logic_boolean",
      "python_conditional",
    ]);
  });

  it("picks the list entry of python_sequence_collection", () => {
    const [list] = resolveCategories([listCategory()]).contents;
    const first = list.contents?.[0] ?? {};

    expect(first.type).toBe("python_sequence_collection");
    expect((first.fields as { KIND?: string } | undefined)?.KIND).toBe("list");
  });
});
