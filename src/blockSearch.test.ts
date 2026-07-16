import { describe, expect, it } from "vitest";
import { blockSearchFlyout, createBlockSearchIndex, searchBlockIndex } from "./blockSearch";

const toolbox = {
  kind: "categoryToolbox",
  contents: [
    { kind: "category", name: "数学", contents: [{ kind: "block", type: "math_number" }] },
    { kind: "category", name: "Manim", contents: [
      { kind: "category", name: "基础几何", contents: [
        { kind: "block", type: "visual_python_manim_circle_object", fields: { NAME: "circle" } },
        { kind: "block", type: "visual_python_manim_circle_object", fields: { NAME: "circle" } },
      ] },
    ] },
    { kind: "category", name: "调用", custom: "CALLS" },
  ],
};

describe("block search", () => {
  const index = createBlockSearchIndex(
    toolbox as any,
    (type) => ({ math_number: "数字", visual_python_manim_circle_object: "创建圆形 Circle", python_call_structured: "调用函数" })[type] ?? type,
    (custom) => custom === "CALLS" ? [{ kind: "block", type: "python_call_structured", fields: { NAME: "draw_scene" } }] : null,
  );

  it("indexes nested, dynamic, and deduplicated toolbox blocks", () => {
    expect(index).toHaveLength(3);
    expect(index.find((entry) => entry.type.includes("circle"))?.category).toBe("Manim / 基础几何");
    expect(searchBlockIndex(index, "draw_scene")[0]?.type).toBe("python_call_structured");
  });

  it("matches Chinese labels and Python names", () => {
    expect(searchBlockIndex(index, "圆形")[0]?.type).toContain("circle");
    expect(searchBlockIndex(index, "Circle")[0]?.type).toContain("circle");
    expect(searchBlockIndex(index, "数学 数字")[0]?.type).toBe("math_number");
  });

  it("builds grouped native flyout entries", () => {
    const flyout = blockSearchFlyout(searchBlockIndex(index, "circle"));
    expect(flyout[0]).toMatchObject({ kind: "label", text: "Manim / 基础几何" });
    expect(flyout[1]).toMatchObject({ kind: "block", type: "visual_python_manim_circle_object" });
    expect(blockSearchFlyout([])[0]).toMatchObject({ kind: "label" });
  });
});
