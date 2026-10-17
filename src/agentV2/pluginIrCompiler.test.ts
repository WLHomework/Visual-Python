import { describe, expect, it } from "vitest";
import { compilePluginIr } from "./pluginIrCompiler";
import { parsePluginIr } from "./pluginIr";
import { validatePluginDraft } from "./pluginAuthoring";

describe("plugin IR compiler", () => {
  it("compiles a minimal standalone plugin into deterministic golden files", () => {
    const ir = parsePluginIr({
      version: 1,
      manifest: { id: "com.example.hello", name: "Hello", description: "Hello plugin" },
      blocks: [{
        ref: "block_1",
        type: "com_example_hello_print",
        message: ["输出", { input: "TEXT" }],
        inputs: [{ name: "TEXT", kind: "value" }],
        agent: { purpose: "输出文本" },
        generator: { template: "print({INPUT:TEXT})" },
      }],
    });

    const files = compilePluginIr(ir);

    expect(Object.keys(files).sort()).toEqual(["README.md", "codegen.json", "index.js", "plugin.json"]);
    expect(files["README.md"]).toBe("# Hello\n\nHello plugin\n");
    expect(JSON.parse(files["plugin.json"])).toEqual({
      id: "com.example.hello",
      name: "Hello",
      version: "1.0.0",
      apiVersion: "1",
      description: "Hello plugin",
      entry: "index.js",
      agent: { description: "Hello plugin", detect: "project" },
    });
    expect(JSON.parse(files["codegen.json"])).toEqual({
      version: 1,
      mode: "standalone",
      blocks: {
        com_example_hello_print: {
          purpose: "输出文本",
          inputs: ["TEXT"],
          capabilities: ["输出文本"],
          keywords: ["输出文本", "com_example_hello_print"],
          examples: ["输出文本"],
        },
      },
    });
    expect(files["index.js"]).toBe([
      "const BLOCKS = [",
      "  {",
      "    definition: {",
      '      type: "com_example_hello_print",',
      '      message0: "输出 %1",',
      "      args0: [",
      "        {",
      '          type: "input_value",',
      '          name: "TEXT"',
      "        }",
      "      ],",
      "      previousStatement: null,",
      "      nextStatement: null,",
      '      colour: "#397ca5",',
      "      agent: {",
      '        description: "输出文本",',
      "        capabilities: [",
      '          "输出文本"',
      "        ],",
      "        keywords: [",
      '          "输出文本",',
      '          "com_example_hello_print"',
      "        ],",
      "        examples: [",
      '          "输出文本"',
      "        ]",
      "      }",
      "    },",
      "    generator(block, generator) {",
      '      return "print(" + (generator.valueToCode(block, "TEXT", 0) || "None") + ")";',
      "    },",
      "  },",
      "];",
      "",
      "export default {",
      "  activate(context) {",
      "    for (const item of BLOCKS) context.registerBlock(item.definition, item.generator);",
      "    context.registerToolboxCategory({",
      '      id: "com.example.hello.toolbox",',
      '      name: "Hello",',
      '      colour: "#397ca5",',
      "      contents: [",
      '        {"kind":"block","type":"com_example_hello_print"},',
      "      ],",
      "    });",
      "  },",
      "};",
      "",
    ].join("\n"));

    expect(compilePluginIr(ir)).toEqual(files);
    expect(validatePluginDraft({ files })).toMatchObject({ valid: true, issues: [] });
  });

  it("compiles value blocks, fields, shadows and toolbox defaults", () => {
    const ir = parsePluginIr({
      version: 1,
      manifest: { id: "com.example.turtle", name: "Turtle", description: "海龟绘图" },
      blocks: [
        {
          ref: "circle",
          type: "com_example_turtle_circle",
          inputs: [{ name: "RADIUS", kind: "value", shadow: { type: "math_number", fields: { NUM: 50 } } }],
          agent: { purpose: "画圆" },
          generator: { template: "circle({INPUT:RADIUS})" },
        },
        {
          ref: "angle",
          type: "com_example_turtle_angle",
          message: ["角度", { field: "MODE" }],
          fields: [{ name: "MODE", kind: "dropdown", options: [["左", "left"], ["右", "right"]], default: "left" }],
          output: "Number",
          agent: { purpose: "角度值" },
          generator: { template: "angle({FIELD:MODE})" },
        },
      ],
    });

    const files = compilePluginIr(ir);
    const index = files["index.js"];

    expect(index).toContain('return "circle(" + (generator.valueToCode(block, "RADIUS", 0) || "None") + ")";');
    expect(index).toContain('return ["angle(" + block.getFieldValue("MODE") + ")", 0];');
    expect(index).toContain('message0: "角度 %1",');
    expect(index).toContain('type: "field_dropdown"');
    expect(index).toContain('"左"');
    expect(index).toContain('"left"');
    expect(index).toContain('{"kind":"block","type":"com_example_turtle_circle","inputs":{"RADIUS":{"shadow":{"type":"math_number","fields":{"NUM":50}}}}}');
    expect(index).toContain('{"kind":"block","type":"com_example_turtle_angle"}');
    expect(JSON.parse(files["codegen.json"]).blocks.com_example_turtle_angle.output).toBe("Number");
    expect(validatePluginDraft({ files })).toMatchObject({ valid: true, issues: [] });
  });

  it("hoists imports and init into placeholders and keeps empty statement bodies valid", () => {
    const ir = parsePluginIr({
      version: 1,
      manifest: { id: "com.example.turtle", name: "Turtle", description: "海龟绘图" },
      blocks: [
        {
          ref: "program",
          type: "com_example_turtle_program",
          message: ["程序"],
          inputs: [{ name: "BODY", kind: "statement" }],
          agent: { purpose: "程序入口" },
          generator: {
            template: "{IMPORTS}\n{INIT}\nscreen = turtle.Screen()\ndef main():\n{STMTS:BODY}\n    screen.mainloop()\n\nif __name__ == \"__main__\":\n    main()\n",
          },
        },
        {
          ref: "circle",
          type: "com_example_turtle_circle",
          inputs: [{ name: "RADIUS", kind: "value" }],
          agent: { purpose: "画圆" },
          generator: { template: "pen.circle({INPUT:RADIUS})", imports: ["import turtle"], init: ["pen = turtle.Turtle()"] },
        },
      ],
    });

    const files = compilePluginIr(ir);
    const index = files["index.js"];

    expect(index).toContain('"import turtle\\npen = turtle.Turtle()\\nscreen = turtle.Screen()\\ndef main():\\n"');
    expect(index).toContain('(generator.statementToCode(block, "BODY") || "    pass\\n")');
    expect(index).not.toContain("{IMPORTS}");
    expect(index).not.toContain("{INIT}");
    expect(index).not.toContain("{STMTS:");
    expect(JSON.parse(files["codegen.json"]).blocks.com_example_turtle_program.statementInput).toBe("BODY");
    expect(validatePluginDraft({ files })).toMatchObject({ valid: true, issues: [] });
  });

  it("renders a lone statement template with a plain pass fallback", () => {
    const ir = parsePluginIr({
      version: 1,
      manifest: { id: "com.example.turtle", name: "Turtle", description: "海龟绘图" },
      blocks: [{
        ref: "group",
        type: "com_example_turtle_group",
        inputs: [{ name: "DO", kind: "statement" }],
        agent: { purpose: "分组" },
        generator: { template: "{STMTS:DO}" },
      }],
    });

    const index = compilePluginIr(ir)["index.js"];
    expect(index).toContain("const body = generator.statementToCode(block, \"DO\");");
    expect(index).toContain('return body || "pass\\n";');
  });

  it("compiles extension plugins with hooks, custom toolbox items and extra files", () => {
    const ir = parsePluginIr({
      version: 1,
      manifest: {
        id: "com.example.robot-ext",
        name: "Robot Ext",
        description: "机器人扩展",
        kind: "extension",
        provider: "visual-python.robot",
        runtimeNames: ["robot"],
      },
      blocks: [{
        ref: "move",
        type: "com_example_robot_ext_move",
        inputs: [{ name: "DISTANCE", kind: "value" }],
        agent: { purpose: "移动机器人" },
        generator: { template: "robot.move({INPUT:DISTANCE})" },
      }],
      toolbox: [{ name: "机器人", colour: "#9b59b6", contents: [{ ref: "move" }, "sep", { label: "更多" }] }],
      hooks: [
        { ref: "hook-1", slot: "module", code: "const EXTRA = 1;" },
        { ref: "hook-2", slot: "activate", code: "context.registerCommand({ id: \"com.example.robot-ext.nod\", title: \"点头\", run() {} });" },
      ],
      files: { "docs/guide.txt": "guide\n" },
    });

    const files = compilePluginIr(ir);
    const index = files["index.js"];

    expect(JSON.parse(files["codegen.json"])).toMatchObject({
      version: 1,
      mode: "extension",
      provider: "visual-python.robot",
      runtimeNames: ["robot"],
    });
    expect(files["docs/guide.txt"]).toBe("guide\n");
    expect(index.indexOf("const EXTRA = 1;")).toBeGreaterThan(-1);
    expect(index.indexOf("const EXTRA = 1;")).toBeLessThan(index.indexOf("const BLOCKS = ["));
    expect(index).toContain('{"kind":"sep"}');
    expect(index).toContain('{"kind":"label","text":"更多"}');
    expect(index).toContain('      colour: "#9b59b6",');
    expect(index).toContain('    context.registerCommand({ id: "com.example.robot-ext.nod", title: "点头", run() {} });');
    expect(validatePluginDraft({ files }, {
      availableCapabilities: [{ id: "visual-python.robot", runtimeNames: ["robot"] }],
    })).toMatchObject({ valid: true, issues: [] });
  });
});
