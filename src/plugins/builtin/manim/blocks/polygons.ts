import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerPolygonObjectBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_triangle_object",
    message0: "三角形 边长 %1 颜色 %2",
    args0: [
      { type: "input_value", name: "SIDE_LENGTH", check: "Number" },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const sideLength = generator.valueToCode(block, "SIDE_LENGTH", Order.NONE);
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    const radius = sideLength ? `radius=(${sideLength}) / (3 ** 0.5), ` : "";
    return [`Triangle(${radius}color=${color})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_regular_polygon_object",
    message0: "正多边形 边数 %1 半径 %2 颜色 %3",
    args0: [
      { type: "input_value", name: "N", check: "Number" },
      { type: "input_value", name: "RADIUS", check: "Number" },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const n = value(generator, block, "N", "6");
    const radius = value(generator, block, "RADIUS", "1");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("RegularPolygon", [`n=${n}`, `radius=${radius}`, `color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_polygon_points_object",
    message0: "多边形 顶点 %1 颜色 %2",
    args0: [
      { type: "input_value", name: "POINTS", check: "ManimPointArguments" },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const points = value(generator, block, "POINTS", "LEFT, UP, RIGHT");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [`Polygon(${points}, color=${color})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_polygon_from_list_object",
    message0: "多边形 顶点列表 %1 颜色 %2",
    args0: [
      { type: "input_value", name: "POINTS" },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const points = value(generator, block, "POINTS", "[LEFT, UP, RIGHT]");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [`Polygon(*${points}, color=${color})`, Order.FUNCTION_CALL];
  });
};
