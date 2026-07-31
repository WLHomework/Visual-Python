import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, directionOptions, functionPresetOptions, mathConstantOptions, surfaceFunctionPresetOptions } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerValueBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_function_preset",
    message0: "函数 %1 纵向缩放 %2 横向缩放 %3 上下平移 %4",
    args0: [
      { type: "field_dropdown", name: "PRESET", options: functionPresetOptions },
      { type: "input_value", name: "AMPLITUDE", check: "Number" },
      { type: "input_value", name: "FREQUENCY", check: "Number" },
      { type: "input_value", name: "OFFSET", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimFunction",
    colour,
    tooltip: "选择常用函数，并通过缩放和平移参数调整曲线形状，无需手写函数代码。",
  }, (block, generator) => {
    addManimImport(generator);
    const amplitude = value(generator, block, "AMPLITUDE", "1");
    const frequency = value(generator, block, "FREQUENCY", "1");
    const offset = value(generator, block, "OFFSET", "0");
    const variable = `(${frequency} * x)`;
    const expressions: Record<string, string> = {
      linear: variable,
      quadratic: `${variable} ** 2`,
      cubic: `${variable} ** 3`,
      sine: `np.sin(${variable})`,
      cosine: `np.cos(${variable})`,
      exponential: `np.exp(${variable})`,
      absolute: `abs(${variable})`,
    };
    const expression = expressions[String(block.getFieldValue("PRESET") || "linear")] ?? variable;
    return [`lambda x: ${amplitude} * ${expression} + ${offset}`, Order.LAMBDA];
  });

  context.registerBlock({
    type: "visual_python_manim_surface_function_preset",
    message0: "曲面函数 %1 高度参数 %2",
    args0: [
      { type: "field_dropdown", name: "PRESET", options: surfaceFunctionPresetOptions },
      { type: "input_value", name: "HEIGHT", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimSurfaceFunction",
    colour,
    tooltip: "选择常用三维曲面函数，并调整曲面的高度参数。",
  }, (block, generator) => {
    addManimImport(generator);
    const height = value(generator, block, "HEIGHT", "1");
    const zExpressions: Record<string, string> = {
      plane: height,
      wave: `${height} * np.sin(u) * np.cos(v)`,
      saddle: `${height} * (u**2 - v**2) / 4`,
      paraboloid: `${height} * (u**2 + v**2) / 4`,
    };
    const z = zExpressions[String(block.getFieldValue("PRESET") || "plane")] ?? "0";
    return [`lambda u, v: np.array([u, v, ${z}])`, Order.LAMBDA];
  });

  context.registerBlock({
    type: "visual_python_manim_dimensions",
    message0: "三维尺寸 宽 %1 高 %2 深 %3",
    args0: [
      { type: "input_value", name: "WIDTH", check: "Number" },
      { type: "input_value", name: "HEIGHT", check: "Number" },
      { type: "input_value", name: "DEPTH", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimDimensions",
    colour,
    tooltip: "设置三维对象在宽、高、深三个方向上的尺寸。",
  }, (block, generator) => {
    addManimImport(generator);
    return [`[${value(generator, block, "WIDTH", "3")}, ${value(generator, block, "HEIGHT", "2")}, ${value(generator, block, "DEPTH", "1")}]`, Order.ATOMIC];
  });

  context.registerBlock({
    type: "visual_python_manim_formula_value",
    message0: "数学公式 %1",
    args0: [{ type: "field_manim_formula", name: "LATEX", value: "x^2 + y^2 = z^2" }],
    inputsInline: true,
    output: "String",
    colour,
  }, (block, generator) => [generator.quote_(String(block.getFieldValue("LATEX") || "")), Order.ATOMIC]);

  context.registerBlock({
    type: "visual_python_manim_direction_constant",
    message0: "方向常量 %1",
    args0: [{ type: "field_dropdown", name: "VALUE", options: directionOptions }],
    inputsInline: true,
    output: ["ManimVector", "Number"],
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [String(block.getFieldValue("VALUE") || "RIGHT"), Order.ATOMIC];
  });

  context.registerBlock({
    type: "visual_python_manim_scaled_direction",
    message0: "方向 %1 缩放 %2 倍",
    args0: [
      { type: "field_dropdown", name: "DIRECTION", options: directionOptions },
      { type: "input_value", name: "SCALE", check: "Number" },
    ],
    inputsInline: true,
    output: ["ManimVector", "Number"],
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const direction = String(block.getFieldValue("DIRECTION") || "RIGHT");
    return [`${direction} * ${value(generator, block, "SCALE", "1")}`, Order.MULTIPLICATIVE];
  });

  context.registerBlock({
    type: "visual_python_manim_math_constant",
    message0: "数学常量 %1",
    args0: [{ type: "field_dropdown", name: "VALUE", options: mathConstantOptions }],
    inputsInline: true,
    output: "Number",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [String(block.getFieldValue("VALUE") || "PI"), Order.ATOMIC];
  });

  context.registerBlock({
    type: "visual_python_manim_degrees",
    message0: "角度 %1 度",
    args0: [{ type: "field_manim_angle", name: "VALUE", value: 90 }],
    inputsInline: true,
    output: "ManimAngle",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`${block.getFieldValue("VALUE") || "90"} * DEGREES`, Order.MULTIPLICATIVE];
  });

  context.registerBlock({
    type: "visual_python_manim_range",
    message0: "范围 起始 %1 结束 %2 步长 %3",
    args0: [
      { type: "input_value", name: "START", check: "Number" },
      { type: "input_value", name: "END", check: "Number" },
      { type: "input_value", name: "STEP", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimRange",
    colour,
    tooltip: "生成包含起始值、结束值和步长的范围，可用于坐标轴和数轴。",
  }, (block, generator) => {
    addManimImport(generator);
    return [`[${value(generator, block, "START", "-5")}, ${value(generator, block, "END", "5")}, ${value(generator, block, "STEP", "1")}]`, Order.ATOMIC];
  });

  context.registerBlock({
    type: "visual_python_manim_range_min_max",
    message0: "范围 起始 %1 结束 %2",
    args0: [
      { type: "input_value", name: "START", check: "Number" },
      { type: "input_value", name: "END", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimRange",
    colour,
    tooltip: "生成只包含起始值和结束值的范围，可用于函数曲线和面积区间。",
  }, (block, generator) => {
    addManimImport(generator);
    return [`[${value(generator, block, "START", "-3")}, ${value(generator, block, "END", "3")}]`, Order.ATOMIC];
  });

  context.registerBlock({
    type: "visual_python_manim_point",
    message0: "点坐标 横坐标 %1 纵坐标 %2 深度坐标 %3",
    args0: [
      { type: "input_value", name: "X", check: "Number" },
      { type: "input_value", name: "Y", check: "Number" },
      { type: "input_value", name: "Z", check: "Number" },
    ],
    inputsInline: true,
    output: ["ManimVector", "Number"],
    colour,
    tooltip: "创建画面中的位置点。二维场景通常把深度坐标设为零。",
  }, (block, generator) => {
    addManimImport(generator);
    return [`[${value(generator, block, "X", "0")}, ${value(generator, block, "Y", "0")}, ${value(generator, block, "Z", "0")}]`, Order.ATOMIC];
  });

  context.registerBlock({
    type: "visual_python_manim_point_list_3",
    message0: "三个顶点 %1 %2 %3",
    args0: [
      { type: "input_value", name: "P1" },
      { type: "input_value", name: "P2" },
      { type: "input_value", name: "P3" },
    ],
    inputsInline: true,
    output: "ManimPointArguments",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`${value(generator, block, "P1", "LEFT")}, ${value(generator, block, "P2", "UP")}, ${value(generator, block, "P3", "RIGHT")}`, Order.NONE];
  });

  context.registerBlock({
    type: "visual_python_manim_table_data_2x2",
    message0: "二行二列表格数据 %1 %2 %3 %4",
    args0: [
      { type: "input_value", name: "A" },
      { type: "input_value", name: "B" },
      { type: "input_value", name: "C" },
      { type: "input_value", name: "D" },
    ],
    inputsInline: true,
    output: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`[[${value(generator, block, "A", "'A'")}, ${value(generator, block, "B", "'B'")}], [${value(generator, block, "C", "'C'")}, ${value(generator, block, "D", "'D'")}]]`, Order.ATOMIC];
  });

  context.registerBlock({
    type: "visual_python_manim_matrix_data_2x2",
    message0: "二行二列数字矩阵 %1 %2 %3 %4",
    args0: [
      { type: "input_value", name: "A", check: "Number" },
      { type: "input_value", name: "B", check: "Number" },
      { type: "input_value", name: "C", check: "Number" },
      { type: "input_value", name: "D", check: "Number" },
    ],
    inputsInline: true,
    output: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`[[${value(generator, block, "A", "1")}, ${value(generator, block, "B", "2")}], [${value(generator, block, "C", "3")}, ${value(generator, block, "D", "4")}]]`, Order.ATOMIC];
  });

  context.registerBlock({
    type: "visual_python_manim_color_constant",
    message0: "颜色常量 %1",
    args0: [{ type: "field_manim_color", name: "VALUE" }],
    inputsInline: true,
    output: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [String(block.getFieldValue("VALUE") || "WHITE"), Order.ATOMIC];
  });
};
