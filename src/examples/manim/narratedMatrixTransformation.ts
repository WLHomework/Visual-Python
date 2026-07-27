import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, number, play, point, range, ref, scaledDirection, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const matrix = (a: number, b: number, c: number, d: number) => input({
  type: "visual_python_manim_matrix_data_2x2",
  inputs: { A: number(a), B: number(b), C: number(c), D: number(d) },
});

const plane = (transformed: boolean) => {
  const base = {
    type: "visual_python_manim_number_plane_object",
    inputs: { X_RANGE: range(-4, 4, 1), Y_RANGE: range(-3, 3, 1), X_LENGTH: number(8), Y_LENGTH: number(6) },
  };
  const withMatrix = transformed
    ? { type: "visual_python_manim_apply_matrix", inputs: { MOBJECT: input(base), MATRIX: matrix(1, 0.7, 0, 1) } }
    : base;
  return {
    type: "visual_python_manim_shift",
    inputs: {
      MOBJECT: input({ type: "visual_python_manim_scale", inputs: { MOBJECT: input(withMatrix), FACTOR: number(0.72) } }),
      VECTOR: scaledDirection("LEFT", 2.7),
    },
  };
};

const arrow = (endX: number, endY: number, color: string) => ({
  type: "visual_python_manim_arrow_object",
  fields: { COLOR: color },
  inputs: { START: input(point(-2.7, 0)), END: input(point(endX, endY)), BUFF: number(0) },
});

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const mathLabel = (content: string, x: number, y: number, color = "WHITE", size = 38) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const transform = (source: string, target: string, seconds: number) => play({
  type: "visual_python_manim_transform_to_animation",
  inputs: { SOURCE: ref(source), TARGET: ref(target), RUN_TIME: number(seconds) },
});

const write = (name: string, seconds = 0.8) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedMatrixTransformationExample: ExampleProject = {
  id: "manim-narrated-matrix-transformation",
  title: "线性代数：矩阵变换平面",
  projectName: "narrated-matrix-transformation.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedMatrixTransformation", "Scene", chain(
    assign("original_plane", plane(false)),
    assign("transformed_plane", plane(true)),
    assign("original_vector", arrow(-1.25, 1.05, "BLUE")),
    assign("transformed_vector", arrow(-0.52, 1.05, "YELLOW")),
    assign("matrix_label", mathLabel("A=\\begin{bmatrix}1&0.7\\\\0&1\\end{bmatrix}", 3.45, 2.25, "GREEN", 38)),
    assign("rule_label", mathLabel("\\begin{bmatrix}x'\\\\y'\\end{bmatrix}=A\\begin{bmatrix}x\\\\y\\end{bmatrix}", 3.45, 0.65, "WHITE", 36)),
    assign("vector_before", mathLabel("\\vec v=\\begin{bmatrix}2\\\\1\\end{bmatrix}", 3.45, -0.75, "BLUE", 36)),
    assign("vector_after", mathLabel("A\\vec v=\\begin{bmatrix}2.7\\\\1\\end{bmatrix}", 3.45, -2.05, "YELLOW", 36)),
    voiceoverWithAnimation("坐标平面上的每一个点，都可以看成一个由 x 和 y 组成的向量。蓝色箭头表示向量二逗号一。", chain(play(create("original_plane", 1)), play(create("original_vector", 0.8)), write("vector_before", 0.7)), "default", "matrix-plane-start"),
    voiceoverWithAnimation("现在使用这个二乘二矩阵。矩阵乘法会按照同一条规则，同时改变平面上的所有向量。", chain(write("matrix_label", 0.9), write("rule_label", 0.8)), "default", "matrix-rule"),
    voiceoverWithAnimation("这个矩阵保持 y 坐标不变，并把零点七倍的 y 加到 x 上，因此网格会向右倾斜。", transform("original_plane", "transformed_plane", 1.8), "default", "matrix-grid"),
    voiceoverWithAnimation("向量二逗号一也遵守相同规则。新的横坐标是二加零点七，纵坐标仍然是一。", chain(transform("original_vector", "transformed_vector", 1.2), write("vector_after", 0.8)), "default", "matrix-vector"),
    voiceover("矩阵不是孤立的数字表格，它代表一种空间变换。只要矩阵固定，平面上每个向量都会按照同一规则移动。", "default", "matrix-summary"),
    wait(0.8),
  )),
};
