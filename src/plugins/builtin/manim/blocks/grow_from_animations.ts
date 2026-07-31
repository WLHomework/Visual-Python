import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerGrowFromAnimationBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_grow_from_center_animation",
    message0: "从中心生长 对象 %1 时间 %2",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`GrowFromCenter(${target}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_grow_from_point_animation",
    message0: "从指定点生长 对象 %1 点 %2 时间 %3",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "POINT", check: ["ManimVector", "Number"] },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()");
    const point = value(generator, block, "POINT", "ORIGIN");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`GrowFromPoint(${target}, ${point}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_grow_from_edge_animation",
    message0: "从边缘生长 对象 %1 边缘 %2 时间 %3",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "EDGE", check: ["ManimVector", "Number"] },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()");
    const edge = value(generator, block, "EDGE", "DOWN");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`GrowFromEdge(${target}, ${edge}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_grow_arrow_animation",
    message0: "箭头生长 箭头 %1 时间 %2",
    args0: [
      { type: "input_value", name: "ARROW", check: "ManimObject" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const arrow = value(generator, block, "ARROW", "Arrow(LEFT, RIGHT)");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`GrowArrow(${arrow}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });
};
