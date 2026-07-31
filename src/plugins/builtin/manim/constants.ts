export const colour = "#7c3aed";

export const manimBlockColours = {
  scene: "#C06A3E",
  object: "#397DB3",
  animation: "#B95073",
  method: "#2F9387",
  value: "#C58B32",
  dynamic: "#7657B5",
} as const;

const hasAny = (type: string, parts: string[]) => parts.some((part) => type.includes(part));

const blockColourOverrides: Record<string, string> = {
  visual_python_manim_assign: manimBlockColours.object,
  visual_python_manim_assign_add: manimBlockColours.object,
  visual_python_manim_object_ref: manimBlockColours.object,
  visual_python_manim_scaled_direction: manimBlockColours.value,
  visual_python_manim_play_list: manimBlockColours.object,
  visual_python_manim_animate_method: manimBlockColours.animation,
  visual_python_manim_transform_method: manimBlockColours.object,
  visual_python_manim_formula_value: manimBlockColours.value,
  visual_python_manim_voiceover: manimBlockColours.scene,
  visual_python_manim_voiceover_with_animation: manimBlockColours.scene,
  visual_python_manim_play_local_audio: manimBlockColours.scene,
  visual_python_manim_play_local_audio_with_animation: manimBlockColours.scene,
  visual_python_manim_function_preset: manimBlockColours.value,
  visual_python_manim_surface_function_preset: manimBlockColours.value,
  visual_python_manim_dimensions: manimBlockColours.value,
};

export const colourForManimBlock = (type: string): string => {
  if (blockColourOverrides[type]) return blockColourOverrides[type];
  if (hasAny(type, ["_tracker", "_updater", "_always_redraw", "_traced_path", "_decimal_follow", "_decimal_number", "_variable"])) return manimBlockColours.dynamic;
  if (hasAny(type, ["_scene", "_camera", "_ambient_rotation", "_add", "_remove", "_clear", "_wait", "_play"])) return manimBlockColours.scene;
  if (hasAny(type, ["_animation", "_animate_", "_play"])) return manimBlockColours.animation;
  if (hasAny(type, ["_set_color", "_set_opacity", "_set_fill", "_set_stroke", "_move_to", "_shift", "_scale", "_rotate", "_to_edge", "_to_corner", "_next_to", "_arrange", "_apply_matrix"])) return manimBlockColours.method;
  if (hasAny(type, ["_direction_constant", "_scaled_direction", "_math_constant", "_degrees", "_range", "_point", "_color_constant", "_table_data", "_matrix_data"])) return manimBlockColours.value;
  return manimBlockColours.object;
};

export const sceneTypeOptions = [
  ["普通场景", "Scene"],
  ["移动相机场景", "MovingCameraScene"],
  ["三维场景", "ThreeDScene"],
  ["特殊三维场景", "SpecialThreeDScene"],
];

export const textObjectOptions = [
  ["普通文本", "Text"],
  ["公式文本", "Tex"],
  ["数学公式", "MathTex"],
];

export const shapeOptions = [
  ["圆形", "Circle"],
  ["正方形", "Square"],
  ["矩形", "Rectangle"],
  ["点", "Dot"],
];

export const lineOptions = [
  ["直线", "Line"],
  ["虚线", "DashedLine"],
  ["箭头", "Arrow"],
  ["双箭头", "DoubleArrow"],
  ["曲线箭头", "CurvedArrow"],
];

export const curvedShapeOptions = [
  ["圆角矩形", "RoundedRectangle"],
  ["椭圆", "Ellipse"],
  ["圆弧", "Arc"],
  ["扇形", "Sector"],
  ["圆环", "Annulus"],
];

export const curvedShapeArgumentDefaults: Record<string, string> = {
  RoundedRectangle: "corner_radius=0.2, width=3, height=2",
  Ellipse: "width=3, height=2",
  Arc: "radius=1, angle=PI / 2",
  Sector: "outer_radius=1, angle=PI / 2",
  Annulus: "inner_radius=0.5, outer_radius=1",
};

export const coordinateOptions = [
  ["坐标系", "Axes"],
  ["平面网格", "NumberPlane"],
];

export const tableOptions = [
  ["普通表格", "Table"],
  ["数学表格", "MathTable"],
];

export const matrixOptions = [
  ["普通矩阵", "Matrix"],
  ["整数矩阵", "IntegerMatrix"],
  ["小数矩阵", "DecimalMatrix"],
];

export const threeDObjectOptions = [
  ["球体", "Sphere"],
  ["立方体", "Cube"],
  ["圆锥", "Cone"],
  ["圆柱", "Cylinder"],
  ["棱柱", "Prism"],
  ["圆环面", "Torus"],
];

export const threeDObjectArgumentDefaults: Record<string, string> = {
  Sphere: "radius=1",
  Cube: "side_length=2",
  Cone: "",
  Cylinder: "",
  Prism: "",
  Torus: "",
};

export const creationAnimationOptions = [
  ["绘制", "Create"],
  ["书写", "Write"],
  ["反向绘制", "Uncreate"],
  ["反向书写", "Unwrite"],
  ["先描边再填充", "DrawBorderThenFill"],
];

export const fadeAnimationOptions = [
  ["淡入", "FadeIn"],
  ["淡出", "FadeOut"],
];

export const transformAnimationOptions = [
  ["变形", "Transform"],
  ["替换变形", "ReplacementTransform"],
  ["复制后变形", "TransformFromCopy"],
  ["顺时针变形", "ClockwiseTransform"],
  ["逆时针变形", "CounterclockwiseTransform"],
  ["淡化变形", "FadeTransform"],
];

export const animateMethodOptions = [
  ["相对移动", "shift"],
  ["缩放", "scale"],
  ["移动到", "move_to"],
  ["旋转", "rotate"],
  ["移动到边缘", "to_edge"],
  ["设置颜色", "set_color"],
  ["设置透明度", "set_opacity"],
];

export const animateMethodDefaults: Record<string, string> = {
  shift: "RIGHT",
  scale: "2",
  move_to: "ORIGIN",
  rotate: "PI / 2",
  to_edge: "UP",
  set_color: "BLUE",
  set_opacity: "0.5",
};

export const growAnimationOptions = [
  ["从中心生长", "GrowFromCenter"],
  ["从指定点生长", "GrowFromPoint"],
  ["从边缘生长", "GrowFromEdge"],
  ["箭头生长", "GrowArrow"],
  ["旋转出现", "SpinInFromNothing"],
  ["缩小到中心", "ShrinkToCenter"],
];

export const growAnimationArgumentDefaults: Record<string, string> = {
  GrowFromCenter: "",
  GrowFromPoint: "ORIGIN",
  GrowFromEdge: "DOWN",
  GrowArrow: "",
  SpinInFromNothing: "",
  ShrinkToCenter: "",
};

export const indicationAnimationOptions = [
  ["闪烁强调", "Indicate"],
  ["圈出", "Circumscribe"],
  ["摆动", "Wiggle"],
  ["波浪", "ApplyWave"],
  ["内外翻转", "TurnInsideOut"],
  ["流光", "ShowPassingFlash"],
];

export const colorOptions = [
  ["白色", "WHITE"],
  ["黑色", "BLACK"],
  ["红色", "RED"],
  ["绿色", "GREEN"],
  ["蓝色", "BLUE"],
  ["黄色", "YELLOW"],
  ["紫色", "PURPLE"],
  ["橙色", "ORANGE"],
  ["灰色", "GRAY"],
  ["青色", "TEAL"],
];

export const directionOptions = [
  ["中心", "ORIGIN"],
  ["上方", "UP"],
  ["下方", "DOWN"],
  ["左侧", "LEFT"],
  ["右侧", "RIGHT"],
  ["左上", "UL"],
  ["右上", "UR"],
  ["左下", "DL"],
  ["右下", "DR"],
  ["屏幕内", "IN"],
  ["屏幕外", "OUT"],
];

export const mathConstantOptions = [
  ["圆周率", "PI"],
  ["一周弧度", "TAU"],
  ["角度单位", "DEGREES"],
];

export const functionPresetOptions = [
  ["一次函数", "linear"],
  ["二次函数", "quadratic"],
  ["三次函数", "cubic"],
  ["正弦函数", "sine"],
  ["余弦函数", "cosine"],
  ["指数函数", "exponential"],
  ["绝对值函数", "absolute"],
];

export const surfaceFunctionPresetOptions = [
  ["平面", "plane"],
  ["波浪曲面", "wave"],
  ["鞍形曲面", "saddle"],
  ["抛物面", "paraboloid"],
];

export const shapeArgumentDefaults: Record<string, string> = {
  Circle: "radius=1",
  Square: "side_length=2",
  Rectangle: "width=3, height=2",
  Dot: "",
};
