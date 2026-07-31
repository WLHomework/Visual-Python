import type { PluginContext } from "../../api/types";
import { colour, manimBlockColours } from "./constants";
import { animationListShadow, category, degreesShadow, directionShadow, dynamicMatrixDataShadow, dynamicTableDataShadow, formulaShadow, manimAxesShadow, manimCircleShadow, manimCreateAnimationShadow, manimDimensionsBlock, manimFunctionPresetBlock, manimLineShadow, manimObjectListShadow, manimSquareShadow, manimSurfaceFunctionPresetBlock, manimTrackerShadow, numberShadow, pointList3Inputs, pointShadow, polygonVertexListShadow, rangeMinMaxShadow, rangeShadow, textShadow, toolboxBlock } from "./helpers";

const colouredCategory = (categoryColour: string) => (name: string, contents: Array<Record<string, unknown>>) => category(name, contents, categoryColour);
const sceneCategory = colouredCategory(manimBlockColours.scene);
const objectCategory = colouredCategory(manimBlockColours.object);
const animationCategory = colouredCategory(manimBlockColours.animation);
const valueCategory = colouredCategory(manimBlockColours.value);
const dynamicCategory = colouredCategory(manimBlockColours.dynamic);
const methodCategory = colouredCategory(manimBlockColours.method);

export const hiddenCompatibilityBlockTypes = [
  "visual_python_manim_text_object",
  "visual_python_manim_shape_object",
  "visual_python_manim_curved_shape_object",
  "visual_python_manim_line_object",
  "visual_python_manim_3d_object",
  "visual_python_manim_coordinate_object",
  "visual_python_manim_create_animation",
  "visual_python_manim_fade_animation",
  "visual_python_manim_transform_animation",
  "visual_python_manim_animate_method",
  "visual_python_manim_grow_animation",
  "visual_python_manim_indication_animation",
  "visual_python_manim_transform_method",
] as const;

const tableShadow = () => ({
  block: {
    type: "visual_python_manim_table_object",
    fields: { OBJECT: "Table" },
    inputs: { DATA: dynamicTableDataShadow() },
  },
});

const fadeInAnimationShadow = () => ({
  block: {
    type: "visual_python_manim_fade_in_animation",
    inputs: {
      MOBJECT: manimSquareShadow(),
      SHIFT: directionShadow("ORIGIN"),
      SCALE: numberShadow(1),
      RUN_TIME: numberShadow(1),
    },
  },
});

const objectReferenceBlock = (name: string) => ({
  block: { type: "visual_python_manim_object_ref", fields: { VAR: name } },
});

const manimToolboxValueDefaults: Record<string, Record<string, unknown>> = {
  visual_python_manim_add: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_add_two: { FIRST: objectReferenceBlock("first"), SECOND: objectReferenceBlock("second") },
  visual_python_manim_always_redraw: { MOBJECT: manimCircleShadow() },
  visual_python_manim_angle: { LINE1: objectReferenceBlock("line1"), LINE2: objectReferenceBlock("line2") },
  visual_python_manim_animate_move_to: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_animate_rotate: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_animate_scale: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_animate_set_color: { MOBJECT: objectReferenceBlock("obj"), RUN_TIME: numberShadow(1) },
  visual_python_manim_animate_set_color_gradient: { MOBJECT: objectReferenceBlock("obj"), RUN_TIME: numberShadow(1) },
  visual_python_manim_animate_set_color_blend: { MOBJECT: objectReferenceBlock("obj"), RATIO: numberShadow(0.5), RUN_TIME: numberShadow(1) },
  visual_python_manim_animate_shift: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_apply_matrix: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_apply_wave_animation: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_arrange: { MOBJECT: objectReferenceBlock("group") },
  visual_python_manim_assign: { MOBJECT: manimCircleShadow() },
  visual_python_manim_assign_add: { MOBJECT: manimCircleShadow() },
  visual_python_manim_axes_area: { AXES: objectReferenceBlock("axes"), GRAPH: objectReferenceBlock("graph") },
  visual_python_manim_axes_c2p: { AXES: objectReferenceBlock("axes") },
  visual_python_manim_axes_p2c: { AXES: objectReferenceBlock("axes") },
  visual_python_manim_axes_plot: { AXES: objectReferenceBlock("axes") },
  visual_python_manim_axis_labels: { AXES: objectReferenceBlock("axes") },
  visual_python_manim_brace: { TARGET: objectReferenceBlock("obj") },
  visual_python_manim_brace_label: { TARGET: objectReferenceBlock("obj") },
  visual_python_manim_camera_frame_animation: { TARGET: objectReferenceBlock("obj") },
  visual_python_manim_circumscribe_animation: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_clear_updaters: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_create_object_animation: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_decimal_follow_tracker: { TRACKER: manimTrackerShadow() },
  visual_python_manim_draw_border_then_fill_animation: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_fade_in_animation: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_fade_out_animation: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_fade_transform_animation: { SOURCE: manimCircleShadow(), TARGET: manimSquareShadow() },
  visual_python_manim_follow_target_updater: { MOBJECT: objectReferenceBlock("obj"), TARGET: objectReferenceBlock("target") },
  visual_python_manim_group_object: { FIRST: manimCircleShadow(), SECOND: manimSquareShadow() },
  visual_python_manim_grow_arrow_animation: { ARROW: objectReferenceBlock("arrow") },
  visual_python_manim_grow_from_center_animation: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_grow_from_edge_animation: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_grow_from_point_animation: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_indicate_animation: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_matrix_data_2x2: {
    A: numberShadow(1), B: numberShadow(2), C: numberShadow(3), D: numberShadow(4),
  },
  visual_python_manim_move_to: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_next_to: { MOBJECT: objectReferenceBlock("obj"), TARGET: objectReferenceBlock("target") },
  visual_python_manim_play: { ANIMATION: manimCreateAnimationShadow() },
  visual_python_manim_play_two: { FIRST: manimCreateAnimationShadow(), SECOND: fadeInAnimationShadow() },
  visual_python_manim_play_with_options: { ANIMATION: manimCreateAnimationShadow() },
  visual_python_manim_point_list_3: pointList3Inputs(),
  visual_python_manim_remove: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_remove_two: { FIRST: objectReferenceBlock("first"), SECOND: objectReferenceBlock("second") },
  visual_python_manim_replacement_transform_animation: { SOURCE: manimCircleShadow(), TARGET: manimSquareShadow() },
  visual_python_manim_right_angle: { LINE1: objectReferenceBlock("line1"), LINE2: objectReferenceBlock("line2") },
  visual_python_manim_rotate: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_scale: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_set_color: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_set_color_gradient: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_set_color_gradient_three: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_set_color_blend: { MOBJECT: objectReferenceBlock("obj"), RATIO: numberShadow(0.5) },
  visual_python_manim_set_fill: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_set_opacity: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_set_stroke: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_shift: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_show_passing_flash_animation: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_shrink_to_center_animation: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_spin_in_from_nothing_animation: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_surrounding_rectangle: { TARGET: objectReferenceBlock("obj") },
  visual_python_manim_table_data_2x2: {
    A: textShadow("A"), B: textShadow("B"), C: textShadow("C"), D: textShadow("D"),
  },
  visual_python_manim_table_highlight_cell: { TABLE: tableShadow() },
  visual_python_manim_to_corner: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_to_edge: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_traced_path: { TARGET: objectReferenceBlock("obj") },
  visual_python_manim_tracker_get_value: { TRACKER: manimTrackerShadow() },
  visual_python_manim_tracker_set_value_animation: { TRACKER: manimTrackerShadow() },
  visual_python_manim_transform_from_copy_animation: { SOURCE: manimCircleShadow(), TARGET: manimSquareShadow() },
  visual_python_manim_transform_to_animation: { SOURCE: manimCircleShadow(), TARGET: manimSquareShadow() },
  visual_python_manim_uncreate_animation: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_unwrite_animation: { MOBJECT: objectReferenceBlock("text") },
  visual_python_manim_wiggle_animation: { MOBJECT: objectReferenceBlock("obj") },
  visual_python_manim_write_animation: { MOBJECT: objectReferenceBlock("text") },
};

const withManimToolboxDefaults = (contents: Array<Record<string, any>>): Array<Record<string, any>> =>
  contents.map((item) => {
    if (item.kind === "category") {
      return { ...item, contents: withManimToolboxDefaults(item.contents ?? []) };
    }
    if (item.kind !== "block") return item;
    const defaults = manimToolboxValueDefaults[item.type];
    return defaults ? { ...item, inputs: { ...defaults, ...(item.inputs ?? {}) } } : item;
  });

const starterSceneBlock = {
  kind: "block",
  type: "visual_python_manim_scene",
  fields: { NAME: "MainScene", SCENE_TYPE: "Scene" },
  inputs: {
    BODY: {
      block: {
        type: "visual_python_manim_assign",
        fields: { VAR: "circle" },
        inputs: { MOBJECT: manimCircleShadow("BLUE", 2) },
        next: {
          block: {
            type: "visual_python_manim_play",
            inputs: {
              ANIMATION: {
                block: {
                  type: "visual_python_manim_create_object_animation",
                  inputs: {
                    MOBJECT: { block: { type: "visual_python_manim_object_ref", fields: { VAR: "circle" } } },
                    RUN_TIME: numberShadow(1),
                  },
                },
              },
            },
            next: { block: { type: "visual_python_manim_wait", inputs: { SECONDS: numberShadow(1) } } },
          },
        },
      },
    },
  },
};

const dynamicTrackerSceneBlock = {
  kind: "block",
  type: "visual_python_manim_scene",
  fields: { NAME: "DynamicScene", SCENE_TYPE: "Scene" },
  inputs: {
    BODY: {
      block: {
        type: "visual_python_manim_assign",
        fields: { VAR: "tracker" },
        inputs: { MOBJECT: manimTrackerShadow() },
        next: {
          block: {
            type: "visual_python_manim_assign_add",
            fields: { VAR: "counter" },
            inputs: {
              MOBJECT: {
                block: {
                  type: "visual_python_manim_decimal_follow_tracker",
                  inputs: { TRACKER: objectReferenceBlock("tracker"), PLACES: numberShadow(1) },
                },
              },
            },
            next: {
              block: {
                type: "visual_python_manim_play",
                inputs: {
                  ANIMATION: {
                    block: {
                      type: "visual_python_manim_tracker_set_value_animation",
                      inputs: { TRACKER: objectReferenceBlock("tracker"), VALUE: numberShadow(10) },
                    },
                  },
                },
                next: { block: { type: "visual_python_manim_wait", inputs: { SECONDS: numberShadow(1) } } },
              },
            },
          },
        },
      },
    },
  },
};

const transformSceneBlock = {
  kind: "block",
  type: "visual_python_manim_scene",
  fields: { NAME: "TransformScene", SCENE_TYPE: "Scene" },
  inputs: {
    BODY: {
      block: {
        type: "visual_python_manim_assign",
        fields: { VAR: "source" },
        inputs: { MOBJECT: manimCircleShadow("BLUE", 1) },
        next: {
          block: {
            type: "visual_python_manim_assign",
            fields: { VAR: "target" },
            inputs: { MOBJECT: manimSquareShadow("RED", 2) },
            next: {
              block: {
                type: "visual_python_manim_play",
                inputs: {
                  ANIMATION: {
                    block: {
                      type: "visual_python_manim_create_object_animation",
                      inputs: { MOBJECT: objectReferenceBlock("source"), RUN_TIME: numberShadow(1) },
                    },
                  },
                },
                next: {
                  block: {
                    type: "visual_python_manim_play",
                    inputs: {
                      ANIMATION: {
                        block: {
                          type: "visual_python_manim_transform_to_animation",
                          inputs: {
                            SOURCE: objectReferenceBlock("source"),
                            TARGET: objectReferenceBlock("target"),
                            RUN_TIME: numberShadow(1),
                          },
                        },
                      },
                    },
                    next: { block: { type: "visual_python_manim_wait", inputs: { SECONDS: numberShadow(1) } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

const chainStatementBlocks = (blocks: Array<Record<string, any>>): Record<string, any> => {
  const root = blocks.reduceRight<Record<string, any> | null>((next, block) => (
    next ? { ...block, next: { block: next } } : block
  ), null);
  if (!root) throw new Error("Manim toolbox statement chain cannot be empty");
  return root;
};

const playAnimationBlock = (animation: Record<string, any>) => ({
  type: "visual_python_manim_play",
  inputs: { ANIMATION: { block: animation } },
});

const createReferencedObjectAnimation = (name: string) => ({
  type: "visual_python_manim_create_object_animation",
  inputs: { MOBJECT: objectReferenceBlock(name), RUN_TIME: numberShadow(1) },
});

const functionGraphSceneBlock = {
  kind: "block",
  type: "visual_python_manim_scene",
  fields: { NAME: "FunctionGraphScene", SCENE_TYPE: "Scene" },
  inputs: {
    BODY: {
      block: chainStatementBlocks([
        {
          type: "visual_python_manim_assign",
          fields: { VAR: "axes" },
          inputs: { MOBJECT: manimAxesShadow() },
        },
        {
          type: "visual_python_manim_assign",
          fields: { VAR: "graph" },
          inputs: {
            MOBJECT: {
              block: {
                type: "visual_python_manim_axes_plot",
                fields: { COLOR: "YELLOW" },
                inputs: {
                  AXES: objectReferenceBlock("axes"),
                  FUNCTION: manimFunctionPresetBlock("quadratic"),
                  X_RANGE: rangeMinMaxShadow(-3, 3),
                },
              },
            },
          },
        },
        {
          type: "visual_python_manim_assign",
          fields: { VAR: "area" },
          inputs: {
            MOBJECT: {
              block: {
                type: "visual_python_manim_axes_area",
                fields: { COLOR: "BLUE" },
                inputs: {
                  AXES: objectReferenceBlock("axes"),
                  GRAPH: objectReferenceBlock("graph"),
                  X_RANGE: rangeMinMaxShadow(-2, 2),
                },
              },
            },
          },
        },
        {
          type: "visual_python_manim_assign",
          fields: { VAR: "labels" },
          inputs: {
            MOBJECT: {
              block: {
                type: "visual_python_manim_axis_labels",
                inputs: {
                  AXES: objectReferenceBlock("axes"),
                  X_LABEL: textShadow("x"),
                  Y_LABEL: textShadow("y"),
                },
              },
            },
          },
        },
        playAnimationBlock(createReferencedObjectAnimation("axes")),
        playAnimationBlock(createReferencedObjectAnimation("graph")),
        playAnimationBlock({
          type: "visual_python_manim_fade_in_animation",
          inputs: {
            MOBJECT: objectReferenceBlock("area"),
            SHIFT: directionShadow("ORIGIN"),
            SCALE: numberShadow(1),
            RUN_TIME: numberShadow(1),
          },
        }),
        playAnimationBlock(createReferencedObjectAnimation("labels")),
        { type: "visual_python_manim_wait", inputs: { SECONDS: numberShadow(1) } },
      ]),
    },
  },
};

const tableSceneBlock = {
  kind: "block",
  type: "visual_python_manim_scene",
  fields: { NAME: "TableScene", SCENE_TYPE: "Scene" },
  inputs: {
    BODY: {
      block: chainStatementBlocks([
        {
          type: "visual_python_manim_assign",
          fields: { VAR: "table" },
          inputs: {
            MOBJECT: {
              block: {
                type: "visual_python_manim_table_object",
                fields: { OBJECT: "Table" },
                inputs: { DATA: dynamicTableDataShadow() },
              },
            },
          },
        },
        {
          type: "visual_python_manim_assign",
          fields: { VAR: "highlighted_table" },
          inputs: {
            MOBJECT: {
              block: {
                type: "visual_python_manim_table_highlight_cell",
                fields: { COLOR: "YELLOW" },
                inputs: {
                  TABLE: objectReferenceBlock("table"),
                  ROW: numberShadow(2),
                  COLUMN: numberShadow(2),
                },
              },
            },
          },
        },
        playAnimationBlock(createReferencedObjectAnimation("highlighted_table")),
        { type: "visual_python_manim_wait", inputs: { SECONDS: numberShadow(1) } },
      ]),
    },
  },
};

const groupSceneBlock = {
  kind: "block",
  type: "visual_python_manim_scene",
  fields: { NAME: "GroupScene", SCENE_TYPE: "Scene" },
  inputs: {
    BODY: {
      block: chainStatementBlocks([
        {
          type: "visual_python_manim_assign",
          fields: { VAR: "circle" },
          inputs: { MOBJECT: manimCircleShadow("BLUE", 1) },
        },
        {
          type: "visual_python_manim_assign",
          fields: { VAR: "square" },
          inputs: { MOBJECT: manimSquareShadow("RED", 2) },
        },
        {
          type: "visual_python_manim_assign",
          fields: { VAR: "group" },
          inputs: {
            MOBJECT: {
              block: {
                type: "visual_python_manim_arrange",
                fields: { CENTER: "TRUE" },
                inputs: {
                  MOBJECT: {
                    block: {
                      type: "visual_python_manim_group_object",
                      inputs: {
                        FIRST: objectReferenceBlock("circle"),
                        SECOND: objectReferenceBlock("square"),
                      },
                    },
                  },
                  DIRECTION: directionShadow("RIGHT"),
                  BUFF: numberShadow(0.5),
                },
              },
            },
          },
        },
        playAnimationBlock(createReferencedObjectAnimation("group")),
        playAnimationBlock({
          type: "visual_python_manim_animate_shift",
          inputs: {
            MOBJECT: objectReferenceBlock("group"),
            VECTOR: directionShadow("UP"),
            RUN_TIME: numberShadow(1),
          },
        }),
        { type: "visual_python_manim_wait", inputs: { SECONDS: numberShadow(1) } },
      ]),
    },
  },
};

const annotationSceneBlock = {
  kind: "block",
  type: "visual_python_manim_scene",
  fields: { NAME: "AnnotationScene", SCENE_TYPE: "Scene" },
  inputs: {
    BODY: {
      block: chainStatementBlocks([
        {
          type: "visual_python_manim_assign",
          fields: { VAR: "horizontal_line" },
          inputs: { MOBJECT: manimLineShadow("ORIGIN", "RIGHT") },
        },
        {
          type: "visual_python_manim_assign",
          fields: { VAR: "vertical_line" },
          inputs: { MOBJECT: manimLineShadow("ORIGIN", "UP") },
        },
        {
          type: "visual_python_manim_assign",
          fields: { VAR: "angle" },
          inputs: {
            MOBJECT: {
              block: {
                type: "visual_python_manim_angle",
                fields: { COLOR: "YELLOW" },
                inputs: {
                  LINE1: objectReferenceBlock("horizontal_line"),
                  LINE2: objectReferenceBlock("vertical_line"),
                  RADIUS: numberShadow(0.5),
                },
              },
            },
          },
        },
        {
          type: "visual_python_manim_play_two",
          inputs: {
            FIRST: { block: createReferencedObjectAnimation("horizontal_line") },
            SECOND: { block: createReferencedObjectAnimation("vertical_line") },
            RUN_TIME: numberShadow(1),
            LAG_RATIO: numberShadow(0),
          },
        },
        playAnimationBlock(createReferencedObjectAnimation("angle")),
        { type: "visual_python_manim_wait", inputs: { SECONDS: numberShadow(1) } },
      ]),
    },
  },
};

export const registerManimToolbox = (context: PluginContext) => {
  context.registerToolboxCategory({
    id: "visual-python.manim.toolbox",
    name: "Manim",
    colour,
    contents: withManimToolboxDefaults([
      category("常用", [
        starterSceneBlock,
        toolboxBlock("visual_python_manim_scene"),
        toolboxBlock("visual_python_manim_plain_text_object", {
          CONTENT: textShadow("你好"),
          FONT_SIZE: numberShadow(48),
        }),
        toolboxBlock("visual_python_manim_mathtex_object", {
          CONTENT: formulaShadow("x^2 + y^2 = z^2"),
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
        toolboxBlock("visual_python_manim_transform_to_animation", {
          SOURCE: objectReferenceBlock("source"),
          TARGET: objectReferenceBlock("target"),
          RUN_TIME: numberShadow(1),
        }),
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
        sceneCategory("配音", [
          toolboxBlock("visual_python_manim_voiceover", { TEXT: textShadow("欢迎学习动画制作") }),
          toolboxBlock("visual_python_manim_voiceover_with_animation", { TEXT: textShadow("让我们看看这个动画") }),
        ]),
        sceneCategory("音频", [
          toolboxBlock("visual_python_manim_play_local_audio", {
            PATH: textShadow("audio.wav"),
            TIME_OFFSET: numberShadow(0),
            GAIN: numberShadow(0),
          }),
          toolboxBlock("visual_python_manim_play_local_audio_with_animation", {
            PATH: textShadow("audio.wav"),
            TIME_OFFSET: numberShadow(0),
            GAIN: numberShadow(0),
          }),
        ]),
        sceneCategory("对象管理", [
          toolboxBlock("visual_python_manim_add"),
          toolboxBlock("visual_python_manim_add_two"),
          toolboxBlock("visual_python_manim_remove"),
          toolboxBlock("visual_python_manim_remove_two"),
          toolboxBlock("visual_python_manim_clear"),
        ]),
        sceneCategory("三维相机", [
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
            CONTENT: textShadow("你好"),
            FONT_SIZE: numberShadow(48),
          }),
          toolboxBlock("visual_python_manim_tex_object", {
            CONTENT: textShadow("E = mc^2"),
            FONT_SIZE: numberShadow(48),
          }),
          toolboxBlock("visual_python_manim_mathtex_object", {
            CONTENT: formulaShadow("x^2 + y^2 = z^2"),
            FONT_SIZE: numberShadow(48),
          }),
          toolboxBlock("visual_python_manim_formula_value"),
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
          toolboxBlock("visual_python_manim_triangle_object", { SIDE_LENGTH: numberShadow(2) }),
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
          functionGraphSceneBlock,
          toolboxBlock("visual_python_manim_axes_plot", {
            FUNCTION: manimFunctionPresetBlock("quadratic"),
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
          tableSceneBlock,
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
          annotationSceneBlock,
          toolboxBlock("visual_python_manim_brace", { DIRECTION: directionShadow("DOWN") }),
          toolboxBlock("visual_python_manim_brace_label", {
            LABEL: textShadow("标注"),
            DIRECTION: directionShadow("DOWN"),
          }),
          toolboxBlock("visual_python_manim_surrounding_rectangle", { BUFF: numberShadow(0.1) }),
          toolboxBlock("visual_python_manim_angle", { RADIUS: numberShadow(0.5) }),
          toolboxBlock("visual_python_manim_right_angle", { LENGTH: numberShadow(0.25) }),
        ]),
        objectCategory("三维对象", [
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
            DIMENSIONS: manimDimensionsBlock(),
            FILL_OPACITY: numberShadow(0.75),
          }),
          toolboxBlock("visual_python_manim_torus_object", {
            MAJOR_RADIUS: numberShadow(3),
            MINOR_RADIUS: numberShadow(1),
            FILL_OPACITY: numberShadow(0.75),
          }),
          toolboxBlock("visual_python_manim_parametric_surface", {
            FUNCTION: manimSurfaceFunctionPresetBlock("wave"),
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
          groupSceneBlock,
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
          transformSceneBlock,
          toolboxBlock("visual_python_manim_transform_to_animation", {
            SOURCE: objectReferenceBlock("source"),
            TARGET: objectReferenceBlock("target"),
            RUN_TIME: numberShadow(1),
          }),
          toolboxBlock("visual_python_manim_replacement_transform_animation", {
            SOURCE: objectReferenceBlock("source"),
            TARGET: objectReferenceBlock("target"),
            RUN_TIME: numberShadow(1),
          }),
          toolboxBlock("visual_python_manim_transform_from_copy_animation", {
            SOURCE: objectReferenceBlock("source"),
            TARGET: objectReferenceBlock("target"),
            RUN_TIME: numberShadow(1),
          }),
          toolboxBlock("visual_python_manim_fade_transform_animation", {
            SOURCE: objectReferenceBlock("source"),
            TARGET: objectReferenceBlock("target"),
            RUN_TIME: numberShadow(1),
          }),
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
          toolboxBlock("visual_python_manim_animate_set_color", { RUN_TIME: numberShadow(1) }),
          toolboxBlock("visual_python_manim_animate_set_color_gradient", { RUN_TIME: numberShadow(1) }),
          toolboxBlock("visual_python_manim_animate_set_color_blend", {
            RATIO: numberShadow(0.5),
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
            ROTATION_ANGLE: degreesShadow(4),
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
        toolboxBlock("visual_python_manim_function_preset", {
          AMPLITUDE: numberShadow(1),
          FREQUENCY: numberShadow(1),
          OFFSET: numberShadow(0),
        }),
        toolboxBlock("visual_python_manim_surface_function_preset", { HEIGHT: numberShadow(0.5) }),
        toolboxBlock("visual_python_manim_dimensions", {
          WIDTH: numberShadow(3),
          HEIGHT: numberShadow(2),
          DEPTH: numberShadow(1),
        }),
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

      objectCategory("列表与批量结构", [
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
      ]),

      dynamicCategory("动态绑定", [
        dynamicTrackerSceneBlock,
        toolboxBlock("visual_python_manim_value_tracker", { VALUE: numberShadow(0) }),
        toolboxBlock("visual_python_manim_decimal_number", {
          VALUE: numberShadow(0),
          PLACES: numberShadow(2),
        }),
        toolboxBlock("visual_python_manim_variable", {
          VALUE: numberShadow(0),
          LABEL: textShadow("x"),
        }),
        toolboxBlock("visual_python_manim_tracker_get_value", { TRACKER: objectReferenceBlock("tracker") }),
        toolboxBlock("visual_python_manim_always_redraw"),
        toolboxBlock("visual_python_manim_traced_path", { WIDTH: numberShadow(4) }),
        toolboxBlock("visual_python_manim_decimal_follow_tracker", {
          TRACKER: objectReferenceBlock("tracker"),
          PLACES: numberShadow(2),
        }),
        toolboxBlock("visual_python_manim_follow_target_updater", { DIRECTION: directionShadow("RIGHT") }),
        toolboxBlock("visual_python_manim_clear_updaters", { MOBJECT: objectReferenceBlock("obj") }),
        toolboxBlock("visual_python_manim_tracker_set_value_animation", {
          TRACKER: objectReferenceBlock("tracker"),
          VALUE: numberShadow(10),
        }),
      ]),

      methodCategory("属性与样式", [
        methodCategory("样式设置", [
          toolboxBlock("visual_python_manim_set_color"),
          toolboxBlock("visual_python_manim_set_color_gradient"),
          toolboxBlock("visual_python_manim_set_color_gradient_three"),
          toolboxBlock("visual_python_manim_set_color_blend", { RATIO: numberShadow(0.5) }),
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
          toolboxBlock("visual_python_manim_apply_matrix", { MATRIX: dynamicMatrixDataShadow() }),
        ]),
      ]),
    ]),
  });
};
