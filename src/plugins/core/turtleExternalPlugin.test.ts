import { describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import "blockly/blocks";
import { pythonGenerator } from "blockly/python";
import pluginModuleSource from "../../../examples/plugins/turtle/index.js?raw";
import manifestSource from "../../../examples/plugins/turtle/plugin.json?raw";
import readmeSource from "../../../examples/plugins/turtle/README.md?raw";
import packageScriptSource from "../../../scripts/package-turtle-plugin.ps1?raw";

const pluginSources = [manifestSource, pluginModuleSource, readmeSource];

type CapturedPlugin = {
  definitions: Map<string, Record<string, unknown>>;
  generators: Map<string, (block: FakeBlock, generator: FakeGenerator) => string | [string, number]>;
  categories: Array<{ id: string; name: string; contents: Array<Record<string, unknown>> }>;
  agentTools: Array<Record<string, any>>;
};

type FakeBlock = {
  id: string;
  values: Record<string, string>;
  statements: Record<string, string>;
  getFieldValue(name: string): string;
};

type FakeGenerator = {
  INDENT: string;
  valueToCode(block: FakeBlock, name: string): string;
  statementToCode(block: FakeBlock, name: string): string;
};

const fakeGenerator: FakeGenerator = {
  INDENT: "    ",
  valueToCode: (block, name) => block.values[name] || "",
  statementToCode: (block, name) => block.statements[name] || "",
};

const fakeBlock = ({
  id = "block-1",
  fields = {},
  values = {},
  statements = {},
}: {
  id?: string;
  fields?: Record<string, string>;
  values?: Record<string, string>;
  statements?: Record<string, string>;
} = {}): FakeBlock => ({
  id,
  values,
  statements,
  getFieldValue: (name) => fields[name] || "",
});

async function capturePlugin(): Promise<CapturedPlugin> {
  const moduleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(pluginModuleSource)}`;
  const plugin = (await import(/* @vite-ignore */ moduleUrl)).default as { activate(context: Record<string, (...args: any[]) => void>): void | Promise<void> };
  const captured: CapturedPlugin = { definitions: new Map(), generators: new Map(), categories: [], agentTools: [] };
  await plugin.activate({
    registerBlock: (definition: Record<string, unknown>, generator: CapturedPlugin["generators"] extends Map<string, infer T> ? T : never) => {
      captured.definitions.set(String(definition.type), definition);
      captured.generators.set(String(definition.type), generator);
    },
    registerToolboxCategory: (category: CapturedPlugin["categories"][number]) => captured.categories.push(category),
    registerAgentTool: (tool: Record<string, any>) => captured.agentTools.push(tool),
  });
  return captured;
}

const requiredBlockNames = [
  "program",
  "forward", "backward", "left", "right", "goto", "setx", "sety", "home", "setheading",
  "pendown", "penup", "pensize", "speed", "clear", "reset", "showturtle", "hideturtle", "shape", "undo",
  "pencolor", "fillcolor", "color", "begin_fill", "end_fill",
  "circle", "dot", "polygon", "write", "stamp",
  "screen_title", "screen_bgcolor", "screen_size",
  "on_key", "on_screen_click", "on_turtle_click",
  "xcor", "ycor", "heading", "isdown",
] as const;
const requiredBlockTypes = requiredBlockNames.map((name) => `visual_python_turtle_${name}`);
const flattenToolboxItems = (items: Array<Record<string, unknown>>): Array<Record<string, unknown>> => items.flatMap((item) => {
  if (item.kind === "category" && Array.isArray(item.contents)) return flattenToolboxItems(item.contents as Array<Record<string, unknown>>);
  return [item];
});

describe("Turtle external plugin package", () => {
  it("contains the manifest, entry module, and README sources", () => {
    expect(pluginSources.every((source) => source.trim().length > 0)).toBe(true);
  });

  it("documents installation, AI use, independent execution, and teaching examples", () => {
    const readme = readmeSource;
    expect(readme).toContain("## 安装插件");
    expect(readme).toContain("## 积木分组");
    expect(readme).toContain("## 使用 AI 助手");
    expect(readme).toContain("## 独立运行生成的 Python");
    expect(readme).toContain("### 示例一：彩色五角星");
    expect(readme).toContain("### 示例二：同心圆");
    expect(readme).toContain("### 示例三：方向键控制海龟");
  });

  it("provides a packaging script that verifies root archive entries", () => {
    const source = packageScriptSource;
    expect(source).toContain('"plugin.json", "index.js", "README.md"');
    expect(source).toContain("Compress-Archive");
    expect(source).toContain("ZipFile]::OpenRead");
  });

  it("declares a dependency-free Turtle Agent capability", () => {
    const manifest = JSON.parse(manifestSource);
    expect(manifest).toMatchObject({
      id: "visual-python.turtle",
      name: "Turtle 海龟绘图",
      version: "1.0.2",
      apiVersion: "1",
      entry: "index.js",
      agent: {
        tools: ["inspect_turtle_capabilities"],
        fileTypes: [".py"],
        detect: "imports",
      },
    });
    expect(manifest.python).toBeUndefined();
  });

  it("registers the complete Chinese teaching block set and toolbox", async () => {
    const captured = await capturePlugin();
    expect([...captured.definitions.keys()].sort()).toEqual([...requiredBlockTypes].sort());
    expect([...captured.definitions.values()].every((definition) => /^visual_python_turtle_/.test(String(definition.type)))).toBe(true);
    expect([...captured.definitions.values()].every((definition) => /[\u3400-\u9fff]/.test(String(definition.message0)))).toBe(true);
    expect(captured.categories).toHaveLength(1);
    expect(captured.categories[0].contents.map((item) => item.name)).toEqual([
      "\u4e3b\u7a0b\u5e8f",
      "\u79fb\u52a8",
      "\u753b\u7b14",
      "\u989c\u8272\u4e0e\u586b\u5145",
      "\u7ed8\u56fe",
      "\u753b\u5e03",
      "\u4e8b\u4ef6",
      "\u72b6\u6001",
    ]);
    expect(captured.categories[0]).toMatchObject({ id: "visual-python.turtle.toolbox", name: "海龟绘图" });
    const toolboxTypes = flattenToolboxItems(captured.categories[0].contents).map((item) => item.type).filter(Boolean);
    expect(toolboxTypes).toEqual(requiredBlockTypes);
  });

  it("only references registered block types in toolbox blocks and shadows", async () => {
    const captured = await capturePlugin();
    for (const definition of captured.definitions.values()) {
      Blockly.common.defineBlocksWithJsonArray([definition]);
    }
    const referencedTypes = flattenToolboxItems(captured.categories[0].contents).flatMap((item) => {
      const inputs = Object.values(item.inputs ?? {}) as Array<{ shadow?: { type?: string } }>;
      return [item.type, ...inputs.map((input) => input.shadow?.type)].filter((type): type is string => Boolean(type));
    });
    expect(referencedTypes.filter((type) => !Blockly.Blocks[type])).toEqual([]);
  });

  it("generates a complete standalone Turtle program and basic commands", async () => {
    const captured = await capturePlugin();
    const program = captured.generators.get("visual_python_turtle_program")!(fakeBlock({ statements: { BODY: "    pen.forward(80)\n" } }), fakeGenerator);
    expect(program).toContain("import turtle\n\ndef main():");
    expect(program).toContain("    screen = turtle.Screen()\n    pen = turtle.Turtle()");
    expect(program).toContain("    pen.forward(80)\n    screen.mainloop()");
    expect(program).toContain('if __name__ == "__main__":\n    main()');

    expect(captured.generators.get("visual_python_turtle_forward")!(fakeBlock({ values: { DISTANCE: "120" } }), fakeGenerator)).toBe("pen.forward(120)\n");
    expect(captured.generators.get("visual_python_turtle_goto")!(fakeBlock({ values: { X: "10", Y: "-20" } }), fakeGenerator)).toBe("pen.goto(10, -20)\n");
    expect(captured.generators.get("visual_python_turtle_pencolor")!(fakeBlock({ values: { COLOR: "'#336699'" } }), fakeGenerator)).toBe("pen.pencolor('#336699')\n");
  });

  it("uses valid four-space indentation with the real Blockly Python generator", async () => {
    const captured = await capturePlugin();
    for (const [type, definition] of captured.definitions) {
      if (!Blockly.Blocks[type]) Blockly.common.defineBlocksWithJsonArray([definition]);
      pythonGenerator.forBlock[type] = captured.generators.get(type) as unknown as typeof pythonGenerator.forBlock[string];
    }

    const emptyWorkspace = new Blockly.Workspace();
    emptyWorkspace.newBlock("visual_python_turtle_program");
    const emptyCode = pythonGenerator.workspaceToCode(emptyWorkspace);
    expect(emptyCode).not.toContain("pass");
    expect(emptyCode).toContain("    screen = turtle.Screen()\n    pen = turtle.Turtle()\n    screen.mainloop()");
    emptyWorkspace.dispose();

    const commandWorkspace = new Blockly.Workspace();
    const commandProgram = commandWorkspace.newBlock("visual_python_turtle_program");
    const forward = commandWorkspace.newBlock("visual_python_turtle_forward");
    commandProgram.getInput("BODY")?.connection?.connect(forward.previousConnection!);
    const commandCode = pythonGenerator.workspaceToCode(commandWorkspace);
    expect(commandCode).toContain("    pen.forward(100)\n    screen.mainloop()");
    expect(commandCode).not.toContain("\n  pen.forward(100)");
    commandWorkspace.dispose();

    const polygonWorkspace = new Blockly.Workspace();
    const polygonProgram = polygonWorkspace.newBlock("visual_python_turtle_program");
    const polygon = polygonWorkspace.newBlock("visual_python_turtle_polygon");
    polygonProgram.getInput("BODY")?.connection?.connect(polygon.previousConnection!);
    const polygonCode = pythonGenerator.workspaceToCode(polygonWorkspace);
    expect(polygonCode).toContain("    for _ in range(max(3, int(3))):\n        pen.forward(80)\n        pen.right(");
    expect(polygonCode).not.toContain("\n            pen.forward(80)");
    polygonWorkspace.dispose();

    const eventWorkspace = new Blockly.Workspace();
    const eventProgram = eventWorkspace.newBlock("visual_python_turtle_program");
    const event = eventWorkspace.newBlock("visual_python_turtle_on_key");
    eventProgram.getInput("BODY")?.connection?.connect(event.previousConnection!);
    const eventCode = pythonGenerator.workspaceToCode(eventWorkspace);
    expect(eventCode).toContain("    def turtle_key_");
    expect(eventCode).toContain("\n        pass\n    screen.onkey(");
    eventWorkspace.dispose();

    const nestedWorkspace = new Blockly.Workspace();
    const loopType = "visual_python_turtle_test_loop";
    if (!Blockly.Blocks[loopType]) {
      Blockly.common.defineBlocksWithJsonArray([{
        type: loopType,
        message0: "重复绘制 %1",
        args0: [{ type: "input_statement", name: "DO" }],
        previousStatement: null,
        nextStatement: null,
      }]);
    }
    pythonGenerator.forBlock[loopType] = (block, generator) => `for _ in range(5):\n${generator.statementToCode(block, "DO")}`;
    const nestedProgram = nestedWorkspace.newBlock("visual_python_turtle_program");
    const nestedEvent = nestedWorkspace.newBlock("visual_python_turtle_on_key");
    const repeat = nestedWorkspace.newBlock(loopType);
    const nestedForward = nestedWorkspace.newBlock("visual_python_turtle_forward");
    const nestedRight = nestedWorkspace.newBlock("visual_python_turtle_right");
    nestedProgram.getInput("BODY")?.connection?.connect(nestedEvent.previousConnection!);
    nestedEvent.getInput("DO")?.connection?.connect(repeat.previousConnection!);
    repeat.getInput("DO")?.connection?.connect(nestedForward.previousConnection!);
    nestedForward.nextConnection?.connect(nestedRight.previousConnection!);
    const nestedCode = pythonGenerator.workspaceToCode(nestedWorkspace);
    for (const line of nestedCode.split("\n").filter((item) => item.trim())) {
      const indent = line.match(/^[ \t]*/)?.[0] || "";
      expect(indent).not.toContain("\t");
      expect(indent.length % 4, line).toBe(0);
    }
    nestedWorkspace.dispose();
  });

  it("normalizes tab-indented plugin suites to four spaces", async () => {
    const captured = await capturePlugin();
    const program = captured.generators.get("visual_python_turtle_program")!(fakeBlock({
      statements: { BODY: "\tpen.forward(80)\n\t\tpen.right(144)\n" },
    }), { ...fakeGenerator, INDENT: "  " });
    expect(program).not.toContain("\t");
    expect(program).toContain("    pen.forward(80)\n        pen.right(144)");
  });

  it("generates bounded drawing, text, screen, event, and state operations", async () => {
    const captured = await capturePlugin();
    expect(captured.generators.get("visual_python_turtle_speed")!(fakeBlock({ values: { SPEED: "20" } }), fakeGenerator)).toBe("pen.speed(max(0, min(10, int(20))))\n");
    expect(captured.generators.get("visual_python_turtle_polygon")!(fakeBlock({ values: { SIDES: "5", LENGTH: "60" } }), fakeGenerator)).toContain("for _ in range(max(3, int(5))):");
    expect(captured.generators.get("visual_python_turtle_write")!(fakeBlock({ fields: { ALIGN: "center", STYLE: "bold" }, values: { TEXT: "'你好'", SIZE: "24" } }), fakeGenerator)).toBe("pen.write('你好', align='center', font=('Arial', int(24), 'bold'))\n");
    expect(captured.generators.get("visual_python_turtle_screen_size")!(fakeBlock({ values: { WIDTH: "800", HEIGHT: "600" } }), fakeGenerator)).toBe("screen.setup(width=int(800), height=int(600))\n");

    const eventCode = captured.generators.get("visual_python_turtle_on_key")!(fakeBlock({ id: "event-1", fields: { KEY: "space" }, statements: { DO: "    pen.forward(10)\n" } }), fakeGenerator);
    expect(eventCode).toContain("def turtle_key_event_1():\n    pen.forward(10)");
    expect(eventCode).toContain("screen.onkey(turtle_key_event_1, 'space')\nscreen.listen()");

    expect(captured.generators.get("visual_python_turtle_xcor")!(fakeBlock(), fakeGenerator)).toEqual(["pen.xcor()", 0]);
    expect(captured.generators.get("visual_python_turtle_isdown")!(fakeBlock(), fakeGenerator)).toEqual(["pen.isdown()", 0]);
  });

  it("registers a read-only Agent capability inspector for all workspaces", async () => {
    const captured = await capturePlugin();
    expect(captured.agentTools).toHaveLength(1);
    const tool = captured.agentTools[0];
    expect(tool).toMatchObject({
      id: "visual-python.turtle.agent.inspect",
      label: "查看 Turtle 能力",
      workspaceModes: ["visual", "split", "code"],
      readOnly: true,
      definition: { function: { name: "inspect_turtle_capabilities" } },
    });
    const result = await tool.execute({}, {}, new AbortController().signal);
    expect(result).toMatchObject({ library: "turtle", entryBlock: "visual_python_turtle_program", variables: { screen: "turtle.Screen", pen: "turtle.Turtle" } });
    expect(result.workspaceTools).toEqual(["search_blocks", "get_block_templates", "add_workspace_block", "apply_workspace"]);
  });
});
