import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, colorOptions } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerParametricSurfaceBlock = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_parametric_surface",
    message0: "Surface function %1 u range %2 v range %3 resolution %4 color %5",
    args0: [
      { type: "input_value", name: "FUNCTION" },
      { type: "input_value", name: "U_RANGE" },
      { type: "input_value", name: "V_RANGE" },
      { type: "input_value", name: "RESOLUTION", check: "Number" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: false,
    output: "ManimObject",
    colour,
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
