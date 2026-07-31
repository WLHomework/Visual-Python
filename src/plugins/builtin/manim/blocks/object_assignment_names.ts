import * as Blockly from "blockly/core";
import { safeIdentifier } from "../helpers";

const classNameToVariableName = (name: string) => {
  const specialNames: Record<string, string> = {
    MathTex: "formula",
    Tex: "tex",
    Text: "text",
    NumberLine: "number_line",
    NumberPlane: "plane",
    ComplexPlane: "complex_plane",
    PolarPlane: "polar_plane",
    ThreeDAxes: "axes3d",
    Arrow3D: "arrow3d",
    VGroup: "group",
  };
  if (specialNames[name]) return specialNames[name];
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .toLowerCase();
};

const inferManimObjectVariableName = (block: Blockly.Block | null) => {
  if (!block) return "obj";
  const fieldNameByBlockType: Record<string, string> = {
    visual_python_manim_text_object: "OBJECT",
    visual_python_manim_shape_object: "SHAPE",
    visual_python_manim_curved_shape_object: "OBJECT",
    visual_python_manim_line_object: "OBJECT",
    visual_python_manim_coordinate_object: "SYSTEM",
    visual_python_manim_table_object: "OBJECT",
    visual_python_manim_matrix_object: "OBJECT",
    visual_python_manim_3d_object: "OBJECT",
  };
  const directNames: Record<string, string> = {
    visual_python_manim_plain_text_object: "text",
    visual_python_manim_tex_object: "tex",
    visual_python_manim_mathtex_object: "formula",
    visual_python_manim_circle_object: "circle",
    visual_python_manim_square_object: "square",
    visual_python_manim_rectangle_object: "rectangle",
    visual_python_manim_dot_object: "dot",
    visual_python_manim_triangle_object: "triangle",
    visual_python_manim_regular_polygon_object: "polygon",
    visual_python_manim_polygon_points_object: "polygon",
    visual_python_manim_rounded_rectangle_object: "rounded_rectangle",
    visual_python_manim_ellipse_object: "ellipse",
    visual_python_manim_arc_object: "arc",
    visual_python_manim_sector_object: "sector",
    visual_python_manim_annulus_object: "annulus",
    visual_python_manim_line_segment_object: "line",
    visual_python_manim_dashed_line_object: "dashed_line",
    visual_python_manim_arrow_object: "arrow",
    visual_python_manim_double_arrow_object: "double_arrow",
    visual_python_manim_curved_arrow_object: "curved_arrow",
    visual_python_manim_vector_object: "vector",
    visual_python_manim_number_line_object: "number_line",
    visual_python_manim_axes_object: "axes",
    visual_python_manim_number_plane_object: "plane",
    visual_python_manim_complex_plane_object: "complex_plane",
    visual_python_manim_polar_plane_object: "polar_plane",
    visual_python_manim_three_d_axes_object: "axes3d",
    visual_python_manim_sphere_object: "sphere",
    visual_python_manim_cube_object: "cube",
    visual_python_manim_cone_object: "cone",
    visual_python_manim_cylinder_object: "cylinder",
    visual_python_manim_prism_object: "prism",
    visual_python_manim_torus_object: "torus",
    visual_python_manim_arrow3d_object: "arrow3d",
    visual_python_manim_group_object: "group",
    visual_python_manim_brace: "brace",
    visual_python_manim_brace_label: "brace_label",
    visual_python_manim_surrounding_rectangle: "box",
    visual_python_manim_angle: "angle",
    visual_python_manim_right_angle: "right_angle",
    visual_python_manim_determinant_object: "determinant",
    visual_python_manim_value_tracker: "tracker",
    visual_python_manim_decimal_number: "number",
    visual_python_manim_variable: "variable",
    visual_python_manim_decimal_follow_tracker: "counter",
    visual_python_manim_always_redraw: "dynamic_object",
    visual_python_manim_traced_path: "traced_path",
    visual_python_manim_axes_plot: "graph",
    visual_python_manim_axis_labels: "labels",
    visual_python_manim_axes_area: "area",
    visual_python_manim_parametric_surface: "surface",
  };
  const fieldName = fieldNameByBlockType[block.type];
  if (fieldName) return classNameToVariableName(String(block.getFieldValue(fieldName) || "obj"));
  return directNames[block.type] || "obj";
};

export const registerAssignDefaultNameExtension = () => {
  const extensionName = "visual_python_manim_assign_default_name";
  if (Blockly.Extensions.isRegistered(extensionName)) return;
  Blockly.Extensions.register(extensionName, function (this: Blockly.Block & { lastAutoVarName_?: string }) {
    this.lastAutoVarName_ = safeIdentifier(this.getFieldValue("VAR"), "obj");
    this.setOnChange(() => {
      const currentName = safeIdentifier(this.getFieldValue("VAR"), "obj");
      const previousAutoName = this.lastAutoVarName_ || "obj";
      if (currentName !== "obj" && currentName !== previousAutoName) return;
      const nextName = safeIdentifier(inferManimObjectVariableName(this.getInputTargetBlock("MOBJECT")), "obj");
      this.lastAutoVarName_ = nextName;
      if (nextName !== currentName) this.setFieldValue(nextName, "VAR");
    });
  });
};
