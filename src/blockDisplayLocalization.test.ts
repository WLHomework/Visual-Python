import { describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { localizeBlockDefinition, localizeBlockMessage, localizeDropdownLabel } from "./blockDisplayLocalization";
import { manimPlugin } from "./plugins/builtin/manim";
import { PluginRegistry } from "./plugins/core/pluginRegistry";

const blockDefinitionSources = import.meta.glob<string>([
  "./pythonBlocks.ts",
  "./pythonSyntaxBlocks.ts",
  "./plugins/builtin/manim/blocks/*.ts",
], { query: "?raw", import: "default", eager: true });

const visibleBlockText = (block: Blockly.Block) => block.inputList
  .flatMap((input) => input.fieldRow)
  .map((field) => field.getText())
  .join(" ");

describe("block display localization", () => {
  it("removes duplicated Python keywords from Chinese dropdown labels", () => {
    expect(localizeDropdownLabel("在 in", "in")).toBe("在");
    expect(localizeDropdownLabel("不是 is not", "is not")).toBe("不是");
  });

  it("keeps the operator values used by generated Python code", () => {
    const definition = localizeBlockDefinition({
      type: "python_membership",
      message0: "%1 %2 %3",
      args0: [{ type: "field_dropdown", name: "OP", options: [["在 in", "in"], ["不在 not in", "not in"]] }],
    });
    const args = definition.args0 as Array<{ options: string[][] }>;
    expect(args[0].options).toEqual([["在", "in"], ["不在", "not in"]]);
  });

  it("applies localization to registered Python blocks", async () => {
    await import("./pythonBlocks");
    const workspace = new Blockly.Workspace();
    const membership = workspace.newBlock("python_membership");
    const identity = workspace.newBlock("python_identity");
    const boolean = workspace.newBlock("logic_boolean");
    const standardLibrary = workspace.newBlock("python_standard_library_import");
    expect(membership.getField("OP")?.getText()).toBe("在");
    expect(identity.getField("OP")?.getText()).toBe("是");
    boolean.setFieldValue("TRUE", "BOOL");
    expect(boolean.getField("BOOL")?.getText()).toBe("真");
    boolean.setFieldValue("FALSE", "BOOL");
    expect(boolean.getField("BOOL")?.getText()).toBe("假");
    standardLibrary.setFieldValue("math", "MODULE");
    expect(standardLibrary.getField("MODULE")?.getText()).toBe("数学");
    standardLibrary.setFieldValue("json", "MODULE");
    expect(standardLibrary.getField("MODULE")?.getText()).toBe("JSON");
    workspace.dispose();
  });

  it("uses Chinese-only labels for operator blocks", async () => {
    await import("./pythonBlocks");
    const workspace = new Blockly.Workspace();
    const floorDivide = workspace.newBlock("python_floor_divide");
    const bitwise = workspace.newBlock("python_bitwise");
    const augmentedAssign = workspace.newBlock("python_augmented_assign");

    expect(visibleBlockText(floorDivide)).toContain("整除");
    expect(visibleBlockText(floorDivide)).not.toContain("//");
    expect(bitwise.getField("OP")?.getText()).toBe("按位与");
    bitwise.setFieldValue("<<", "OP");
    expect(bitwise.getField("OP")?.getText()).toBe("左移");
    expect(bitwise.getFieldValue("OP")).toBe("<<");
    expect(augmentedAssign.getField("OP")?.getText()).toBe("增加");
    augmentedAssign.setFieldValue("//=", "OP");
    expect(augmentedAssign.getField("OP")?.getText()).toBe("整除");
    expect(augmentedAssign.getFieldValue("OP")).toBe("//=");
    workspace.dispose();
  });

  it("translates Manim dropdown values without changing their code values", () => {
    const definition = localizeBlockDefinition({
      type: "visual_python_manim_shape",
      message0: "基础图形 %1 颜色 %2",
      args0: [
        { type: "field_dropdown", name: "SHAPE", options: [["Circle", "Circle"], ["Square", "Square"]] },
        { type: "field_dropdown", name: "COLOR", options: [["BLUE", "BLUE"], ["RED", "RED"]] },
      ],
    });
    const args = definition.args0 as Array<{ options: string[][] }>;
    expect(args[0].options).toEqual([["圆形", "Circle"], ["正方形", "Square"]]);
    expect(args[1].options).toEqual([["蓝色", "BLUE"], ["红色", "RED"]]);
  });

  it("removes redundant API names from Chinese messages", () => {
    expect(localizeBlockMessage("visual_python_manim_circle_object", "圆形 Circle 半径 %1 颜色 %2"))
      .toBe("圆形 半径 %1 颜色 %2");
    expect(localizeBlockMessage("python_builtin_sum", "求和 sum %1 起始值 %2"))
      .toBe("求和 %1 起始值 %2");
  });

  it("uses natural Chinese for Manim concepts and dimensions", () => {
    expect(localizeBlockMessage("visual_python_manim_scene", "Manim 场景 %1 类型 %2 %3 %4"))
      .toBe("动画场景 %1 类型 %2 %3 %4");
    expect(localizeBlockMessage("visual_python_manim_assign", "创建 Manim 对象 %1 为 %2"))
      .toBe("创建场景对象 %1 为 %2");
    expect(localizeBlockMessage("visual_python_manim_tex_object", "LaTeX 文本 Tex 内容 %1 字号 %2 颜色 %3"))
      .toBe("公式文本 内容 %1 字号 %2 颜色 %3");
    expect(localizeBlockMessage("visual_python_manim_arrow3d_object", "3D 箭头 Arrow3D 起点 %1 终点 %2 厚度 %3 箭头高度 %4 底部半径 %5 颜色 %6"))
      .toBe("三维箭头 起点 %1 终点 %2 线宽 %3 箭头高 %4 底半径 %5 颜色 %6");
  });

  it("uses consistent Manim parameter terminology", () => {
    expect(localizeBlockMessage("visual_python_manim_fade_in_animation", "淡入 FadeIn 对象 %1 方向 %2 缩放 %3 时间 %4"))
      .toBe("淡入 目标 %1 方向 %2 缩放 %3 时长 %4");
    expect(localizeBlockMessage("visual_python_manim_axes_object", "2D 坐标系 Axes x范围 %1 y范围 %2 x长度 %3 y长度 %4"))
      .toBe("二维坐标系 x 范围 %1 y 范围 %2 x 长度 %3 y 长度 %4");
    expect(localizeBlockMessage("visual_python_manim_angle", "角度标注 Angle 线1 %1 线2 %2 半径 %3 颜色 %4"))
      .toBe("角度标注 线 1 %1 线 2 %2 半径 %3 颜色 %4");
    expect(localizeBlockMessage("visual_python_manim_set_fill", "对象 %1 设置填充 颜色 %2 透明度 %3"))
      .toBe("对象 %1 设置填充 颜色 %2 不透明度 %3");
    expect(localizeBlockMessage("visual_python_manim_sphere_object", "球体 Sphere 半径 %1 不透明度 %2 颜色 %3"))
      .toBe("球体 半径 %1 不透明度 %2 颜色 %3");
  });

  it("applies Chinese display text to registered Manim blocks", async () => {
    if (!Blockly.Blocks.visual_python_manim_scene) {
      const registry = new PluginRegistry();
      registry.register(manimPlugin);
      await registry.activate(manimPlugin.manifest.id);
    }
    const workspace = new Blockly.Workspace();
    const blockTypes = [
      "visual_python_manim_scene",
      "visual_python_manim_axes_object",
      "visual_python_manim_circle_object",
      "visual_python_manim_tex_object",
      "visual_python_manim_object_ref",
    ];
    const labels = blockTypes.map((type) => visibleBlockText(workspace.newBlock(type)));
    expect(labels).toEqual(expect.arrayContaining([
      expect.stringContaining("动画场景"),
      expect.stringContaining("二维坐标系"),
      expect.stringContaining("圆形"),
      expect.stringContaining("公式文本"),
      expect.stringContaining("场景对象"),
    ]));
    expect(labels.join(" ")).not.toMatch(/\b(?:Manim|Axes|Circle|LaTeX|Tex)\b/);

    const stackedTypes = [
      "visual_python_manim_axes_object",
      "visual_python_manim_arrow3d_object",
      "visual_python_manim_parametric_surface",
      "visual_python_manim_wiggle_animation",
      "visual_python_manim_apply_wave_animation",
      "visual_python_manim_cone_object",
      "visual_python_manim_cylinder_object",
      "visual_python_manim_indicate_animation",
      "visual_python_manim_circumscribe_animation",
    ];
    expect(stackedTypes.map((type) => workspace.newBlock(type).getInputsInline())).toEqual(stackedTypes.map(() => false));
    workspace.dispose();
  });

  it("translates blocks that were entirely English", () => {
    expect(localizeBlockMessage("visual_python_manim_parametric_surface", "Surface function %1 u range %2 v range %3 resolution %4 color %5"))
      .toBe("参数曲面 函数 %1 横向范围 %2 纵向范围 %3 分辨率 %4 颜色 %5");
  });

  it("keeps API names out of all static block titles", () => {
    const englishTerms: Array<{ type: string; terms: string[] }> = [];
    const definitionPattern = /(?:context\.registerBlock\(\{\s*|\{\s*)type:\s*"((?:python_|visual_python_manim_)[^"]+)"\s*,\s*message0:\s*"([^"]+)"/g;
    for (const source of Object.values(blockDefinitionSources)) {
      for (const match of source.matchAll(definitionPattern)) {
        const visibleMessage = localizeBlockMessage(match[1], match[2])
          .replace(/\bJSON\b/g, "")
          .replace(/\bdB\b/g, "");
        const terms = visibleMessage.match(/[A-Za-z]{2,}/g) ?? [];
        if (terms.length) englishTerms.push({ type: match[1], terms });
      }
    }
    expect(englishTerms).toEqual([]);
  });
});
