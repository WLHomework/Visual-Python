import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerHighlightAnimationBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_indicate_animation",
    message0: "闪烁强调 Indicate 对象 %1 放大 %2 颜色 %3 时间 %4",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "SCALE_FACTOR", check: "Number" },
      { type: "field_dropdown", name: "COLOR", options: [["YELLOW", "YELLOW"], ["WHITE", "WHITE"], ["RED", "RED"], ["GREEN", "GREEN"], ["BLUE", "BLUE"], ["PURPLE", "PURPLE"], ["ORANGE", "ORANGE"]] },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()");
    const scaleFactor = value(generator, block, "SCALE_FACTOR", "1.2");
    const color = String(block.getFieldValue("COLOR") || "YELLOW");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`Indicate(${target}, scale_factor=${scaleFactor}, color=${color}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_circumscribe_animation",
    message0: "圈出 Circumscribe 对象 %1 形状 %2 间距 %3 颜色 %4 时间 %5",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "field_dropdown", name: "SHAPE", options: [["Rectangle", "Rectangle"], ["Circle", "Circle"]] },
      { type: "input_value", name: "BUFF", check: "Number" },
      { type: "field_dropdown", name: "COLOR", options: [["YELLOW", "YELLOW"], ["WHITE", "WHITE"], ["RED", "RED"], ["GREEN", "GREEN"], ["BLUE", "BLUE"], ["PURPLE", "PURPLE"], ["ORANGE", "ORANGE"]] },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()");
    const shape = String(block.getFieldValue("SHAPE") || "Rectangle");
    const buff = value(generator, block, "BUFF", "0.1");
    const color = String(block.getFieldValue("COLOR") || "YELLOW");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`Circumscribe(${target}, shape=${shape}, buff=${buff}, color=${color}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });
};
