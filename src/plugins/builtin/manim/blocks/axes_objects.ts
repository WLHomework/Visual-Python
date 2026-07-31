import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerAxesObjectBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_axes_object",
    message0: "二维坐标系 横轴范围 %1 纵轴范围 %2 横轴长度 %3 纵轴长度 %4",
    args0: [
      { type: "input_value", name: "X_RANGE", check: "ManimRange" },
      { type: "input_value", name: "Y_RANGE", check: "ManimRange" },
      { type: "input_value", name: "X_LENGTH", check: "Number" },
      { type: "input_value", name: "Y_LENGTH", check: "Number" },
    ],
    inputsInline: false,
    output: "ManimObject",
    colour,
    tooltip: "创建二维坐标系。范围控制刻度区间，长度控制画面中的显示尺寸。",
  }, (block, generator) => {
    addManimImport(generator);
    const xRange = value(generator, block, "X_RANGE", "[-5, 5, 1]");
    const yRange = value(generator, block, "Y_RANGE", "[-3, 3, 1]");
    const xLength = value(generator, block, "X_LENGTH", "10");
    const yLength = value(generator, block, "Y_LENGTH", "6");
    return [pythonCall("Axes", [`x_range=${xRange}`, `y_range=${yRange}`, `x_length=${xLength}`, `y_length=${yLength}`], { multiline: true }), Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_three_d_axes_object",
    message0: "三维坐标系 横轴范围 %1 纵轴范围 %2 深度轴范围 %3",
    args0: [
      { type: "input_value", name: "X_RANGE", check: "ManimRange" },
      { type: "input_value", name: "Y_RANGE", check: "ManimRange" },
      { type: "input_value", name: "Z_RANGE", check: "ManimRange" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
    tooltip: "创建三维坐标系，需要放在三维场景中使用。",
  }, (block, generator) => {
    addManimImport(generator);
    const xRange = value(generator, block, "X_RANGE", "[-6, 6, 1]");
    const yRange = value(generator, block, "Y_RANGE", "[-5, 5, 1]");
    const zRange = value(generator, block, "Z_RANGE", "[-4, 4, 1]");
    return [pythonCall("ThreeDAxes", [`x_range=${xRange}`, `y_range=${yRange}`, `z_range=${zRange}`], { multiline: true }), Order.FUNCTION_CALL];
  });
};
