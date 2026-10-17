import { describe, expect, it } from "vitest";
import { manimBlockAgentMetadata } from "./blockKnowledge";
import { manimToolboxBlockPaths } from "./toolbox";

describe("manim block knowledge", () => {
  it("provides curated agent metadata with task synonyms", () => {
    const circle = manimBlockAgentMetadata("visual_python_manim_circle_object", ["常用"], "圆形 半径");
    expect(circle?.purpose).toContain("弹跳小球");
    expect(circle?.aliases).toEqual(expect.arrayContaining(["小球"]));
    expect(circle?.recommendedFor).toEqual(expect.arrayContaining(["弹跳小球"]));
    expect(circle?.relatedBlocks).toEqual(expect.arrayContaining(["visual_python_manim_animate_shift"]));
  });

  it("derives family metadata from the toolbox category for uncurated blocks", () => {
    const metadata = manimBlockAgentMetadata("visual_python_manim_animate_set_color_gradient", ["动画效果", "属性动画"], "渐变颜色动画");
    expect(metadata?.purpose).toContain("动画效果");
    expect(metadata?.purpose).toContain("渐变颜色动画");
    expect(metadata?.intentTags).toEqual(expect.arrayContaining(["animation", "property"]));
    expect(metadata?.keywords).toEqual(expect.arrayContaining(["颜色"]));
  });

  it("falls back to a generic purpose when the category is unknown", () => {
    const metadata = manimBlockAgentMetadata("visual_python_manim_unknown_block", [], "神秘积木");
    expect(metadata?.purpose).toContain("神秘积木");
  });

  it("ignores blocks outside the Manim plugin", () => {
    expect(manimBlockAgentMetadata("python_print", [], "打印")).toBeUndefined();
  });

  it("maps toolbox blocks to their canonical category path", () => {
    const paths = manimToolboxBlockPaths();
    expect(paths.get("visual_python_manim_scene")).toEqual(["场景与流程", "场景定义"]);
    expect(paths.get("visual_python_manim_animate_set_color_gradient")).toEqual(["动画效果", "属性动画"]);
    expect(paths.get("visual_python_manim_circle_object")).toEqual(["对象", "基础几何"]);
  });
});
