import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerParametricSurfaceBlock = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_parametric_surface",
    message0: "参数曲面 函数 %1 横向参数范围 %2 纵向参数范围 %3 精度 %4 颜色 %5",
    args0: [
      { type: "input_value", name: "FUNCTION", check: "ManimSurfaceFunction" },
      { type: "input_value", name: "U_RANGE", check: "ManimRange" },
      { type: "input_value", name: "V_RANGE", check: "ManimRange" },
      { type: "input_value", name: "RESOLUTION", check: "Number" },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: false,
    output: "ManimObject",
    colour,
    tooltip: "根据两个参数生成三维曲面。精度越高越平滑，但渲染时间也越长。",
  }, (block, generator) => {
    addManimImport(generator);
    const fn = value(generator, block, "FUNCTION", "lambda u, v: np.array([u, v, 0])");
    const uRange = value(generator, block, "U_RANGE", "[-3, 3]");
    const vRange = value(generator, block, "V_RANGE", "[-3, 3]");
    const resolution = value(generator, block, "RESOLUTION", "24");
    const color = String(block.getFieldValue("COLOR") || "BLUE");
    return [pythonCall("Surface", [fn, `u_range=${uRange}`, `v_range=${vRange}`, `resolution=(${resolution}, ${resolution})`, "fill_opacity=0.8", `fill_color=${color}`, `stroke_color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });
};
