import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerCoordinateExtraBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_axes_plot",
    message0: "坐标系 %1 绘制函数 %2 横轴范围 %3 颜色 %4",
    args0: [
      { type: "input_value", name: "AXES", check: "ManimObject" },
      { type: "input_value", name: "FUNCTION", check: "ManimFunction" },
      { type: "input_value", name: "X_RANGE", check: "ManimRange" },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
    tooltip: "使用已创建的坐标系绘制函数曲线。请先创建并命名坐标系。",
  }, (block, generator) => {
    addManimImport(generator);
    const axes = value(generator, block, "AXES", "Axes()", Order.MEMBER);
    const fn = value(generator, block, "FUNCTION", "lambda x: x");
    const xRange = value(generator, block, "X_RANGE", "[-5, 5]");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [`${axes}.plot(${fn}, x_range=${xRange}, color=${color})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_axes_c2p",
    message0: "坐标系 %1 坐标转点 横坐标 %2 纵坐标 %3",
    args0: [
      { type: "input_value", name: "AXES", check: "ManimObject" },
      { type: "input_value", name: "X", check: "Number" },
      { type: "input_value", name: "Y", check: "Number" },
    ],
    inputsInline: true,
    output: null,
    colour,
    tooltip: "把数学坐标转换成画面中的位置点。",
  }, (block, generator) => {
    addManimImport(generator);
    const axes = value(generator, block, "AXES", "Axes()", Order.MEMBER);
    return [`${axes}.c2p(${value(generator, block, "X", "0")}, ${value(generator, block, "Y", "0")})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_axes_p2c",
    message0: "坐标系 %1 点转坐标 %2",
    args0: [
      { type: "input_value", name: "AXES", check: "ManimObject" },
      { type: "input_value", name: "POINT", check: ["ManimVector", "Number"] },
    ],
    inputsInline: true,
    output: null,
    colour,
    tooltip: "把画面中的位置点转换成该坐标系内的数学坐标。",
  }, (block, generator) => {
    addManimImport(generator);
    const axes = value(generator, block, "AXES", "Axes()", Order.MEMBER);
    return [`${axes}.p2c(${value(generator, block, "POINT", "ORIGIN")})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_axis_labels",
    message0: "坐标系 %1 轴标签 横轴 %2 纵轴 %3",
    args0: [
      { type: "input_value", name: "AXES", check: "ManimObject" },
      { type: "input_value", name: "X_LABEL", check: "String" },
      { type: "input_value", name: "Y_LABEL", check: "String" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
    tooltip: "为已创建的坐标系生成横轴和纵轴标签。",
  }, (block, generator) => {
    addManimImport(generator);
    const axes = value(generator, block, "AXES", "Axes()", Order.MEMBER);
    const xLabel = value(generator, block, "X_LABEL", "'x'");
    const yLabel = value(generator, block, "Y_LABEL", "'y'");
    return [`${axes}.get_axis_labels(x_label=${xLabel}, y_label=${yLabel})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_axes_area",
    message0: "坐标系 %1 曲线 %2 面积范围 %3 颜色 %4",
    args0: [
      { type: "input_value", name: "AXES", check: "ManimObject" },
      { type: "input_value", name: "GRAPH", check: "ManimObject" },
      { type: "input_value", name: "X_RANGE", check: "ManimRange" },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
    tooltip: "填充函数曲线与横轴之间的区域。坐标系和曲线必须引用同一套坐标系。",
  }, (block, generator) => {
    addManimImport(generator);
    const axes = value(generator, block, "AXES", "Axes()", Order.MEMBER);
    const graph = value(generator, block, "GRAPH", "Axes().plot(lambda x: x)");
    const xRange = value(generator, block, "X_RANGE", "[-1, 1]");
    const color = String(block.getFieldValue("COLOR") || "BLUE");
    return [`${axes}.get_area(${graph}, x_range=${xRange}, color=${color})`, Order.FUNCTION_CALL];
  });
};
