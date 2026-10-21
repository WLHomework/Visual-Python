import * as Blockly from "blockly/core";
import { toolbox as baseToolbox } from "../../pythonBlocks";
import type { ToolboxCategorySpec, ToolboxItemSpec } from "./types";

type BaseCategory = { kind?: string; name?: string; colour?: unknown; categorystyle?: string };

const baseCategoryList: BaseCategory[] = Array.isArray((baseToolbox as unknown as { contents?: unknown }).contents)
  ? ((baseToolbox as unknown as { contents: BaseCategory[] }).contents)
  : [];

// Python 界面的主题以 Blockly 的 Classic 主题为底（见 pythonBlocks.ts 的 createVisualTheme），
// 只写 categorystyle 的分类（逻辑/循环/数学/文本/变量/函数）颜色由它决定。
const classicCategoryStyles =
  (Blockly.Themes.Classic as unknown as { categoryStyles?: Record<string, { colour?: string | number }> }).categoryStyles ?? {};

/**
 * 复用 Python 界面里同名分类的颜色。
 *
 * 颜色有可能是色相字符串（例如 "210"），Blockly 的分类颜色本来就接受这种写法。
 */
export function baseCategoryColour(name: string): string {
  const category = baseCategoryList.find((item) => item.name === name);
  if (!category) throw new Error(`基础工具箱里没有名为「${name}」的分类`);
  if (typeof category.colour === "string" && category.colour) return category.colour;
  const styleName = typeof category.categorystyle === "string" ? category.categorystyle : "";
  const colour = classicCategoryStyles[styleName]?.colour;
  if (colour === undefined) {
    throw new Error(`分类「${name}」没有可用的颜色（categorystyle：${styleName || "无"}）`);
  }
  return String(colour);
}

export const controlCategory = (extra: ToolboxItemSpec[] = []): ToolboxCategorySpec => ({
  id: "control",
  name: "控制",
  colour: baseCategoryColour("循环"),
  items: [
    "controls_if",
    "controls_repeat_ext",
    "controls_whileUntil",
    "controls_for",
    "controls_flow_statements",
    "hardware_forever",
    "hardware_sleep_ms",
    ...extra,
  ],
});

export const logicCategory = (extra: ToolboxItemSpec[] = []): ToolboxCategorySpec => ({
  id: "logic",
  name: "逻辑",
  colour: baseCategoryColour("逻辑"),
  items: ["logic_compare", "logic_operation", "logic_negate", "logic_boolean", "python_conditional", ...extra],
});

export const mathCategory = (extra: ToolboxItemSpec[] = []): ToolboxCategorySpec => ({
  id: "math",
  name: "数学",
  colour: baseCategoryColour("数学"),
  items: [
    "math_number",
    "math_arithmetic",
    "math_modulo",
    "math_single",
    "math_round",
    "math_constrain",
    "math_constant",
    "math_random_int",
    "math_random_float",
    "python_floor_divide",
    "python_bitwise",
    "python_bitwise_not",
    ...extra,
  ],
});

export const textCategory = (extra: ToolboxItemSpec[] = []): ToolboxCategorySpec => ({
  id: "text",
  name: "文本",
  colour: baseCategoryColour("文本"),
  items: [
    "text",
    "text_join",
    "text_length",
    "python_convert",
    "python_text_replace",
    "python_string_method",
    "python_f_string",
    ...extra,
  ],
});

export const listCategory = (extra: ToolboxItemSpec[] = []): ToolboxCategorySpec => ({
  id: "list",
  name: "列表",
  colour: baseCategoryColour("集合"),
  items: [
    // 基础工具箱里 python_sequence_collection 有 list / tuple / set 三条，必须用 KIND 选中列表这条。
    { type: "python_sequence_collection", fields: { KIND: "list" } },
    "python_list_method",
    "python_index",
    "python_list_set",
    "python_list_insert",
    "python_length",
    ...extra,
  ],
});

export const assignmentCategory = (extra: ToolboxItemSpec[] = []): ToolboxCategorySpec => ({
  id: "assignment",
  name: "赋值",
  colour: baseCategoryColour("赋值"),
  items: ["python_assign_target", "python_augmented_assign", ...extra],
});

/** 动态分类：整体复用 Python 界面里的「变量」（当前工作区用到的变量）。 */
export const variablesCategory: ToolboxCategorySpec = { id: "variables", fromBase: "变量" };

export const functionCategory = (extra: ToolboxItemSpec[] = []): ToolboxCategorySpec => ({
  id: "function",
  name: "函数",
  colour: baseCategoryColour("函数"),
  items: ["python_function_structured", "python_return", "python_return_none", ...extra],
});

/** 动态分类：整体复用 Python 界面里的「调用」（已定义函数的调用块）。 */
export const callsCategory: ToolboxCategorySpec = { id: "calls", fromBase: "调用" };

export const serialCategory = (extra: ToolboxItemSpec[] = []): ToolboxCategorySpec => ({
  id: "serial",
  name: "串口",
  colour: baseCategoryColour("输入输出"),
  items: ["python_print", "python_print_many", ...extra],
});
