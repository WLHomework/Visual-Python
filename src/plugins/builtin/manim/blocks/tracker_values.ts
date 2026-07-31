import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerTrackerValueBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_value_tracker",
    message0: "数值追踪器 初始值 %1",
    args0: [{ type: "input_value", name: "VALUE", check: "Number" }],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`ValueTracker(${value(generator, block, "VALUE", "0")})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_decimal_number",
    message0: "小数显示 值 %1 小数位 %2",
    args0: [
      { type: "input_value", name: "VALUE", check: "Number" },
      { type: "input_value", name: "PLACES", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const valueCode = value(generator, block, "VALUE", "0");
    const places = value(generator, block, "PLACES", "2");
    return [`DecimalNumber(${valueCode}, num_decimal_places=${places})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_variable",
    message0: "带标签变量 值 %1 标签 %2",
    args0: [
      { type: "input_value", name: "VALUE", check: "Number" },
      { type: "input_value", name: "LABEL", check: "String" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const valueCode = value(generator, block, "VALUE", "0");
    const label = value(generator, block, "LABEL", "'x'");
    return [`Variable(${valueCode}, ${label})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_tracker_get_value",
    message0: "获取追踪器 %1 的值",
    args0: [{ type: "input_value", name: "TRACKER", check: "ManimObject" }],
    inputsInline: true,
    output: "Number",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`${value(generator, block, "TRACKER", "ValueTracker(0)", Order.MEMBER)}.get_value()`, Order.FUNCTION_CALL];
  });
};
