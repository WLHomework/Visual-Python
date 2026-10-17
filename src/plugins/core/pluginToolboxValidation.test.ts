import { describe, expect, it } from "vitest";
import { validatePluginToolboxReferences } from "./pluginToolboxValidation";

const hostBlocks = new Set(["math_number", "text", "logic_boolean"]);
const hasBlockType = (type: string) => hostBlocks.has(type) || type.startsWith("demo_");

const category = (contents: Array<Record<string, unknown>>) => [{ id: "demo.toolbox", name: "演示", contents }];

describe("validatePluginToolboxReferences", () => {
  it("accepts toolbox blocks and shadows that resolve to registered types", () => {
    const issues = validatePluginToolboxReferences(category([
      {
        kind: "block",
        type: "demo_draw",
        inputs: {
          SIZE: { shadow: { type: "math_number", fields: { NUM: 50 } } },
          LABEL: { shadow: { type: "text", fields: { TEXT: "hello" } } },
        },
      },
      { kind: "label", text: "分组" },
      { kind: "category", name: "嵌套", contents: [{ kind: "block", type: "demo_more" }] },
    ]), hasBlockType);
    expect(issues).toEqual([]);
  });

  it("reports unregistered block types with category and toolbox path", () => {
    const issues = validatePluginToolboxReferences(category([
      { kind: "block", type: "ghost_block" },
      { kind: "category", name: "嵌套", contents: [{ kind: "block", type: "ghost_nested" }] },
    ]), hasBlockType);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({ category: "演示", path: "contents[0]", blockType: "ghost_block" });
    expect(issues[0].message).toContain("ghost_block");
    expect(issues[0].suggestion).toContain("registerBlock");
    expect(issues[1].path).toBe("contents[1].contents[0]");
    expect(issues[1].blockType).toBe("ghost_nested");
  });

  it("reports unregistered shadow types including nested shadow inputs", () => {
    const issues = validatePluginToolboxReferences(category([
      {
        kind: "block",
        type: "demo_draw",
        inputs: {
          COLOR: { shadow: { type: "ghost_color" } },
          NESTED: { shadow: { type: "demo_wrap", inputs: { INNER: { shadow: { type: "ghost_inner" } } } } },
        },
      },
    ]), hasBlockType);
    expect(issues.map((issue) => issue.blockType)).toEqual(["ghost_color", "ghost_inner"]);
    expect(issues[0].path).toBe("contents[0].inputs.COLOR.shadow");
    expect(issues[0].message).toContain("COLOR");
    expect(issues[1].path).toBe("contents[0].inputs.NESTED.shadow.inputs.INNER.shadow");
    expect(issues[1].message).toContain("INNER");
  });

  it("reports a block entry without a usable string type", () => {
    const issues = validatePluginToolboxReferences(category([{ kind: "block", type: 42 }]), hasBlockType);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("缺少字符串 type");
    expect(issues[0].blockType).toBeUndefined();
    expect(issues[0].path).toBe("contents[0]");
  });

  it("falls back to the category id when no name is present", () => {
    const issues = validatePluginToolboxReferences([{ id: "demo.toolbox", contents: [{ kind: "block", type: "ghost" }] }], hasBlockType);
    expect(issues[0].category).toBe("demo.toolbox");
  });
});
