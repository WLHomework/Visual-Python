import { describe, expect, it } from "vitest";
import { blockSearchFlyout, createBlockCatalog, createBlockDirectory, createBlockSearchIndex, createTaskBlockDirectory, searchBlockIndex } from "./blockSearch";

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

  it("keeps same-type blocks when their serialized field contracts differ", () => {
    const entries = createBlockSearchIndex({
      kind: "categoryToolbox",
      contents: [{ kind: "category", name: "Python", contents: [
        { kind: "block", type: "python_fixture", fields: { FIRST: "same" } },
        { kind: "block", type: "python_fixture", fields: { SECOND: "same" } },
      ] }],
    } as any, (type) => type);

    expect(entries).toHaveLength(2);
  });

  it("matches Chinese labels and Python names", () => {
    expect(searchBlockIndex(index, "圆形")[0]?.type).toContain("circle");
    expect(searchBlockIndex(index, "Circle")[0]?.type).toContain("circle");
    expect(searchBlockIndex(index, "数学 数字")[0]?.type).toBe("math_number");
  });

  it("matches agent aliases and keywords without changing the visible label", () => {
    const entries = createBlockSearchIndex({
      kind: "categoryToolbox",
      contents: [{ kind: "category", name: "扩展", contents: [{ kind: "block", type: "third_party_draw" }] }],
    } as any, () => "绘制对象", undefined, {
      metadataForType: () => ({ aliases: ["画图"], keywords: ["可视化", "图形"], description: "绘制一个对象" }),
    });

    expect(searchBlockIndex(entries, "画图")[0]?.type).toBe("third_party_draw");
    expect(searchBlockIndex(entries, "可视化")[0]?.type).toBe("third_party_draw");
    expect(entries[0].label).toBe("绘制对象");
  });

  it("returns only task candidates and a compact category summary", () => {
    const entries = createBlockSearchIndex({
      kind: "categoryToolbox",
      contents: [
        { kind: "category", name: "图形", contents: [{ kind: "block", type: "draw_circle" }] },
        { kind: "category", name: "文本", contents: [{ kind: "block", type: "write_text" }] },
        { kind: "category", name: "文件", contents: [{ kind: "block", type: "read_file" }] },
      ],
    } as any, (type) => ({ draw_circle: "绘制圆形", write_text: "写入文字", read_file: "读取文件" })[type] ?? type, undefined, {
      metadataForType: (type) => type === "draw_circle" ? { keywords: ["圆", "图形"] } : undefined,
    });

    const directory = createTaskBlockDirectory(entries, "创建一个圆形动画");
    expect(directory.candidates.map((block) => block.type)).toEqual(["draw_circle"]);
    expect(directory.categories).toEqual([{ name: "图形", blockCount: 1 }]);
    expect(JSON.stringify(directory)).not.toContain("read_file");
    expect(directory).toMatchObject({ apiVersion: 1, schema: "visual-python.block-api" });
    expect(directory.candidates[0]).toMatchObject({ apiVersion: 1 });
    expect(directory.candidates[0]?.keywords).toEqual(expect.arrayContaining(["图形", "绘制圆形"]));
  });

  it("expands a capability query so native blocks are discoverable without exact label matches", () => {
    const entries = createBlockSearchIndex({
      kind: "categoryToolbox",
      contents: [{ kind: "category", name: "list", contents: [
        { kind: "block", type: "python_list_index" },
        { kind: "block", type: "python_for_in" },
      ] }],
    } as any, (type) => type === "python_list_index" ? "read list index" : "iterate list");

    const directory = createTaskBlockDirectory(entries, "bubble sort");
    expect(directory).toMatchObject({ apiVersion: 1, schema: "visual-python.block-api" });
  });

  it("keeps a useful category summary when no task candidate matches", () => {
    const entries = createBlockSearchIndex({
      kind: "categoryToolbox",
      contents: [{ kind: "category", name: "扩展", contents: [{ kind: "block", type: "third_party_draw" }] }],
    } as any, () => "绘制对象");

    expect(createTaskBlockDirectory(entries, "播放音乐")).toMatchObject({
      apiVersion: 1,
      schema: "visual-python.block-api",
      categories: [{ name: "扩展", blockCount: 1 }],
      candidates: [],
      hint: expect.stringContaining("search_blocks"),
    });
  });

  it("finds dynamic third-party blocks without relying on a type prefix", () => {
    const entries = createBlockSearchIndex({
      kind: "categoryToolbox",
      contents: [{ kind: "category", name: "扩展", custom: "THIRD_PARTY" }],
    } as any, (type) => type === "matrix_create" ? "创建矩阵" : type, (custom) => custom === "THIRD_PARTY"
      ? [{ kind: "block", type: "matrix_create" }]
      : null, {
      metadataForType: () => ({ aliases: ["数组"], keywords: ["矩阵", "数据"] }),
    });

    const directory = createTaskBlockDirectory(entries, "创建一个矩阵");
    expect(directory.candidates[0]).toMatchObject({ type: "matrix_create", category: "扩展" });
    expect(directory.candidates[0]?.contract).toBeUndefined();
  });

  it("tolerates oversized agent metadata while ranking candidates", () => {
    const entries = createBlockSearchIndex({
      kind: "categoryToolbox",
      contents: [{ kind: "category", name: "扩展", contents: [{ kind: "block", type: "custom_draw" }] }],
    } as any, () => "绘制对象", undefined, {
      metadataForType: () => ({
        description: "描述".repeat(50_000),
        aliases: ["画图"],
        keywords: ["图形"],
        examples: ["绘制".repeat(10_000)],
      }),
    });

    expect(() => createTaskBlockDirectory(entries, "画图")).not.toThrow();
    expect(createTaskBlockDirectory(entries, "画图").candidates[0]?.type).toBe("custom_draw");
  });

  it("builds grouped native flyout entries", () => {
    const flyout = blockSearchFlyout(searchBlockIndex(index, "circle"));
    expect(flyout[0]).toMatchObject({ kind: "label", text: "Manim / 基础几何" });
    expect(flyout[1]).toMatchObject({ kind: "block", type: "visual_python_manim_circle_object" });
    expect(blockSearchFlyout([])[0]).toMatchObject({ kind: "label" });
  });

  it("builds a categorized catalog with each block state and its real connection contract", () => {
    const catalog = createBlockCatalog(index, (type) => ({
      inputSlots: type === "visual_python_manim_circle_object"
        ? [{ name: "RADIUS", kind: "value" as const, check: ["Number"] }]
        : [],
      hasOutputConnection: true,
      outputCheck: ["ManimObject"],
      hasPreviousConnection: false,
      previousCheck: null,
      hasNextConnection: false,
      nextCheck: null,
      fields: [{ name: "COLOR", value: "BLUE", text: "蓝色", options: [{ label: "蓝色", value: "BLUE" }, { label: "红色", value: "RED" }] }],
    }));

    const circleCategory = index.find((entry) => entry.type === "visual_python_manim_circle_object")!.category.split(" / ");
    const circle = catalog.categories.find((category) => category.name === circleCategory[0])
      ?.categories.find((category) => category.name === circleCategory[1])?.blocks[0];
    expect(circle).toMatchObject({
      type: "visual_python_manim_circle_object",
      state: { type: "visual_python_manim_circle_object", fields: { NAME: "circle" } },
      hasOutputConnection: true,
      inputSlots: [{ name: "RADIUS", kind: "value", check: ["Number"] }],
      outputCheck: ["ManimObject"],
      fields: [{ name: "COLOR", value: "BLUE", options: [{ label: "蓝色", value: "BLUE" }, { label: "红色", value: "RED" }] }],
    });
    const callEntry = index.find((entry) => entry.type === "python_call_structured")!;
    expect(catalog.categories.find((category) => category.name === callEntry.category)?.blocks[0]?.type).toBe("python_call_structured");
  });

  it("builds a lightweight directory without serialized block states", () => {
    const directory = createBlockDirectory(index);
    const manim = directory.categories.find((category) => category.name === "Manim");
    const geometry = manim?.categories.find((category) => category.name === "基础几何");
    expect(geometry?.blocks).toContainEqual({ type: "visual_python_manim_circle_object", label: "创建圆形 Circle" });
    expect(geometry?.blocks.filter((block) => block.type === "visual_python_manim_circle_object")).toHaveLength(1);
    expect(JSON.stringify(directory)).not.toContain("inputs");
    expect(JSON.stringify(directory)).not.toContain("extraState");
  });

  it("preserves the complete semantic contract in task candidates", () => {
    const entries = createBlockSearchIndex({
      kind: "categoryToolbox",
      contents: [{ kind: "category", name: "Python", contents: [{ kind: "block", type: "python_for_in" }] }],
    } as any, () => "遍历序列", undefined, {
      metadataForType: () => ({
        purpose: "遍历一个可迭代对象并执行循环体",
        inputTypes: { ITERABLE: "iterable", DO: "statement" },
        outputType: "statement",
        statement: true,
        requires: ["iterable"],
        relatedBlocks: ["python_list_collection"],
        recommendedFor: ["排序", "批量处理"],
        avoidFor: ["创建图表"],
        intentTags: ["python", "control-flow"],
      }),
    });

    expect(createTaskBlockDirectory(entries, "遍历列表").candidates[0]).toMatchObject({
      purpose: "遍历一个可迭代对象并执行循环体",
      inputTypes: { ITERABLE: "iterable", DO: "statement" },
      outputType: "statement",
      statement: true,
      requires: ["iterable"],
      relatedBlocks: ["python_list_collection"],
      recommendedFor: ["排序", "批量处理"],
      avoidFor: ["创建图表"],
      intentTags: ["python", "control-flow"],
    });
  });

  it("keeps broad drawing tasks diverse instead of filling the directory with one library", () => {
    const contents = [
      ...Array.from({ length: 8 }, (_, index) => ({ kind: "block", type: `matplotlib_draw_${index}` })),
      { kind: "block", type: "manim_draw_shape" },
      { kind: "block", type: "turtle_draw_shape" },
      { kind: "block", type: "python_draw_shape" },
    ];
    const entries = createBlockSearchIndex({
      kind: "categoryToolbox",
      contents: [
        { kind: "category", name: "Matplotlib", contents: contents.slice(0, 8) },
        { kind: "category", name: "Manim", contents: [contents[8]] },
        { kind: "category", name: "Turtle", contents: [contents[9]] },
        { kind: "category", name: "Python", contents: [contents[10]] },
      ],
    } as any, (type) => type.replaceAll("_", " "), undefined, {
      metadataForType: (type) => {
        if (type.startsWith("matplotlib")) return { purpose: "使用 Matplotlib 绘制图形", intentTags: ["plotting", "data-visualization"] };
        if (type.startsWith("manim")) return { purpose: "创建带动画的场景对象", intentTags: ["animation", "geometry"] };
        if (type.startsWith("turtle")) return { purpose: "使用海龟绘图绘制轨迹", intentTags: ["drawing", "turtle"] };
        return { purpose: "使用 Python 基础语法完成绘图前的计算", intentTags: ["python", "drawing"] };
      },
    });

    const directory = createTaskBlockDirectory(entries, "绘制一个图形", { limit: 6 });
    expect(new Set(directory.candidates.map((candidate) => candidate.category)).size).toBeGreaterThan(1);
    expect(directory.candidates.some((candidate) => candidate.category === "Manim")).toBe(true);
    expect(directory.candidates.some((candidate) => candidate.category === "Turtle")).toBe(true);
  });

  it("does not treat a plugin name as the primary semantic match", () => {
    const entries = createBlockSearchIndex({
      kind: "categoryToolbox",
      contents: [
        { kind: "category", name: "Matplotlib", contents: [{ kind: "block", type: "matplotlib_unrelated" }] },
        { kind: "category", name: "Python", contents: [{ kind: "block", type: "python_print" }] },
      ],
    } as any, (type) => type === "python_print" ? "输出文本" : "矩阵变换", undefined, {
      metadataForType: (type) => type === "matplotlib_unrelated"
        ? { keywords: ["Matplotlib"], purpose: "读取一个矩阵并进行变换" }
        : { keywords: ["输出", "打印"], purpose: "向控制台输出文本" },
    });

    const directory = createTaskBlockDirectory(entries, "输出一段文本");
    expect(directory.candidates[0]?.type).toBe("python_print");
  });
});
