import { beforeAll, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { generatePython } from "../../../pythonBlocks";
import { validatePythonBlockContexts } from "../../../pythonSyntaxBlocks";
import { PluginRegistry } from "../../core/pluginRegistry";
import { dynamicMatrixDataShadow, dynamicTableDataShadow } from "./helpers";
import { manimPlugin } from "./index";
import { colourForManimBlock, manimBlockColours } from "./constants";
import { registerManimToolbox } from "./toolbox";
import { parseVoiceoverMarker } from "./voiceoverMarkers";
import { parseLocalAudioMarker } from "./localAudioMarkers";

const number = (value: number) => ({ block: { type: "math_number", fields: { NUM: value } } });
const text = (value: string) => ({ block: { type: "text", fields: { TEXT: value } } });
const expression = (code: string) => ({ block: { type: "python_raw_expression", fields: { CODE: code } } });
const manimSources = import.meta.glob<string>("./**/*.ts", { query: "?raw", import: "default", eager: true });

const activateManimPlugin = async () => {
  if (Blockly.Blocks.visual_python_manim_scene) return;
  const registry = new PluginRegistry();
  registry.register(manimPlugin);
  await registry.activate(manimPlugin.manifest.id);
  const record = registry.getRecord(manimPlugin.manifest.id);
  if (record?.state !== "active") throw new Error(record?.error || "Manim plugin activation failed");
};

describe("Manim plugin generators", () => {
  beforeAll(async () => {
    await activateManimPlugin();
  });

  it("assigns distinct semantic colours to Manim block families", () => {
    expect(colourForManimBlock("visual_python_manim_scene")).toBe(manimBlockColours.scene);
    expect(colourForManimBlock("visual_python_manim_circle_object")).toBe(manimBlockColours.object);
    expect(colourForManimBlock("visual_python_manim_fade_in_animation")).toBe(manimBlockColours.animation);
    expect(colourForManimBlock("visual_python_manim_set_fill")).toBe(manimBlockColours.method);
    expect(colourForManimBlock("visual_python_manim_degrees")).toBe(manimBlockColours.value);
    expect(colourForManimBlock("visual_python_manim_formula_value")).toBe(manimBlockColours.value);
    expect(colourForManimBlock("visual_python_manim_always_redraw")).toBe(manimBlockColours.dynamic);
    expect(colourForManimBlock("visual_python_manim_play")).toBe(manimBlockColours.scene);
    expect(colourForManimBlock("visual_python_manim_camera_frame_animation")).toBe(manimBlockColours.scene);
    expect(colourForManimBlock("visual_python_manim_3d_ambient_rotation")).toBe(manimBlockColours.scene);
    expect(colourForManimBlock("visual_python_manim_assign")).toBe(manimBlockColours.object);
    expect(colourForManimBlock("visual_python_manim_object_ref")).toBe(manimBlockColours.object);
    expect(colourForManimBlock("visual_python_manim_axes_c2p")).toBe(manimBlockColours.object);
    expect(colourForManimBlock("visual_python_manim_assign_add")).toBe(manimBlockColours.object);
    expect(colourForManimBlock("visual_python_manim_scaled_direction")).toBe(manimBlockColours.value);
    expect(colourForManimBlock("visual_python_manim_play_list")).toBe(manimBlockColours.object);
    expect(colourForManimBlock("visual_python_manim_animate_method")).toBe(manimBlockColours.animation);
    expect(colourForManimBlock("visual_python_manim_animate_shift")).toBe(manimBlockColours.animation);
    expect(colourForManimBlock("visual_python_manim_animate_scale")).toBe(manimBlockColours.animation);
    expect(colourForManimBlock("visual_python_manim_animate_rotate")).toBe(manimBlockColours.animation);
    expect(colourForManimBlock("visual_python_manim_animate_move_to")).toBe(manimBlockColours.animation);
    expect(colourForManimBlock("visual_python_manim_transform_method")).toBe(manimBlockColours.object);
    expect(new Set(Object.values(manimBlockColours)).size).toBe(6);
  });

  it("uses the matching group colour for toolbox category markers", () => {
    const registered: Array<{ contents: Array<Record<string, unknown>> }> = [];
    registerManimToolbox({ registerToolboxCategory: (category: any) => registered.push(category) } as any);
    const groups = registered[0].contents as Array<Record<string, any>>;
    const expected = [
      undefined,
      manimBlockColours.scene,
      manimBlockColours.object,
      manimBlockColours.animation,
      manimBlockColours.value,
      manimBlockColours.object,
      manimBlockColours.dynamic,
      manimBlockColours.method,
      manimBlockColours.object,
    ];
    expected.forEach((groupColour, index) => {
      if (!groupColour) return;
      expect(groups[index].colour).toBe(groupColour);
      const childCategories = (groups[index].contents as Array<Record<string, any>>).filter((item) => item.kind === "category");
      expect(childCategories.every((item) => item.colour === groupColour)).toBe(true);
    });
  });

  it("generates a runnable scene with object creation, add, animation and wait", () => {
    const code = generatePython({
      blocks: {
        languageVersion: 0,
        blocks: [{
          type: "visual_python_manim_scene",
          fields: { NAME: "DemoScene", SCENE_TYPE: "Scene" },
          inputs: {
            BODY: {
              block: {
                type: "visual_python_manim_assign_add",
                fields: { VAR: "circle" },
                inputs: {
                  MOBJECT: {
                    block: {
                      type: "visual_python_manim_circle_object",
                      fields: { COLOR: "BLUE" },
                      inputs: { RADIUS: number(2) },
                    },
                  },
                },
                next: {
                  block: {
                    type: "visual_python_manim_play",
                    inputs: {
                      ANIMATION: {
                        block: {
                          type: "visual_python_manim_create_object_animation",
                          inputs: {
                            MOBJECT: { block: { type: "visual_python_manim_object_ref", fields: { VAR: "circle" } } },
                            RUN_TIME: number(1),
                          },
                        },
                      },
                    },
                    next: {
                      block: {
                        type: "visual_python_manim_wait",
                        inputs: { SECONDS: number(0.5) },
                      },
                    },
                  },
                },
              },
            },
          },
        }],
      },
    });

    expect(code).toContain("from manim import *");
    expect(code).toContain("class DemoScene(Scene):");
    expect(code).toContain("circle = Circle(radius=2, color=BLUE)");
    expect(code).toContain("self.add(circle)");
    expect(code).toContain("self.play(Create(circle, run_time=1))");
    expect(code).toContain("self.wait(0.5)");
  });

  it("generates local audio playback with offset and gain", () => {
    const code = generatePython({ blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_play_local_audio",
      inputs: { PATH: text("music.wav"), TIME_OFFSET: number(0.5), GAIN: number(-4) },
    }] } });
    expect(code).toContain("self.add_sound(");
    expect(code).toContain("'music.wav',");
    expect(code).toContain("time_offset=0.5,");
    expect(code).toContain("gain=-4,");
  });

  it("generates synchronized local audio markers around Manim statements", () => {
    const code = generatePython({ blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_scene",
      fields: { NAME: "AudioScene", SCENE_TYPE: "Scene" },
      inputs: { BODY: { block: {
        id: "local-audio-sync",
        type: "visual_python_manim_play_local_audio_with_animation",
        inputs: {
          PATH: text("C:\\audio\\music.wav"), TIME_OFFSET: number(0.5), GAIN: number(-3),
          BODY: { block: { type: "visual_python_manim_wait", inputs: { SECONDS: number(1) } } },
        },
      } } },
    }] } });
    const markers = code.split("\n").map(parseLocalAudioMarker).filter(Boolean);
    expect(markers).toHaveLength(2);
    expect(markers[0]).toMatchObject({ kind: "begin", payload: { path: "C:\\audio\\music.wav", timeOffset: 0.5, gain: -3, blockId: "local-audio-sync" } });
    expect(markers[1]).toEqual({ kind: "end" });
    expect(code).toContain("\n    self.renderer.time");
    expect(code).toContain("\n    self.wait(1)\n    self.wait(0)");
  });

  it("generates parseable voiceover timeline markers around normal Manim statements", () => {
    const code = generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_scene",
        fields: { NAME: "NarratedScene", SCENE_TYPE: "Scene" },
        inputs: { BODY: { block: {
          type: "visual_python_manim_voiceover_with_animation",
          inputs: {
            TEXT: text("欢迎学习圆的面积"),
            BODY: { block: { type: "visual_python_manim_wait", inputs: { SECONDS: number(1) } } },
          },
        } } },
      }] },
    });
    const markers = code.split("\n").map(parseVoiceoverMarker).filter(Boolean);
    expect(markers).toHaveLength(2);
    expect(markers[0]).toMatchObject({ kind: "begin", payload: { version: 1, textExpression: "'欢迎学习圆的面积'", text: "欢迎学习圆的面积", blockId: expect.any(String) } });
    expect(markers[1]).toEqual({ kind: "end" });
    expect(code).toContain("self.wait(1)");
    expect(code).toContain('\n    self.add_sound("visual-python-voiceover.wav")');
    expect(code).toContain("\n    self.wait(1)\n    self.wait(0)");
    expect(code).not.toContain("\n      self.wait(1)");
  });

  it("does not treat a voiceover connected below a scene as being inside it", () => {
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_scene",
      fields: { NAME: "MainScene", SCENE_TYPE: "Scene" },
      next: { block: {
        type: "visual_python_manim_voiceover",
        id: "outside-voiceover",
        inputs: { TEXT: text("欢迎学习 Manim") },
      } },
    }] } }, workspace);
    expect(validatePythonBlockContexts(workspace)).toContainEqual({
      blockId: "outside-voiceover",
      message: "配音积木只能放在 Manim 场景内部。",
    });
    workspace.dispose();
  });

  it("generates representative objects, methods, coordinates and dynamic tracker code", () => {
    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_set_fill",
        fields: { COLOR: "RED" },
        inputs: {
          MOBJECT: { block: { type: "visual_python_manim_square_object", fields: { COLOR: "WHITE" }, inputs: { SIDE_LENGTH: number(2) } } },
          OPACITY: number(0.8),
        },
      }] },
    })).toContain("Square(side_length=2, color=WHITE).set_fill(\n    color=RED,\n    opacity=0.8,\n)");

    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_axes_plot",
        inputs: {
          AXES: { block: { type: "visual_python_manim_axes_object", inputs: { X_RANGE: expression("[-3, 3, 1]"), Y_RANGE: expression("[-2, 5, 1]"), X_LENGTH: number(6), Y_LENGTH: number(4) } } },
          FUNCTION: expression("lambda x: x**2"),
          X_RANGE: expression("[-2, 2]"),
        },
      }] },
    })).toContain("Axes(\n    x_range=[-3, 3, 1],\n    y_range=[-2, 5, 1],\n    x_length=6,\n    y_length=4,\n).plot(lambda x: x**2, x_range=[-2, 2], color=WHITE)");

    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_tracker_set_value_animation",
        inputs: {
          TRACKER: { block: { type: "visual_python_manim_value_tracker", inputs: { VALUE: number(0) } } },
          VALUE: number(10),
        },
      }] },
    })).toContain("ValueTracker(0).animate.set_value(10)");

    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_brace_label",
        inputs: {
          TARGET: { block: { type: "visual_python_manim_line_segment_object", inputs: { START: expression("LEFT"), END: expression("RIGHT") }, fields: { COLOR: "WHITE" } } },
          LABEL: text("length"),
          DIRECTION: expression("DOWN"),
        },
      }] },
    })).toContain("BraceLabel(Line(LEFT, RIGHT, color=WHITE), 'length', brace_direction=DOWN)");
  });

  it("generates representative 3D objects and animation families", () => {
    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_cone_object",
        fields: { SHOW_BASE: "TRUE", COLOR: "GREEN" },
        inputs: {
          BASE_RADIUS: number(1),
          HEIGHT: number(2),
          DIRECTION: expression("OUT"),
        },
      }] },
    })).toContain("Cone(\n    base_radius=1,\n    height=2,\n    direction=OUT,\n    show_base=True,\n    fill_color=GREEN,\n)");

    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_arrow3d_object",
        fields: { COLOR: "BLUE" },
        inputs: {
          START: expression("ORIGIN"),
          END: expression("OUT"),
          THICKNESS: number(0.02),
          HEIGHT: number(0.3),
          BASE_RADIUS: number(0.08),
        },
      }] },
    })).toContain("Arrow3D(\n    ORIGIN,\n    OUT,\n    thickness=0.02,\n    height=0.3,\n    base_radius=0.08,\n    color=BLUE,\n)");

    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_fade_in_animation",
        inputs: {
          MOBJECT: { block: { type: "visual_python_manim_circle_object", fields: { COLOR: "WHITE" }, inputs: { RADIUS: number(1) } } },
          SHIFT: expression("UP"),
          SCALE: number(1),
          RUN_TIME: number(2),
        },
      }] },
    })).toContain("FadeIn(Circle(radius=1, color=WHITE), shift=UP, scale=1, run_time=2)");

    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_replacement_transform_animation",
        inputs: {
          SOURCE: { block: { type: "visual_python_manim_circle_object", fields: { COLOR: "WHITE" }, inputs: { RADIUS: number(1) } } },
          TARGET: { block: { type: "visual_python_manim_square_object", fields: { COLOR: "WHITE" }, inputs: { SIDE_LENGTH: number(2) } } },
          RUN_TIME: number(1),
        },
      }] },
    })).toContain("ReplacementTransform(Circle(radius=1, color=WHITE), Square(side_length=2, color=WHITE), run_time=1)");

    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_grow_from_point_animation",
        inputs: {
          MOBJECT: { block: { type: "visual_python_manim_circle_object", fields: { COLOR: "WHITE" }, inputs: { RADIUS: number(1) } } },
          POINT: expression("ORIGIN"),
          RUN_TIME: number(1),
        },
      }] },
    })).toContain("GrowFromPoint(Circle(radius=1, color=WHITE), ORIGIN, run_time=1)");

    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_animate_shift",
        inputs: {
          MOBJECT: { block: { type: "visual_python_manim_object_ref", fields: { VAR: "obj" } } },
          VECTOR: expression("RIGHT"),
          RUN_TIME: number(1),
        },
      }] },
    })).toContain("obj.animate(run_time=1).shift(RIGHT)");
  });

  it("keeps every registered Manim block generator callable with default fields", () => {
    const types = Object.keys(Blockly.Blocks).filter((type) => type.startsWith("visual_python_manim_")).sort();
    expect(types).toHaveLength(148);

    for (const type of types) {
      const workspace = new Blockly.Workspace();
      try {
        workspace.newBlock(type);
        expect(() => generatePython(Blockly.serialization.workspaces.save(workspace))).not.toThrow();
      } finally {
        workspace.dispose();
      }
    }
  });

  it("uses polygon blocks whose inputs match their Manim constructors", () => {
    expect(Blockly.Blocks.visual_python_manim_polygon_object).toBeUndefined();

    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_triangle_object",
        fields: { COLOR: "WHITE" },
      }] },
    })).toContain("Triangle(color=WHITE)");

    const regularPolygon = generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_regular_polygon_object",
        fields: { COLOR: "WHITE" },
        inputs: {
          N: number(6),
          RADIUS: number(1),
        },
      }] },
    });
    expect(regularPolygon).toContain("n=6,");
    expect(regularPolygon.match(/n=6/g)).toHaveLength(1);
  });

  it("generates a safely quoted MathTex formula value", () => {
    const code = generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_mathtex_object",
        fields: { COLOR: "WHITE" },
        inputs: {
          CONTENT: { block: { type: "visual_python_manim_formula_value", fields: { LATEX: "\\int_{-2}^{2}(0.5x^2+1)\\,dx" } } },
          FONT_SIZE: number(48),
        },
      }] },
    });
    expect(code).toContain("MathTex(");
    expect(code).toContain("'\\\\int_{-2}^{2}(0.5x^2+1)\\\\,dx'");
  });

  it("keeps production Manim block registrations unique and toolbox references valid", () => {
    const blockDefs = new Map<string, string[]>();
    const toolboxRefs: string[] = [];

    for (const [rel, source] of Object.entries(manimSources).filter(([file]) => !file.endsWith(".test.ts"))) {

      for (const match of source.matchAll(/context\.registerBlock\(\s*\{[\s\S]*?type:\s*"([^"]+)"/g)) {
        const type = match[1];
        if (!type.startsWith("visual_python_manim_")) continue;
        blockDefs.set(type, [...(blockDefs.get(type) ?? []), rel]);
      }

      for (const match of source.matchAll(/toolboxBlock\("([^"]+)"/g)) {
        const type = match[1];
        if (type.startsWith("visual_python_manim_")) toolboxRefs.push(type);
      }
    }

    const duplicateBlockDefs = [...blockDefs.entries()].filter(([, refs]) => refs.length > 1);
    const uniqueToolboxRefs = [...new Set(toolboxRefs)];
    const missingFromToolbox = [...blockDefs.keys()].filter((type) => !uniqueToolboxRefs.includes(type));
    const unknownToolboxRefs = uniqueToolboxRefs.filter((type) => !blockDefs.has(type));

    expect(blockDefs.size).toBe(148);
    expect(uniqueToolboxRefs).toHaveLength(148);
    expect(duplicateBlockDefs).toEqual([]);
    expect(missingFromToolbox).toEqual([]);
    expect(unknownToolboxRefs).toEqual([]);
  });

  it("generates Manim range parameter helpers", () => {
    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_degrees",
        fields: { VALUE: 75 },
      }] },
    })).toContain("75 * DEGREES");

    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_range",
        inputs: {
          START: number(0),
          END: number(10),
          STEP: number(2),
        },
      }] },
    })).toContain("[0, 10, 2]");

    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_range_min_max",
        inputs: {
          START: number(-1),
          END: number(1),
        },
      }] },
    })).toContain("[-1, 1]");
  });

  it("generates Manim point parameter helper", () => {
    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_point",
        inputs: {
          X: number(1),
          Y: number(2),
          Z: number(3),
        },
      }] },
    })).toContain("[1, 2, 3]");
  });

  it("generates Manim structured data parameter helpers", () => {
    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_point_list_3",
        inputs: {
          P1: { block: { type: "visual_python_manim_direction_constant", fields: { VALUE: "LEFT" } } },
          P2: { block: { type: "visual_python_manim_direction_constant", fields: { VALUE: "UP" } } },
          P3: { block: { type: "visual_python_manim_direction_constant", fields: { VALUE: "RIGHT" } } },
        },
      }] },
    })).toContain("LEFT, UP, RIGHT");

    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_table_data_2x2",
        inputs: {
          A: text("A"),
          B: text("B"),
          C: text("C"),
          D: text("D"),
        },
      }] },
    })).toContain("[['A', 'B'], ['C', 'D']]");

    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_matrix_data_2x2",
        inputs: {
          A: number(1),
          B: number(2),
          C: number(3),
          D: number(4),
        },
      }] },
    })).toContain("[[1, 2], [3, 4]]");
  });

  it("generates tables and matrices from dynamic nested lists", () => {
    const tableData = {
      block: {
        type: "python_sequence_collection",
        fields: { KIND: "list" },
        extraState: { itemCount: 2 },
        inputs: {
          ITEM0: { block: { type: "python_sequence_collection", fields: { KIND: "list" }, extraState: { itemCount: 2 }, inputs: { ITEM0: text("A"), ITEM1: text("B") } } },
          ITEM1: { block: { type: "python_sequence_collection", fields: { KIND: "list" }, extraState: { itemCount: 2 }, inputs: { ITEM0: text("C"), ITEM1: text("D") } } },
        },
      },
    };
    const matrixData = {
      block: {
        type: "python_sequence_collection",
        fields: { KIND: "list" },
        extraState: { itemCount: 2 },
        inputs: {
          ITEM0: { block: { type: "python_sequence_collection", fields: { KIND: "list" }, extraState: { itemCount: 2 }, inputs: { ITEM0: number(1), ITEM1: number(2) } } },
          ITEM1: { block: { type: "python_sequence_collection", fields: { KIND: "list" }, extraState: { itemCount: 2 }, inputs: { ITEM0: number(3), ITEM1: number(4) } } },
        },
      },
    };

    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_table_object",
        fields: { OBJECT: "Table" },
        inputs: { DATA: tableData },
      }] },
    })).toContain("Table([['A', 'B'], ['C', 'D']])");

    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_matrix_object",
        fields: { OBJECT: "Matrix" },
        inputs: { DATA: matrixData },
      }] },
    })).toContain("Matrix([[1, 2], [3, 4]])");
  });

  it("uses native Python nested list blocks for default table and matrix data", () => {
    const workspace = new Blockly.Workspace();
    try {
      Blockly.serialization.workspaces.load({
        blocks: {
          languageVersion: 0,
          blocks: [{
            type: "visual_python_manim_matrix_object",
            inputs: { DATA: dynamicMatrixDataShadow() },
          }, {
            type: "visual_python_manim_table_object",
            inputs: { DATA: dynamicTableDataShadow() },
          }],
        },
      }, workspace);

      const [matrix, table] = workspace.getTopBlocks(false);
      const matrixData = matrix.getInputTargetBlock("DATA");
      const tableData = table.getInputTargetBlock("DATA");

      expect(matrixData?.type).toBe("python_list_collection");
      expect(matrixData?.getInputTargetBlock("ITEM0")?.type).toBe("python_list_collection");
      expect(matrixData?.getInputTargetBlock("ITEM1")?.type).toBe("python_list_collection");
      expect(tableData?.type).toBe("python_list_collection");
      expect(tableData?.getInputTargetBlock("ITEM0")?.type).toBe("python_list_collection");
      expect(tableData?.getInputTargetBlock("ITEM1")?.type).toBe("python_list_collection");
    } finally {
      workspace.dispose();
    }
  });

  it("generates Polygon from a dynamic vertex list", () => {
    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_polygon_from_list_object",
        fields: { COLOR: "BLUE" },
        inputs: {
          POINTS: {
            block: {
              type: "python_sequence_collection",
              fields: { KIND: "list" },
              extraState: { itemCount: 3 },
              inputs: {
                ITEM0: { block: { type: "visual_python_manim_direction_constant", fields: { VALUE: "LEFT" } } },
                ITEM1: { block: { type: "visual_python_manim_direction_constant", fields: { VALUE: "UP" } } },
                ITEM2: { block: { type: "visual_python_manim_direction_constant", fields: { VALUE: "RIGHT" } } },
              },
            },
          },
        },
      }] },
    })).toContain("Polygon(*[LEFT, UP, RIGHT], color=BLUE)");
  });

  it("generates VGroup from a dynamic object list", () => {
    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_group_from_list_object",
        inputs: {
          OBJECTS: {
            block: {
              type: "python_sequence_collection",
              fields: { KIND: "list" },
              extraState: { itemCount: 2 },
              inputs: {
                ITEM0: expression("circle"),
                ITEM1: expression("square"),
              },
            },
          },
        },
      }] },
    })).toContain("VGroup(*[circle, square])");
  });

  it("generates self.play from a dynamic animation list", () => {
    const code = generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_play_list",
        inputs: {
          ANIMATIONS: {
            block: {
              type: "python_sequence_collection",
              fields: { KIND: "list" },
              extraState: { itemCount: 2 },
              inputs: {
                ITEM0: { block: { type: "visual_python_manim_create_object_animation", inputs: { RUN_TIME: number(1) } } },
                ITEM1: { block: { type: "visual_python_manim_write_animation", inputs: { RUN_TIME: number(1) } } },
              },
            },
          },
          RUN_TIME: number(2),
          LAG_RATIO: number(0.2),
        },
      }] },
    });

    expect(code).toContain("self.play(");
    expect(code).toContain("*[Create(Circle(), run_time=1), Write(Text('Hello'), run_time=1)]");
    expect(code).toContain("run_time=2");
    expect(code).toContain("lag_ratio=0.2");
  });

  it("does not contain typical mojibake fragments in Manim source", () => {
    const suspicious = /[�]|鍦|瀵|鏃|棰|瑙|绠|缁|娣|鐢|浠|鐩|妞|妫|寮|铏|澶|杩|灏|鎽|娉|娴|闂|濞|澭|龜||||||||||||/;
    const filesWithMojibake = Object.entries(manimSources)
      .filter(([file]) => !file.endsWith(".test.ts"))
      .filter(([, source]) => suspicious.test(source))
      .map(([file]) => file);

    expect(filesWithMojibake).toEqual([]);
  });
});
