import { beforeAll, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { generatePython } from "../../../pythonBlocks";
import { validatePythonBlockContexts } from "../../../pythonSyntaxBlocks";
import { PluginRegistry } from "../../core/pluginRegistry";
import { dynamicMatrixDataShadow, dynamicTableDataShadow, manimCreateAnimationShadow } from "./helpers";
import { manimPlugin } from "./index";
import { colourForManimBlock, manimBlockColours } from "./constants";
import { hiddenCompatibilityBlockTypes, registerManimToolbox } from "./toolbox";
import { parseVoiceoverMarker } from "./voiceoverMarkers";
import { parseLocalAudioMarker } from "./localAudioMarkers";
import { customColorExpression, customColorHex, FieldManimColor, hexToHsv, hsvToHex, parseRecentColours } from "./colorField";
import { manimAgentTools } from "./agentTools";

const number = (value: number) => ({ block: { type: "math_number", fields: { NUM: value } } });
const text = (value: string) => ({ block: { type: "text", fields: { TEXT: value } } });
const expression = (code: string) => ({ block: { type: "python_raw_expression", fields: { CODE: code } } });
const manimSources = import.meta.glob<string>("./**/*.ts", { query: "?raw", import: "default", eager: true });

const collectToolboxBlocks = (contents: Array<Record<string, any>>): Array<Record<string, any>> =>
  contents.flatMap((item) => item.kind === "category"
    ? collectToolboxBlocks(item.contents ?? [])
    : item.kind === "block" ? [item] : []);

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

  it("defines Manim Agent tools in the Manim plugin", () => {
    expect(manimAgentTools.map((tool) => tool.definition.function.name)).toEqual(expect.arrayContaining([
      "validate_scene",
      "render_manim",
      "inspect_rendered_output",
      "get_voiceover_context",
      "add_voiceover",
      "add_synchronized_voiceover",
      "check_voiceover",
    ]));
    expect(manimAgentTools.find((tool) => tool.definition.function.name === "render_manim")).toMatchObject({ requiresPermission: true, longRunning: true });
  });

  it("publishes its Blockly code generation contract", () => {
    expect(manimPlugin.manifest.agent?.codegen).toEqual({
      entryBlock: "visual_python_manim_scene",
      statementInput: "BODY",
      runtimeNames: ["self"],
    });
  });

  it("declares code validation for every Manim code mutation", () => {
    const mutations = manimAgentTools.filter((tool) => tool.mutation);

    expect(mutations.length).toBeGreaterThan(0);
    expect(mutations.every((tool) => tool.verificationTool === "check_code")).toBe(true);
  });

  it("limits source-code mutations to the editable code workspace", () => {
    const codeMutationNames = new Set(["add_voiceover", "add_synchronized_voiceover"]);
    const mutations = manimAgentTools.filter((tool) => codeMutationNames.has(tool.definition.function.name));

    expect(mutations.every((tool) => tool.workspaceModes?.length === 1 && tool.workspaceModes[0] === "code")).toBe(true);
  });

  it("assigns distinct semantic colours to Manim block families", () => {
    expect(colourForManimBlock("visual_python_manim_scene")).toBe(manimBlockColours.scene);
    expect(colourForManimBlock("visual_python_manim_circle_object")).toBe(manimBlockColours.object);
    expect(colourForManimBlock("visual_python_manim_fade_in_animation")).toBe(manimBlockColours.animation);
    expect(colourForManimBlock("visual_python_manim_set_fill")).toBe(manimBlockColours.method);
    expect(colourForManimBlock("visual_python_manim_degrees")).toBe(manimBlockColours.value);
    expect(colourForManimBlock("visual_python_manim_formula_value")).toBe(manimBlockColours.value);
    expect(colourForManimBlock("visual_python_manim_function_preset")).toBe(manimBlockColours.value);
    expect(colourForManimBlock("visual_python_manim_surface_function_preset")).toBe(manimBlockColours.value);
    expect(colourForManimBlock("visual_python_manim_dimensions")).toBe(manimBlockColours.value);
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
    expect(colourForManimBlock("visual_python_manim_animate_set_color")).toBe(manimBlockColours.animation);
    expect(colourForManimBlock("visual_python_manim_transform_method")).toBe(manimBlockColours.object);
    expect(colourForManimBlock("visual_python_manim_apply_matrix")).toBe(manimBlockColours.method);
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
    ];
    expect(groups.map((group) => group.name)).toEqual([
      "常用",
      "场景与流程",
      "对象",
      "动画效果",
      "坐标与数学工具",
      "列表与批量结构",
      "动态绑定",
      "属性与样式",
    ]);
    const toolboxJson = JSON.stringify(registered[0]);
    expect(toolboxJson).toContain("你好");
    expect(toolboxJson).toContain("欢迎学习动画制作");
    expect(toolboxJson).toContain("标注");
    expect(toolboxJson).not.toContain("Hello Manim");
    expected.forEach((groupColour, index) => {
      if (!groupColour) return;
      expect(groups[index].colour).toBe(groupColour);
      const childCategories = (groups[index].contents as Array<Record<string, any>>).filter((item) => item.kind === "category");
      expect(childCategories.every((item) => item.colour === groupColour)).toBe(true);
    });
  });

  it("provides visible defaults for every value input in the Manim toolbox", () => {
    const registered: Array<{ contents: Array<Record<string, unknown>> }> = [];
    registerManimToolbox({ registerToolboxCategory: (category: any) => registered.push(category) } as any);
    const toolboxBlocks = collectToolboxBlocks(registered[0].contents);
    const missingDefaults = new Set<string>();

    for (const toolboxEntry of toolboxBlocks) {
      const workspace = new Blockly.Workspace();
      try {
        Blockly.serialization.workspaces.load({
          blocks: { languageVersion: 0, blocks: [toolboxEntry] },
        }, workspace);
        for (const block of workspace.getAllBlocks(false)) {
          for (const input of block.inputList) {
            if (input.type === Blockly.inputs.inputTypes.VALUE && !input.connection?.targetBlock()) {
              missingDefaults.add(`${block.type}.${input.name}`);
            }
          }
        }
      } finally {
        workspace.dispose();
      }
    }

    expect([...missingDefaults].sort()).toEqual([]);
  });

  it("uses editable direction blocks for the three-point preset", () => {
    const registered: Array<{ contents: Array<Record<string, unknown>> }> = [];
    registerManimToolbox({ registerToolboxCategory: (category: any) => registered.push(category) } as any);
    const preset = collectToolboxBlocks(registered[0].contents)
      .find((entry) => entry.type === "visual_python_manim_point_list_3");

    expect(preset?.inputs).toEqual({
      P1: { block: { type: "visual_python_manim_direction_constant", fields: { VALUE: "LEFT" } } },
      P2: { block: { type: "visual_python_manim_direction_constant", fields: { VALUE: "UP" } } },
      P3: { block: { type: "visual_python_manim_direction_constant", fields: { VALUE: "RIGHT" } } },
    });
    expect(JSON.stringify(preset?.inputs)).not.toContain('"shadow"');
  });

  it("does not expose raw Python expressions in the Manim toolbox", () => {
    const registered: Array<{ contents: Array<Record<string, unknown>> }> = [];
    registerManimToolbox({ registerToolboxCategory: (category: any) => registered.push(category) } as any);

    expect(JSON.stringify(registered[0])).not.toContain("python_raw_expression");
  });

  it("uses semantic connection types for common Manim parameters", () => {
    const workspace = new Blockly.Workspace();
    const axes = workspace.newBlock("visual_python_manim_axes_object");
    const plot = workspace.newBlock("visual_python_manim_axes_plot");
    const arc = workspace.newBlock("visual_python_manim_arc_object");
    const angle = workspace.newBlock("visual_python_manim_degrees");
    const range = workspace.newBlock("visual_python_manim_range");
    const direction = workspace.newBlock("visual_python_manim_direction_constant");
    const fn = workspace.newBlock("visual_python_manim_function_preset");
    const expressionBlock = workspace.newBlock("python_raw_expression");
    const checker = workspace.connectionChecker;

    expect(angle.outputConnection?.getCheck()).toEqual(["ManimAngle"]);
    expect(range.outputConnection?.getCheck()).toEqual(["ManimRange"]);
    expect(direction.outputConnection?.getCheck()).toEqual(["ManimVector", "Number"]);
    expect(checker.doTypeChecks(range.outputConnection!, axes.getInput("X_RANGE")!.connection!)).toBe(true);
    expect(checker.doTypeChecks(angle.outputConnection!, axes.getInput("X_RANGE")!.connection!)).toBe(false);
    expect(checker.doTypeChecks(fn.outputConnection!, plot.getInput("FUNCTION")!.connection!)).toBe(true);
    expect(checker.doTypeChecks(direction.outputConnection!, plot.getInput("FUNCTION")!.connection!)).toBe(false);
    expect(checker.doTypeChecks(angle.outputConnection!, arc.getInput("ANGLE")!.connection!)).toBe(true);
    expect(checker.doTypeChecks(expressionBlock.outputConnection!, axes.getInput("X_RANGE")!.connection!)).toBe(true);
    workspace.dispose();
  });

  it("uses the custom colour picker field for every Manim colour dropdown", () => {
    const source = Object.entries(manimSources)
      .filter(([path]) => path.includes("/blocks/"))
      .map(([, content]) => content)
      .join("\n");

    expect(source).not.toMatch(/type:\s*"field_dropdown",\s*name:\s*"COLOR"/);
    expect(source.match(/type:\s*"field_manim_color"/g)?.length).toBeGreaterThan(40);

    const workspace = new Blockly.Workspace();
    const circle = workspace.newBlock("visual_python_manim_circle_object");
    const colourField = circle.getField("COLOR");
    const colourConstant = workspace.newBlock("visual_python_manim_color_constant");

    expect(colourField).toBeInstanceOf(FieldManimColor);
    expect(colourConstant.getField("VALUE")).toBeInstanceOf(FieldManimColor);
    expect((colourField as FieldManimColor).getOptions().at(-1)).toEqual(["自定义...", "__MANIM_CUSTOM_COLOR__"]);
    colourField?.setValue('ManimColor("#F2F2F2")');
    expect((colourField as FieldManimColor).getOptions()
      .filter((option) => option !== "separator")
      .filter(([label]) => String(label).startsWith("自定义")))
      .toEqual([["自定义 #F2F2F2", 'ManimColor("#F2F2F2")']]);
    workspace.dispose();
  });

  it("generates and persists a validated custom Manim colour", () => {
    expect(customColorExpression("#3a86ff")).toBe('ManimColor("#3A86FF")');
    expect(customColorExpression("blue")).toBeNull();
    expect(customColorHex('ManimColor("#3a86ff")')).toBe("#3A86FF");
    expect(hsvToHex(hexToHsv("#3A86FF"))).toBe("#3A86FF");
    expect(parseRecentColours('["#3a86ff","bad","#3A86FF","#FF006E"]'))
      .toEqual(["#3A86FF", "#FF006E"]);
    expect(parseRecentColours("not json")).toEqual([]);

    const state = {
      blocks: {
        languageVersion: 0,
        blocks: [{
          type: "visual_python_manim_circle_object",
          fields: { COLOR: 'ManimColor("#3A86FF")' },
          inputs: { RADIUS: number(2) },
        }],
      },
    };
    expect(generatePython(state)).toContain('Circle(radius=2, color=ManimColor("#3A86FF"))');

    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(state, workspace);
    const saved = Blockly.serialization.workspaces.save(workspace) as any;
    expect(workspace.getTopBlocks(false)[0].getFieldValue("COLOR")).toBe('ManimColor("#3A86FF")');
    expect(saved.blocks.blocks[0].fields.COLOR).toBe('ManimColor("#3A86FF")');
    workspace.dispose();
  });

  it("generates two-colour, three-colour, and blended colour styles", () => {
    const styledCircle = (type: string, fields: Record<string, string>, ratio?: number) => ({
      blocks: {
        languageVersion: 0,
        blocks: [{
          type,
          fields,
          inputs: {
            MOBJECT: {
              block: {
                type: "visual_python_manim_circle_object",
                fields: { COLOR: "WHITE" },
                inputs: { RADIUS: number(2) },
              },
            },
            ...(ratio === undefined ? {} : { RATIO: number(ratio) }),
          },
        }],
      },
    });

    expect(generatePython(styledCircle("visual_python_manim_set_color_gradient", {
      START_COLOR: 'ManimColor("#3A86FF")',
      END_COLOR: "PURPLE",
    }))).toContain('Circle(radius=2, color=WHITE).set_color([ManimColor("#3A86FF"), PURPLE])');
    expect(generatePython(styledCircle("visual_python_manim_set_color_gradient_three", {
      START_COLOR: "RED",
      MIDDLE_COLOR: "YELLOW",
      END_COLOR: "BLUE",
    }))).toContain("Circle(radius=2, color=WHITE).set_color([RED, YELLOW, BLUE])");
    expect(generatePython(styledCircle("visual_python_manim_set_color_blend", {
      START_COLOR: "RED",
      END_COLOR: "BLUE",
    }, 0.25))).toContain("Circle(radius=2, color=WHITE).set_color(interpolate_color(RED, BLUE, 0.25))");
  });

  it("generates animated solid, gradient, and blended colour changes", () => {
    const colourAnimation = (
      type: string,
      fields: Record<string, string>,
      inputs: Record<string, unknown> = {},
    ) => ({
      blocks: {
        languageVersion: 0,
        blocks: [{
          type,
          fields,
          inputs: {
            MOBJECT: {
              block: {
                type: "visual_python_manim_circle_object",
                fields: { COLOR: "WHITE" },
                inputs: { RADIUS: number(2) },
              },
            },
            RUN_TIME: number(2),
            ...inputs,
          },
        }],
      },
    });

    expect(generatePython(colourAnimation("visual_python_manim_animate_set_color", {
      COLOR: 'ManimColor("#3A86FF")',
    }))).toContain('Circle(radius=2, color=WHITE).animate(run_time=2).set_color(ManimColor("#3A86FF"))');
    expect(generatePython(colourAnimation("visual_python_manim_animate_set_color_gradient", {
      START_COLOR: "RED",
      END_COLOR: "BLUE",
    }))).toContain("Circle(radius=2, color=WHITE).animate(run_time=2).set_color([RED, BLUE])");
    expect(generatePython(colourAnimation("visual_python_manim_animate_set_color_blend", {
      START_COLOR: "RED",
      END_COLOR: "BLUE",
    }, { RATIO: number(0.25) }))).toContain(
      "Circle(radius=2, color=WHITE).animate(run_time=2).set_color(interpolate_color(RED, BLUE, 0.25))",
    );
  });

  it("uses beginner-facing Chinese labels and tooltips for core Manim blocks", () => {
    const workspace = new Blockly.Workspace();
    const axes = workspace.newBlock("visual_python_manim_axes_object");
    const surface = workspace.newBlock("visual_python_manim_parametric_surface");
    const point = workspace.newBlock("visual_python_manim_point");
    const audio = workspace.newBlock("visual_python_manim_play_local_audio");
    const synchronizedAudio = workspace.newBlock("visual_python_manim_play_local_audio_with_animation");
    const voiceover = workspace.newBlock("visual_python_manim_voiceover");
    const synchronizedVoiceover = workspace.newBlock("visual_python_manim_voiceover_with_animation");
    const scene = workspace.newBlock("visual_python_manim_scene");
    const reference = workspace.newBlock("visual_python_manim_object_ref");

    expect(axes.toString()).toContain("横轴范围");
    expect(axes.toString()).toContain("纵轴长度");
    expect(surface.toString()).toContain("横向参数范围");
    expect(point.toString()).toContain("深度坐标");
    expect(audio.toString()).toContain("分贝");
    expect(audio.getField("FILE_PICKER_PATH")).not.toBeNull();
    expect(audio.getField("LOCAL_AUDIO_PREVIEW")).not.toBeNull();
    expect(synchronizedAudio.getField("FILE_PICKER_PATH")).not.toBeNull();
    expect(synchronizedAudio.getField("LOCAL_AUDIO_PREVIEW")).not.toBeNull();
    expect(voiceover.getField("VOICEOVER_PREVIEW")).not.toBeNull();
    expect(synchronizedVoiceover.getField("VOICEOVER_PREVIEW")).not.toBeNull();
    expect(scene.toString()).toContain("动画场景");
    expect(scene.getTooltip()).toContain("完整动画的入口");
    expect(reference.getTooltip()).toContain("引用已经创建并命名的对象");
    expect([axes, surface, point, audio, synchronizedAudio, scene].map((block) => block.toString()).join(" "))
      .not.toMatch(/(?:x 范围|y 范围|u 范围|v 范围|3D|2x2|dB)/);
    workspace.dispose();
  });

  it("offers a complete quick-start scene that generates a visible animation", () => {
    const registered: Array<{ contents: Array<Record<string, unknown>> }> = [];
    registerManimToolbox({ registerToolboxCategory: (category: any) => registered.push(category) } as any);
    const commonCategory = registered[0].contents[0] as Record<string, any>;
    const quickStart = collectToolboxBlocks(commonCategory.contents)[0];
    const code = generatePython({ blocks: { languageVersion: 0, blocks: [quickStart] } });
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [quickStart] } }, workspace);
    const assignment = workspace.getAllBlocks(false).find((block) => block.type === "visual_python_manim_assign");
    const circle = assignment?.getInputTargetBlock("MOBJECT");
    const play = workspace.getAllBlocks(false).find((block) => block.type === "visual_python_manim_play");
    const animation = play?.getInputTargetBlock("ANIMATION");

    expect(code).toContain("class MainScene(Scene):");
    expect(code).toContain("circle = Circle(radius=2, color=BLUE)");
    expect(code).toContain("self.play(Create(circle, run_time=1))");
    expect(code).toContain("self.wait(1)");
    expect(circle?.isShadow()).toBe(false);
    expect(circle?.getInputTargetBlock("RADIUS")?.isShadow()).toBe(true);
    expect(animation?.isShadow()).toBe(false);
    expect(validatePythonBlockContexts(workspace)).toEqual([]);
    workspace.dispose();
  });

  it("reports scene operations placed outside a Manim scene", () => {
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_play",
      inputs: { ANIMATION: manimCreateAnimationShadow() },
    }] } }, workspace);

    expect(validatePythonBlockContexts(workspace)).toContainEqual({
      blockId: expect.any(String),
      message: "此积木只能放在 Manim 场景内部。",
    });
    workspace.dispose();
  });

  it("offers a complete dynamic tracker scene wired to one shared tracker", () => {
    const registered: Array<{ contents: Array<Record<string, unknown>> }> = [];
    registerManimToolbox({ registerToolboxCategory: (category: any) => registered.push(category) } as any);
    const dynamicCategoryEntry = registered[0].contents.find((item: any) => item.name === "动态绑定") as Record<string, any>;
    const template = collectToolboxBlocks(dynamicCategoryEntry.contents)[0];
    const code = generatePython({ blocks: { languageVersion: 0, blocks: [template] } });
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [template] } }, workspace);

    expect(code).toContain("class DynamicScene(Scene):");
    expect(code).toContain("tracker = ValueTracker(0)");
    expect(code).toContain("counter = always_redraw(lambda: DecimalNumber(tracker.get_value(), num_decimal_places=1))");
    expect(code).toContain("self.add(counter)");
    expect(code).toContain("self.play(tracker.animate.set_value(10))");
    expect(code.match(/ValueTracker\(0\)/g)).toHaveLength(1);
    expect(validatePythonBlockContexts(workspace)).toEqual([]);
    workspace.dispose();
  });

  it("reports object references whose assignment does not exist", () => {
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_object_ref",
    }] } }, workspace);

    expect(validatePythonBlockContexts(workspace)).toContainEqual({
      blockId: expect.any(String),
      message: "场景中没有名为“obj”的已创建对象。",
    });
    workspace.dispose();
  });

  it("offers a complete transform scene using shared source and target objects", () => {
    const registered: Array<{ contents: Array<Record<string, unknown>> }> = [];
    registerManimToolbox({ registerToolboxCategory: (category: any) => registered.push(category) } as any);
    const animations = registered[0].contents.find((item: any) => item.name === "动画效果") as Record<string, any>;
    const transforms = animations.contents.find((item: any) => item.name === "变换动画") as Record<string, any>;
    const template = collectToolboxBlocks(transforms.contents)[0];
    const code = generatePython({ blocks: { languageVersion: 0, blocks: [template] } });
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [template] } }, workspace);

    expect(code).toContain("class TransformScene(Scene):");
    expect(code).toContain("source = Circle(radius=1, color=BLUE)");
    expect(code).toContain("target = Square(side_length=2, color=RED)");
    expect(code).toContain("self.play(Create(source, run_time=1))");
    expect(code).toContain("self.play(Transform(source, target, run_time=1))");
    expect(validatePythonBlockContexts(workspace)).toEqual([]);
    workspace.dispose();
  });

  it("reports animation effects that are not connected to playback", () => {
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_create_object_animation",
      inputs: { MOBJECT: { block: { type: "visual_python_manim_circle_object", inputs: { RADIUS: number(1) } } }, RUN_TIME: number(1) },
    }] } }, workspace);

    expect(validatePythonBlockContexts(workspace)).toContainEqual({
      blockId: expect.any(String),
      message: "动画效果需要连接到“播放动画”积木中。",
    });
    workspace.dispose();
  });

  it("selects an available scene object for newly added object references", () => {
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_assign",
      fields: { VAR: "circle" },
      inputs: { MOBJECT: { block: { type: "visual_python_manim_circle_object", inputs: { RADIUS: number(1) } } } },
    }, {
      type: "visual_python_manim_object_ref",
    }] } }, workspace);
    const reference = workspace.getTopBlocks(false).find((block) => block.type === "visual_python_manim_object_ref");
    workspace.fireChangeListener(new Blockly.Events.BlockCreate(reference!));

    expect(reference?.getFieldValue("VAR")).toBe("circle");
    expect(validatePythonBlockContexts(workspace)).toEqual([]);
    workspace.dispose();
  });

  it("offers pure Chinese object names in scene object references", () => {
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_assign",
      fields: { VAR: "蓝色圆形" },
      inputs: { MOBJECT: { block: { type: "visual_python_manim_circle_object", inputs: { RADIUS: number(1) } } } },
    }, {
      type: "visual_python_manim_object_ref",
    }] } }, workspace);

    const reference = workspace.getTopBlocks(false).find((block) => block.type === "visual_python_manim_object_ref");
    const field = reference?.getField("VAR") as Blockly.FieldDropdown | null | undefined;
    workspace.fireChangeListener(new Blockly.Events.BlockCreate(reference!));

    expect(field?.getOptions(false).map((option) => String(option[1]))).toEqual(["蓝色圆形"]);
    expect(validatePythonBlockContexts(workspace)).toEqual([]);
    workspace.dispose();
  });

  it("filters object reference dropdowns by the kind required by each input", () => {
    const assignment = (name: string, mobject: Record<string, unknown>) => ({
      type: "visual_python_manim_assign",
      fields: { VAR: name },
      inputs: { MOBJECT: { block: mobject } },
    });
    const objectReference = (name = "obj") => ({
      block: { type: "visual_python_manim_object_ref", fields: { VAR: name } },
    });
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [
      assignment("axes", { type: "visual_python_manim_axes_object" }),
      assignment("styled_axes", {
        type: "visual_python_manim_set_color",
        inputs: { MOBJECT: { block: { type: "visual_python_manim_axes_object" } } },
      }),
      assignment("circle", { type: "visual_python_manim_circle_object" }),
      assignment("tracker", { type: "visual_python_manim_value_tracker" }),
      assignment("line", { type: "visual_python_manim_line_segment_object" }),
      assignment("arrow", { type: "visual_python_manim_arrow_object" }),
      assignment("table", { type: "visual_python_manim_table_object" }),
      assignment("group", { type: "visual_python_manim_group_object" }),
      assignment("graph", {
        type: "visual_python_manim_axes_plot",
        inputs: { AXES: objectReference("axes") },
      }),
      {
        type: "visual_python_manim_axes_plot",
        inputs: { AXES: objectReference() },
      },
      {
        type: "visual_python_manim_axes_area",
        inputs: { AXES: objectReference("axes"), GRAPH: objectReference() },
      },
      {
        type: "visual_python_manim_tracker_set_value_animation",
        inputs: { TRACKER: objectReference() },
      },
      {
        type: "visual_python_manim_angle",
        inputs: { LINE1: objectReference(), LINE2: objectReference() },
      },
      {
        type: "visual_python_manim_grow_arrow_animation",
        inputs: { ARROW: objectReference() },
      },
      {
        type: "visual_python_manim_table_highlight_cell",
        inputs: { TABLE: objectReference() },
      },
      {
        type: "visual_python_manim_arrange",
        inputs: { MOBJECT: objectReference() },
      },
      {
        type: "visual_python_manim_create_object_animation",
        inputs: { MOBJECT: objectReference() },
      },
    ] } }, workspace);

    const dropdownValues = (parentType: string, inputName: string) => {
      const parent = workspace.getTopBlocks(false).find((block) => block.type === parentType);
      const reference = parent?.getInputTargetBlock(inputName);
      const field = reference?.getField("VAR") as Blockly.FieldDropdown | null | undefined;
      return field?.getOptions(false).map((option) => String(option[1])) ?? [];
    };

    expect(dropdownValues("visual_python_manim_axes_plot", "AXES")).toEqual(["axes", "styled_axes"]);
    expect(dropdownValues("visual_python_manim_axes_area", "GRAPH")).toEqual(["graph"]);
    expect(dropdownValues("visual_python_manim_tracker_set_value_animation", "TRACKER")).toEqual(["tracker"]);
    expect(dropdownValues("visual_python_manim_angle", "LINE1")).toEqual(["line", "arrow"]);
    expect(dropdownValues("visual_python_manim_grow_arrow_animation", "ARROW")).toEqual(["arrow"]);
    expect(dropdownValues("visual_python_manim_table_highlight_cell", "TABLE")).toEqual(["table"]);
    expect(dropdownValues("visual_python_manim_arrange", "MOBJECT")).toEqual(["group"]);
    expect(dropdownValues("visual_python_manim_create_object_animation", "MOBJECT")).toEqual([
      "axes",
      "styled_axes",
      "circle",
      "tracker",
      "line",
      "arrow",
      "table",
      "group",
      "graph",
    ]);
    workspace.dispose();
  });

  it("offers a complete function graph scene sharing one axes object", () => {
    const registered: Array<{ contents: Array<Record<string, unknown>> }> = [];
    registerManimToolbox({ registerToolboxCategory: (category: any) => registered.push(category) } as any);
    const objects = registered[0].contents.find((item: any) => item.name === "对象") as Record<string, any>;
    const coordinates = objects.contents.find((item: any) => item.name === "坐标方法") as Record<string, any>;
    const template = collectToolboxBlocks(coordinates.contents)[0];
    const code = generatePython({ blocks: { languageVersion: 0, blocks: [template] } });
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [template] } }, workspace);

    expect(code).toContain("class FunctionGraphScene(Scene):");
    expect(code).toContain("graph = axes.plot(");
    expect(code).toContain("area = axes.get_area(graph,");
    expect(code).toContain("labels = axes.get_axis_labels(");
    expect(code).toContain("self.play(Create(axes, run_time=1))");
    expect(code).toContain("self.play(Create(graph, run_time=1))");
    expect(code).toContain("self.play(FadeIn(area,");
    expect(validatePythonBlockContexts(workspace)).toEqual([]);
    workspace.dispose();
  });

  it("offers complete table, group and annotation scenes without raw Python inputs", () => {
    const registered: Array<{ contents: Array<Record<string, unknown>> }> = [];
    registerManimToolbox({ registerToolboxCategory: (category: any) => registered.push(category) } as any);
    const objects = registered[0].contents.find((item: any) => item.name === "对象") as Record<string, any>;
    const sceneFromCategory = (name: string) => {
      const child = objects.contents.find((item: any) => item.name === name) as Record<string, any>;
      return collectToolboxBlocks(child.contents)[0];
    };
    const cases = [
      {
        template: sceneFromCategory("表格与矩阵"),
        expected: [
          "class TableScene(Scene):",
          "table = Table([['A', 'B'], ['C', 'D']])",
          "highlighted_table = table.add_highlighted_cell((2, 2), color=YELLOW)",
          "self.play(Create(highlighted_table, run_time=1))",
        ],
      },
      {
        template: sceneFromCategory("复用与组合"),
        expected: [
          "class GroupScene(Scene):",
          "circle = Circle(radius=1, color=BLUE)",
          "square = Square(side_length=2, color=RED)",
          "group = VGroup(circle, square).arrange(",
          "group.animate(run_time=1).shift(UP)",
        ],
      },
      {
        template: sceneFromCategory("标注与装饰"),
        expected: [
          "class AnnotationScene(Scene):",
          "horizontal_line = Line(ORIGIN, RIGHT, color=WHITE)",
          "vertical_line = Line(ORIGIN, UP, color=WHITE)",
          "angle = Angle(horizontal_line, vertical_line, radius=0.5, color=YELLOW)",
          "self.play(Create(angle, run_time=1))",
        ],
      },
    ];

    for (const { template, expected } of cases) {
      const code = generatePython({ blocks: { languageVersion: 0, blocks: [template] } });
      const workspace = new Blockly.Workspace();
      Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [template] } }, workspace);
      expected.forEach((snippet) => expect(code).toContain(snippet));
      expect(workspace.getAllBlocks(false).some((block) => block.type === "python_raw_expression")).toBe(false);
      expect(validatePythonBlockContexts(workspace)).toEqual([]);
      workspace.dispose();
    }
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

  it("preserves Chinese scene and object names", () => {
    const code = generatePython({ blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_scene",
      fields: { NAME: "圆形动画", SCENE_TYPE: "Scene" },
      inputs: { BODY: { block: {
        type: "visual_python_manim_assign_add",
        fields: { VAR: "蓝色圆形" },
        inputs: { MOBJECT: { block: {
          type: "visual_python_manim_circle_object",
          fields: { COLOR: "BLUE" },
          inputs: { RADIUS: number(2) },
        } } },
      } } },
    }] } });

    expect(code).toContain("class 圆形动画(Scene):");
    expect(code).toContain("蓝色圆形 = Circle(radius=2, color=BLUE)");
    expect(code).toContain("self.add(蓝色圆形)");
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
    expect(types).toHaveLength(157);

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

    expect(generatePython({
      blocks: { languageVersion: 0, blocks: [{
        type: "visual_python_manim_triangle_object",
        fields: { COLOR: "BLUE" },
        inputs: { SIDE_LENGTH: number(3) },
      }] },
    })).toContain("Triangle(radius=(3) / (3 ** 0.5), color=BLUE)");

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

    expect(blockDefs.size).toBe(157);
    expect(uniqueToolboxRefs).toHaveLength(blockDefs.size - hiddenCompatibilityBlockTypes.length);
    expect(duplicateBlockDefs).toEqual([]);
    expect(missingFromToolbox.sort()).toEqual([...hiddenCompatibilityBlockTypes].sort());
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

  it("generates guided function, surface and dimension values without raw Python input", () => {
    expect(generatePython({ blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_function_preset",
      fields: { PRESET: "quadratic" },
      inputs: { AMPLITUDE: number(2), FREQUENCY: number(0.5), OFFSET: number(1) },
    }] } })).toContain("lambda x: 2 * (0.5 * x) ** 2 + 1");

    expect(generatePython({ blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_surface_function_preset",
      fields: { PRESET: "wave" },
      inputs: { HEIGHT: number(0.5) },
    }] } })).toContain("lambda u, v: np.array([u, v, 0.5 * np.sin(u) * np.cos(v)])");

    expect(generatePython({ blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_dimensions",
      inputs: { WIDTH: number(3), HEIGHT: number(2), DEPTH: number(1) },
    }] } })).toContain("[3, 2, 1]");
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
