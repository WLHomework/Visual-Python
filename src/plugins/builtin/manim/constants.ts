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
  visual_python_manim_polygon_object: manimBlockColours.object,
  visual_python_manim_assign: manimBlockColours.object,
  visual_python_manim_assign_add: manimBlockColours.object,
  visual_python_manim_object_ref: manimBlockColours.object,
  visual_python_manim_scaled_direction: manimBlockColours.value,
  visual_python_manim_play_list: manimBlockColours.object,
  visual_python_manim_animate_method: manimBlockColours.animation,
  visual_python_manim_transform_method: manimBlockColours.object,
};

export const colourForManimBlock = (type: string): string => {
  if (blockColourOverrides[type]) return blockColourOverrides[type];
  if (hasAny(type, ["_tracker", "_updater", "_always_redraw", "_traced_path", "_decimal_follow", "_decimal_number", "_variable"])) return manimBlockColours.dynamic;
  if (hasAny(type, ["_scene", "_camera", "_ambient_rotation", "_add", "_remove", "_clear", "_wait", "_play"])) return manimBlockColours.scene;
  if (hasAny(type, ["_animation", "_animate_", "_play"])) return manimBlockColours.animation;
  if (hasAny(type, ["_set_color", "_set_opacity", "_set_fill", "_set_stroke", "_move_to", "_shift", "_scale", "_rotate", "_to_edge", "_to_corner", "_next_to", "_arrange"])) return manimBlockColours.method;
  if (hasAny(type, ["_direction_constant", "_scaled_direction", "_math_constant", "_degrees", "_range", "_point", "_color_constant", "_table_data", "_matrix_data"])) return manimBlockColours.value;
  return manimBlockColours.object;
};

export const sceneTypeOptions = [
  ["Scene", "Scene"],
  ["MovingCameraScene", "MovingCameraScene"],
  ["ThreeDScene", "ThreeDScene"],
  ["SpecialThreeDScene", "SpecialThreeDScene"],
];

export const textObjectOptions = [
  ["Text", "Text"],
  ["Tex", "Tex"],
  ["MathTex", "MathTex"],
];

export const shapeOptions = [
  ["Circle", "Circle"],
  ["Square", "Square"],
  ["Rectangle", "Rectangle"],
  ["Dot", "Dot"],
];

export const lineOptions = [
  ["Line", "Line"],
  ["DashedLine", "DashedLine"],
  ["Arrow", "Arrow"],
  ["DoubleArrow", "DoubleArrow"],
  ["CurvedArrow", "CurvedArrow"],
];

export const polygonOptions = [
  ["Triangle", "Triangle"],
  ["RegularPolygon", "RegularPolygon"],
  ["Polygon", "Polygon"],
];

export const polygonArgumentDefaults: Record<string, string> = {
  Triangle: "",
  RegularPolygon: "n=6",
  Polygon: "LEFT, UP, RIGHT",
};

export const curvedShapeOptions = [
  ["RoundedRectangle", "RoundedRectangle"],
  ["Ellipse", "Ellipse"],
  ["Arc", "Arc"],
  ["Sector", "Sector"],
  ["Annulus", "Annulus"],
];

export const curvedShapeArgumentDefaults: Record<string, string> = {
  RoundedRectangle: "corner_radius=0.2, width=3, height=2",
  Ellipse: "width=3, height=2",
  Arc: "radius=1, angle=PI / 2",
  Sector: "outer_radius=1, angle=PI / 2",
  Annulus: "inner_radius=0.5, outer_radius=1",
};

export const coordinateOptions = [
  ["Axes", "Axes"],
  ["NumberPlane", "NumberPlane"],
];

export const tableOptions = [
  ["Table", "Table"],
  ["MathTable", "MathTable"],
];

export const matrixOptions = [
  ["Matrix", "Matrix"],
  ["IntegerMatrix", "IntegerMatrix"],
  ["DecimalMatrix", "DecimalMatrix"],
];

export const threeDObjectOptions = [
  ["Sphere", "Sphere"],
  ["Cube", "Cube"],
  ["Cone", "Cone"],
  ["Cylinder", "Cylinder"],
  ["Prism", "Prism"],
  ["Torus", "Torus"],
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
  ["Create", "Create"],
  ["Write", "Write"],
  ["Uncreate", "Uncreate"],
  ["Unwrite", "Unwrite"],
  ["DrawBorderThenFill", "DrawBorderThenFill"],
];

export const fadeAnimationOptions = [
  ["FadeIn", "FadeIn"],
  ["FadeOut", "FadeOut"],
];

export const transformAnimationOptions = [
  ["Transform", "Transform"],
  ["ReplacementTransform", "ReplacementTransform"],
  ["TransformFromCopy", "TransformFromCopy"],
  ["ClockwiseTransform", "ClockwiseTransform"],
  ["CounterclockwiseTransform", "CounterclockwiseTransform"],
  ["FadeTransform", "FadeTransform"],
];

export const animateMethodOptions = [
  ["shift", "shift"],
  ["scale", "scale"],
  ["move_to", "move_to"],
  ["rotate", "rotate"],
  ["to_edge", "to_edge"],
  ["set_color", "set_color"],
  ["set_opacity", "set_opacity"],
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
  ["GrowFromCenter", "GrowFromCenter"],
  ["GrowFromPoint", "GrowFromPoint"],
  ["GrowFromEdge", "GrowFromEdge"],
  ["GrowArrow", "GrowArrow"],
  ["SpinInFromNothing", "SpinInFromNothing"],
  ["ShrinkToCenter", "ShrinkToCenter"],
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
  ["Indicate", "Indicate"],
  ["Circumscribe", "Circumscribe"],
  ["Wiggle", "Wiggle"],
  ["ApplyWave", "ApplyWave"],
  ["TurnInsideOut", "TurnInsideOut"],
  ["ShowPassingFlash", "ShowPassingFlash"],
];

export const colorOptions = [
  ["WHITE", "WHITE"],
  ["BLACK", "BLACK"],
  ["RED", "RED"],
  ["GREEN", "GREEN"],
  ["BLUE", "BLUE"],
  ["YELLOW", "YELLOW"],
  ["PURPLE", "PURPLE"],
  ["ORANGE", "ORANGE"],
];

export const directionOptions = [
  ["ORIGIN", "ORIGIN"],
  ["UP", "UP"],
  ["DOWN", "DOWN"],
  ["LEFT", "LEFT"],
  ["RIGHT", "RIGHT"],
  ["UL", "UL"],
  ["UR", "UR"],
  ["DL", "DL"],
  ["DR", "DR"],
  ["IN", "IN"],
  ["OUT", "OUT"],
];

export const mathConstantOptions = [
  ["PI", "PI"],
  ["TAU", "TAU"],
  ["DEGREES", "DEGREES"],
];

export const shapeArgumentDefaults: Record<string, string> = {
  Circle: "radius=1",
  Square: "side_length=2",
  Rectangle: "width=3, height=2",
  Dot: "",
};
