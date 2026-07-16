import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerUpdaterBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_traced_path",
    message0: "TracedPath target %1 color %2 width %3",
    args0: [
      { type: "input_value", name: "TARGET", check: "ManimObject" },
      { type: "field_dropdown", name: "COLOR", options: [["YELLOW", "YELLOW"], ["BLUE", "BLUE"], ["GREEN", "GREEN"], ["RED", "RED"], ["WHITE", "WHITE"]] },
      { type: "input_value", name: "WIDTH", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "TARGET", "Dot()", Order.MEMBER);
    const color = String(block.getFieldValue("COLOR") || "YELLOW");
    const width = value(generator, block, "WIDTH", "4");
    return [`TracedPath(${target}.get_center, stroke_color=${color}, stroke_width=${width})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_always_redraw",
    message0: "实时重绘 always_redraw 对象 %1",
    args0: [{ type: "input_value", name: "MOBJECT", check: "ManimObject" }],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`always_redraw(lambda: ${value(generator, block, "MOBJECT", "Circle()")})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_decimal_follow_tracker",
    message0: "小数显示跟随追踪器 %1 小数位 %2",
    args0: [
      { type: "input_value", name: "TRACKER", check: "ManimObject" },
      { type: "input_value", name: "PLACES", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const tracker = value(generator, block, "TRACKER", "ValueTracker(0)", Order.MEMBER);
    const places = value(generator, block, "PLACES", "2");
    return [`always_redraw(lambda: DecimalNumber(${tracker}.get_value(), num_decimal_places=${places}))`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_follow_target_updater",
    message0: "对象 %1 跟随目标 %2 方向 %3",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "TARGET", check: "ManimObject" },
      { type: "input_value", name: "DIRECTION" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const source = value(generator, block, "MOBJECT", "Text('label')", Order.MEMBER);
    const target = value(generator, block, "TARGET", "Circle()");
    const direction = value(generator, block, "DIRECTION", "RIGHT");
    return `${source}.add_updater(lambda m: m.next_to(${target}, ${direction}))\n`;
  });

  context.registerBlock({
    type: "visual_python_manim_clear_updaters",
    message0: "清除对象 %1 的所有更新器",
    args0: [{ type: "input_value", name: "MOBJECT", check: "ManimObject" }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return `${value(generator, block, "MOBJECT", "Text('label')", Order.MEMBER)}.clear_updaters()\n`;
  });
};
