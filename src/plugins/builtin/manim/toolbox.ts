import type { PluginContext } from "../../api/types";
import { colour, manimBlockColours } from "./constants";
import { animationListShadow, category, degreesShadow, directionShadow, dynamicMatrixDataShadow, dynamicTableDataShadow, expressionShadow, manimObjectListShadow, numberShadow, pointShadow, polygonVertexListShadow, rangeMinMaxShadow, rangeShadow, textShadow, toolboxBlock } from "./helpers";

const colouredCategory = (categoryColour: string) => (name: string, contents: Array<Record<string, unknown>>) => category(name, contents, categoryColour);
const sceneCategory = colouredCategory(manimBlockColours.scene);
const objectCategory = colouredCategory(manimBlockColours.object);
const animationCategory = colouredCategory(manimBlockColours.animation);
const valueCategory = colouredCategory(manimBlockColours.value);
const dynamicCategory = colouredCategory(manimBlockColours.dynamic);
const methodCategory = colouredCategory(manimBlockColours.method);

export const registerManimToolbox = (context: PluginContext) => {
  context.registerToolboxCategory({
    id: "visual-python.manim.toolbox",
    name: "Manim",
    colour,
    contents: [
      category("常用 Manim", [
        toolboxBlock("visual_python_manim_scene"),
        toolboxBlock("visual_python_manim_plain_text_object", {
          CONTENT: textShadow("Hello Manim"),
          FONT_SIZE: numberShadow(48),
        }),
        toolboxBlock("visual_python_manim_mathtex_object", {
          CONTENT: textShadow("x^2 + y^2 = z^2"),
          FONT_SIZE: numberShadow(48),
        }),
        toolboxBlock("visual_python_manim_circle_object", { RADIUS: numberShadow(1) }),
        toolboxBlock("visual_python_manim_square_object", { SIDE_LENGTH: numberShadow(2) }),
        toolboxBlock("visual_python_manim_rectangle_object", {
          WIDTH: numberShadow(3),
          HEIGHT: numberShadow(2),
        }),
        toolboxBlock("visual_python_manim_line_segment_object", {
          START: directionShadow("LEFT"),
          END: directionShadow("RIGHT"),
        }),
        toolboxBlock("visual_python_manim_arrow_object", {
          START: directionShadow("LEFT"),
          END: directionShadow("RIGHT"),
          BUFF: numberShadow(0),
        }),
        toolboxBlock("visual_python_manim_axes_object", {
          X_RANGE: rangeShadow(-5, 5, 1),
          Y_RANGE: rangeShadow(-3, 3, 1),
          X_LENGTH: numberShadow(10),
          Y_LENGTH: numberShadow(6),
        }),
        toolboxBlock("visual_python_manim_assign"),
        toolboxBlock("visual_python_manim_assign_add"),
        toolboxBlock("visual_python_manim_object_ref"),
        toolboxBlock("visual_python_manim_add"),
        toolboxBlock("visual_python_manim_play"),
        toolboxBlock("visual_python_manim_wait", { SECONDS: numberShadow(1) }),
        toolboxBlock("visual_python_manim_create_object_animation", { RUN_TIME: numberShadow(1) }),
        toolboxBlock("visual_python_manim_write_animation", { RUN_TIME: numberShadow(1) }),
        toolboxBlock("visual_python_manim_fade_in_animation", {
          SHIFT: directionShadow("ORIGIN"),
          SCALE: numberShadow(1),
          RUN_TIME: numberShadow(1),
        }),
        toolboxBlock("visual_python_manim_transform_to_animation", { RUN_TIME: numberShadow(1) }),
        toolboxBlock("visual_python_manim_animate_shift", {
          VECTOR: directionShadow("RIGHT"),
          RUN_TIME: numberShadow(1),
        }),
        toolboxBlock("visual_python_manim_set_color"),
      ]),

      sceneCategory("场景与流程", [
        sceneCategory("场景定义", [
          toolboxBlock("visual_python_manim_scene"),
        ]),
        sceneCategory("播放控制", [
          toolboxBlock("visual_python_manim_play"),
          toolboxBlock("visual_python_manim_play_with_options", {
            RUN_TIME: numberShadow(1),
            LAG_RATIO: numberShadow(0),
          }),
          toolboxBlock("visual_python_manim_play_two", {
            RUN_TIME: numberShadow(1),
            LAG_RATIO: numberShadow(0),
          }),
          toolboxBlock("visual_python_manim_wait", { SECONDS: numberShadow(1) }),
        ]),
        sceneCategory("对象管理", [
          toolboxBlock("visual_python_manim_add"),
          toolboxBlock("visual_python_manim_add_two"),
          toolboxBlock("visual_python_manim_remove"),
          toolboxBlock("visual_python_manim_remove_two"),
          toolboxBlock("visual_python_manim_clear"),
        ]),
        sceneCategory("3D 相机", [
          toolboxBlock("visual_python_manim_camera_frame_animation", {
            SCALE: numberShadow(0.6),
            RUN_TIME: numberShadow(2),
          }),
          toolboxBlock("visual_python_manim_3d_camera_orientation", {
            PHI: degreesShadow(75),
            THETA: degreesShadow(30),
            DISTANCE: numberShadow(8),
          }),
          toolboxBlock("visual_python_manim_3d_move_camera", {
            PHI: degreesShadow(75),
            THETA: degreesShadow(30),
            DISTANCE: numberShadow(8),
            RUN_TIME: numberShadow(2),
          }),
          toolboxBlock("visual_python_manim_3d_ambient_rotation", { RATE: numberShadow(0.1) }),
        ]),
      ]),

      objectCategory("对象", [
        objectCategory("文本与公式", [
          toolboxBlock("visual_python_manim_plain_text_object", {
            CONTENT: textShadow("Hello Manim"),
            FONT_SIZE: numberShadow(48),
          }),
          toolboxBlock("visual_python_manim_tex_object", {
            CONTENT: textShadow("Hello Manim"),
            FONT_SIZE: numberShadow(48),
          }),
          toolboxBlock("visual_python_manim_mathtex_object", {
            CONTENT: textShadow("x^2 + y^2 = z^2"),
            FONT_SIZE: numberShadow(48),
          }),
          toolboxBlock("visual_python_manim_text_object", { CONTENT: textShadow("Hello Manim") }),
        ]),
        objectCategory("基础几何", [
          toolboxBlock("visual_python_manim_circle_object", { RADIUS: numberShadow(1) }),
          toolboxBlock("visual_python_manim_square_object", { SIDE_LENGTH: numberShadow(2) }),
          toolboxBlock("visual_python_manim_rectangle_object", {
            WIDTH: numberShadow(3),
            HEIGHT: numberShadow(2),
          }),
          toolboxBlock("visual_python_manim_dot_object", {
            POINT: pointShadow(0, 0, 0),
            RADIUS: numberShadow(0.08),
          }),
          toolboxBlock("visual_python_manim_triangle_object"),
          toolboxBlock("visual_python_manim_regular_polygon_object", {
            N: numberShadow(6),
            RADIUS: numberShadow(1),
          }),
          toolboxBlock("visual_python_manim_polygon_points_object", {
            POINTS: polygonVertexListShadow(),
          }),
          toolboxBlock("visual_python_manim_rounded_rectangle_object", {
            WIDTH: numberShadow(3),
            HEIGHT: numberShadow(2),
            CORNER_RADIUS: numberShadow(0.2),
          }),
          toolboxBlock("visual_python_manim_ellipse_object", {
            WIDTH: numberShadow(3),
            HEIGHT: numberShadow(2),
          }),
          toolboxBlock("visual_python_manim_arc_object", {
            RADIUS: numberShadow(1),
            ANGLE: degreesShadow(90),
          }),
          toolboxBlock("visual_python_manim_sector_object", {
            OUTER_RADIUS: numberShadow(1),
            ANGLE: degreesShadow(90),
          }),
          toolboxBlock("visual_python_manim_annulus_object", {
            INNER_RADIUS: numberShadow(0.5),
            OUTER_RADIUS: numberShadow(1),
          }),
        ]),
        objectCategory("线条与箭头", [
          toolboxBlock("visual_python_manim_line_segment_object", {
            START: directionShadow("LEFT"),
            END: directionShadow("RIGHT"),
          }),
          toolboxBlock("visual_python_manim_dashed_line_object", {
            START: directionShadow("LEFT"),
            END: directionShadow("RIGHT"),
            DASH_LENGTH: numberShadow(0.05),
          }),
          toolboxBlock("visual_python_manim_arrow_object", {
            START: directionShadow("LEFT"),
            END: directionShadow("RIGHT"),
            BUFF: numberShadow(0),
          }),
          toolboxBlock("visual_python_manim_double_arrow_object", {
            START: directionShadow("LEFT"),
            END: directionShadow("RIGHT"),
            BUFF: numberShadow(0),
          }),
          toolboxBlock("visual_python_manim_curved_arrow_object", {
            START: directionShadow("LEFT"),
            END: directionShadow("RIGHT"),
            ANGLE: degreesShadow(90),
          }),
          toolboxBlock("visual_python_manim_vector_object", { DIRECTION: directionShadow("RIGHT") }),
        ]),
        objectCategory("坐标对象", [
          toolboxBlock("visual_python_manim_number_line_object", {
            X_RANGE: rangeShadow(-5, 5, 1),
            LENGTH: numberShadow(10),
          }),
          toolboxBlock("visual_python_manim_axes_object", {
            X_RANGE: rangeShadow(-5, 5, 1),
            Y_RANGE: rangeShadow(-3, 3, 1),
            X_LENGTH: numberShadow(10),
            Y_LENGTH: numberShadow(6),
          }),
          toolboxBlock("visual_python_manim_number_plane_object", {
            X_RANGE: rangeShadow(-7, 7, 1),
            Y_RANGE: rangeShadow(-4, 4, 1),
            X_LENGTH: numberShadow(14),
            Y_LENGTH: numberShadow(8),
          }),
          toolboxBlock("visual_python_manim_complex_plane_object", {
            X_RANGE: rangeShadow(-5, 5, 1),
            Y_RANGE: rangeShadow(-3, 3, 1),
          }),
          toolboxBlock("visual_python_manim_polar_plane_object", {
            RADIUS_MAX: numberShadow(4),
            RADIUS_STEP: numberShadow(1),
            SIZE: numberShadow(6),
          }),
          toolboxBlock("visual_python_manim_three_d_axes_object", {
            X_RANGE: rangeShadow(-6, 6, 1),
            Y_RANGE: rangeShadow(-5, 5, 1),
            Z_RANGE: rangeShadow(-4, 4, 1),
          }),
        ]),
        objectCategory("坐标方法", [
          toolboxBlock("visual_python_manim_axes_plot", {
            FUNCTION: expressionShadow("lambda x: x**2"),
            X_RANGE: rangeMinMaxShadow(-3, 3),
          }),
          toolboxBlock("visual_python_manim_axes_c2p", {
            X: numberShadow(0),
            Y: numberShadow(0),
          }),
          toolboxBlock("visual_python_manim_axes_p2c", {
            POINT: directionShadow("ORIGIN"),
          }),
          toolboxBlock("visual_python_manim_axis_labels", {
            X_LABEL: textShadow("x"),
            Y_LABEL: textShadow("y"),
          }),
          toolboxBlock("visual_python_manim_axes_area", {
            X_RANGE: rangeMinMaxShadow(-1, 1),
          }),
        ]),
        objectCategory("表格与矩阵", [
          toolboxBlock("visual_python_manim_table_object", {
            DATA: dynamicTableDataShadow(),
          }),
          toolboxBlock("visual_python_manim_matrix_object", {
            DATA: dynamicMatrixDataShadow(),
          }),
          toolboxBlock("visual_python_manim_determinant_object", {
            DATA: dynamicMatrixDataShadow(),
          }),
          toolboxBlock("visual_python_manim_table_highlight_cell", {
            ROW: numberShadow(1),
            COLUMN: numberShadow(1),
          }),
        ]),
        objectCategory("标注与装饰", [
          toolboxBlock("visual_python_manim_brace", { DIRECTION: directionShadow("DOWN") }),
          toolboxBlock("visual_python_manim_brace_label", {
            LABEL: textShadow("label"),
            DIRECTION: directionShadow("DOWN"),
          }),
          toolboxBlock("visual_python_manim_surrounding_rectangle", { BUFF: numberShadow(0.1) }),
          toolboxBlock("visual_python_manim_angle", { RADIUS: numberShadow(0.5) }),
          toolboxBlock("visual_python_manim_right_angle", { LENGTH: numberShadow(0.25) }),
        ]),
        objectCategory("3D 对象", [
          toolboxBlock("visual_python_manim_sphere_object", {
            RADIUS: numberShadow(1),
            FILL_OPACITY: numberShadow(0.75),
          }),
          toolboxBlock("visual_python_manim_cube_object", {
            SIDE_LENGTH: numberShadow(2),
            FILL_OPACITY: numberShadow(0.75),
          }),
          toolboxBlock("visual_python_manim_cone_object", {
            BASE_RADIUS: numberShadow(1),
            HEIGHT: numberShadow(2),
            DIRECTION: directionShadow("OUT"),
          }),
          toolboxBlock("visual_python_manim_cylinder_object", {
            RADIUS: numberShadow(1),
            HEIGHT: numberShadow(2),
            DIRECTION: directionShadow("OUT"),
          }),
          toolboxBlock("visual_python_manim_prism_object", {
            DIMENSIONS: expressionShadow("[3, 2, 1]"),
            FILL_OPACITY: numberShadow(0.75),
          }),
          toolboxBlock("visual_python_manim_torus_object", {
            MAJOR_RADIUS: numberShadow(3),
            MINOR_RADIUS: numberShadow(1),
            FILL_OPACITY: numberShadow(0.75),
          }),
          toolboxBlock("visual_python_manim_parametric_surface", {
            FUNCTION: expressionShadow("lambda u, v: np.array([u, v, 0])"),
            U_RANGE: rangeMinMaxShadow(-3, 3),
            V_RANGE: rangeMinMaxShadow(-3, 3),
            RESOLUTION: numberShadow(24),
          }),
          toolboxBlock("visual_python_manim_arrow3d_object", {
            START: directionShadow("ORIGIN"),
            END: directionShadow("OUT"),
            THICKNESS: numberShadow(0.02),
            HEIGHT: numberShadow(0.3),
            BASE_RADIUS: numberShadow(0.08),
          }),
        ]),
        objectCategory("复用与组合", [
          toolboxBlock("visual_python_manim_group_object"),
          toolboxBlock("visual_python_manim_assign"),
          toolboxBlock("visual_python_manim_assign_add"),
          toolboxBlock("visual_python_manim_object_ref"),
        ]),
      ]),

      animationCategory("动画效果", [
        animationCategory("创建 / 消失", [
          toolboxBlock("visual_python_manim_create_object_animation", { RUN_TIME: numberShadow(1) }),
          toolboxBlock("visual_python_manim_write_animation", { RUN_TIME: numberShadow(1) }),
          toolboxBlock("visual_python_manim_uncreate_animation", { RUN_TIME: numberShadow(1) }),
          toolboxBlock("visual_python_manim_unwrite_animation", { RUN_TIME: numberShadow(1) }),
          toolboxBlock("visual_python_manim_draw_border_then_fill_animation", { RUN_TIME: numberShadow(1) }),
        ]),
        animationCategory("淡入淡出", [
          toolboxBlock("visual_python_manim_fade_in_animation", {
            SHIFT: directionShadow("ORIGIN"),
            SCALE: numberShadow(1),
            RUN_TIME: numberShadow(1),
          }),
          toolboxBlock("visual_python_manim_fade_out_animation", {
            SHIFT: directionShadow("ORIGIN"),
            SCALE: numberShadow(1),
            RUN_TIME: numberShadow(1),
          }),
        ]),
        animationCategory("变换动画", [
          toolboxBlock("visual_python_manim_transform_to_animation", { RUN_TIME: numberShadow(1) }),
          toolboxBlock("visual_python_manim_replacement_transform_animation", { RUN_TIME: numberShadow(1) }),
          toolboxBlock("visual_python_manim_transform_from_copy_animation", { RUN_TIME: numberShadow(1) }),
          toolboxBlock("visual_python_manim_fade_transform_animation", { RUN_TIME: numberShadow(1) }),
        ]),
        animationCategory("属性动画", [
          toolboxBlock("visual_python_manim_animate_shift", {
            VECTOR: directionShadow("RIGHT"),
            RUN_TIME: numberShadow(1),
          }),
          toolboxBlock("visual_python_manim_animate_scale", {
            FACTOR: numberShadow(2),
            RUN_TIME: numberShadow(1),
          }),
          toolboxBlock("visual_python_manim_animate_rotate", {
            ANGLE: degreesShadow(90),
            RUN_TIME: numberShadow(1),
          }),
          toolboxBlock("visual_python_manim_animate_move_to", {
            POINT: directionShadow("ORIGIN"),
            RUN_TIME: numberShadow(1),
          }),
        ]),
        animationCategory("生长动画", [
          toolboxBlock("visual_python_manim_grow_from_center_animation", { RUN_TIME: numberShadow(1) }),
          toolboxBlock("visual_python_manim_grow_from_point_animation", {
            POINT: directionShadow("ORIGIN"),
            RUN_TIME: numberShadow(1),
          }),
          toolboxBlock("visual_python_manim_grow_from_edge_animation", {
            EDGE: directionShadow("DOWN"),
            RUN_TIME: numberShadow(1),
          }),
          toolboxBlock("visual_python_manim_grow_arrow_animation", { RUN_TIME: numberShadow(1) }),
          toolboxBlock("visual_python_manim_spin_in_from_nothing_animation", {
            ANGLE: degreesShadow(90),
            RUN_TIME: numberShadow(1),
          }),
          toolboxBlock("visual_python_manim_shrink_to_center_animation", { RUN_TIME: numberShadow(1) }),
        ]),
        animationCategory("强调动画", [
          toolboxBlock("visual_python_manim_indicate_animation", {
            SCALE_FACTOR: numberShadow(1.2),
            RUN_TIME: numberShadow(1),
          }),
          toolboxBlock("visual_python_manim_circumscribe_animation", {
            BUFF: numberShadow(0.1),
            RUN_TIME: numberShadow(1),
          }),
          toolboxBlock("visual_python_manim_wiggle_animation", {
            SCALE_VALUE: numberShadow(1.1),
            ROTATION_ANGLE: expressionShadow("0.01 * TAU"),
            N_WIGGLES: numberShadow(6),
            RUN_TIME: numberShadow(2),
          }),
          toolboxBlock("visual_python_manim_apply_wave_animation", {
            DIRECTION: directionShadow("UP"),
            AMPLITUDE: numberShadow(0.2),
            RIPPLES: numberShadow(1),
            RUN_TIME: numberShadow(2),
          }),
          toolboxBlock("visual_python_manim_show_passing_flash_animation", {
            TIME_WIDTH: numberShadow(0.1),
            RUN_TIME: numberShadow(1),
          }),
        ]),
      ]),

      valueCategory("坐标与数学工具", [
        toolboxBlock("visual_python_manim_direction_constant"),
        toolboxBlock("visual_python_manim_scaled_direction", { SCALE: numberShadow(2) }),
        toolboxBlock("visual_python_manim_math_constant"),
        toolboxBlock("visual_python_manim_degrees"),
        toolboxBlock("visual_python_manim_range", {
          START: numberShadow(-5),
          END: numberShadow(5),
          STEP: numberShadow(1),
        }),
        toolboxBlock("visual_python_manim_range_min_max", {
          START: numberShadow(-3),
          END: numberShadow(3),
        }),
        toolboxBlock("visual_python_manim_point", {
          X: numberShadow(0),
          Y: numberShadow(0),
          Z: numberShadow(0),
        }),
        toolboxBlock("visual_python_manim_point_list_3"),
        toolboxBlock("visual_python_manim_table_data_2x2"),
        toolboxBlock("visual_python_manim_matrix_data_2x2"),
        toolboxBlock("visual_python_manim_color_constant"),
      ]),

      objectCategory("Manim 动态结构", [
        toolboxBlock("visual_python_manim_play_list", {
          ANIMATIONS: animationListShadow(),
          RUN_TIME: numberShadow(1),
          LAG_RATIO: numberShadow(0),
        }),
        toolboxBlock("visual_python_manim_polygon_from_list_object", {
          POINTS: polygonVertexListShadow(),
        }),
        toolboxBlock("visual_python_manim_group_from_list_object", {
          OBJECTS: manimObjectListShadow(),
        }),
        toolboxBlock("visual_python_manim_table_object", {
          DATA: dynamicTableDataShadow(),
        }),
        toolboxBlock("visual_python_manim_matrix_object", {
          DATA: dynamicMatrixDataShadow(),
        }),
        toolboxBlock("visual_python_manim_determinant_object", {
          DATA: dynamicMatrixDataShadow(),
        }),
      ]),

      dynamicCategory("动态绑定", [
        toolboxBlock("visual_python_manim_value_tracker", { VALUE: numberShadow(0) }),
        toolboxBlock("visual_python_manim_decimal_number", {
          VALUE: numberShadow(0),
          PLACES: numberShadow(2),
        }),
        toolboxBlock("visual_python_manim_variable", {
          VALUE: numberShadow(0),
          LABEL: textShadow("x"),
        }),
        toolboxBlock("visual_python_manim_tracker_get_value"),
        toolboxBlock("visual_python_manim_always_redraw"),
        toolboxBlock("visual_python_manim_traced_path", { WIDTH: numberShadow(4) }),
        toolboxBlock("visual_python_manim_decimal_follow_tracker", { PLACES: numberShadow(2) }),
        toolboxBlock("visual_python_manim_follow_target_updater", { DIRECTION: directionShadow("RIGHT") }),
        toolboxBlock("visual_python_manim_clear_updaters"),
        toolboxBlock("visual_python_manim_tracker_set_value_animation", { VALUE: numberShadow(10) }),
      ]),

      methodCategory("属性与样式", [
        methodCategory("样式设置", [
          toolboxBlock("visual_python_manim_set_color"),
          toolboxBlock("visual_python_manim_set_opacity", { OPACITY: numberShadow(0.5) }),
          toolboxBlock("visual_python_manim_set_fill", { OPACITY: numberShadow(1) }),
          toolboxBlock("visual_python_manim_set_stroke", {
            WIDTH: numberShadow(2),
            OPACITY: numberShadow(1),
          }),
        ]),
        methodCategory("位置变换", [
          toolboxBlock("visual_python_manim_move_to", { POINT: directionShadow("ORIGIN") }),
          toolboxBlock("visual_python_manim_shift", { VECTOR: directionShadow("RIGHT") }),
          toolboxBlock("visual_python_manim_scale", { FACTOR: numberShadow(1) }),
          toolboxBlock("visual_python_manim_rotate", { ANGLE: degreesShadow(90) }),
          toolboxBlock("visual_python_manim_to_edge", {
            DIRECTION: directionShadow("UP"),
            BUFF: numberShadow(0.5),
          }),
          toolboxBlock("visual_python_manim_to_corner", {
            DIRECTION: directionShadow("UR"),
            BUFF: numberShadow(0.5),
          }),
          toolboxBlock("visual_python_manim_next_to", {
            DIRECTION: directionShadow("RIGHT"),
            BUFF: numberShadow(0.25),
          }),
          toolboxBlock("visual_python_manim_arrange", {
            DIRECTION: directionShadow("RIGHT"),
            BUFF: numberShadow(0.5),
          }),
        ]),
      ]),

      objectCategory("高级 / 通用", [
        objectCategory("通用对象", [
          toolboxBlock("visual_python_manim_shape_object", { ARG: expressionShadow("radius=1") }),
          toolboxBlock("visual_python_manim_polygon_object", { ARG: expressionShadow("n=6") }),
          toolboxBlock("visual_python_manim_curved_shape_object", { ARG: expressionShadow("corner_radius=0.2, width=3, height=2") }),
          toolboxBlock("visual_python_manim_line_object", {
            START: directionShadow("LEFT"),
            END: directionShadow("RIGHT"),
          }),
          toolboxBlock("visual_python_manim_3d_object", { ARG: expressionShadow("radius=1") }),
          toolboxBlock("visual_python_manim_coordinate_object", {
            X_RANGE: rangeShadow(-5, 5, 1),
            Y_RANGE: rangeShadow(-3, 3, 1),
          }),
        ]),
        objectCategory("通用动画", [
          toolboxBlock("visual_python_manim_create_animation"),
          toolboxBlock("visual_python_manim_fade_animation"),
          toolboxBlock("visual_python_manim_transform_animation"),
          toolboxBlock("visual_python_manim_animate_method", { ARG: expressionShadow("RIGHT") }),
          toolboxBlock("visual_python_manim_grow_animation"),
          toolboxBlock("visual_python_manim_indication_animation"),
        ]),
        objectCategory("通用方法", [
          toolboxBlock("visual_python_manim_transform_method", { ARG: expressionShadow("1") }),
        ]),
      ]),
    ],
  });
};
