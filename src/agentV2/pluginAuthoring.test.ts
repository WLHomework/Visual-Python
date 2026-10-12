import { describe, expect, it } from "vitest";
import { createPluginDraftStore, validatePluginDraft } from "./pluginAuthoring";

describe("plugin authoring drafts", () => {
  it("rejects runtime validation and installation before the required phases", () => {
    const store = createPluginDraftStore();
    const draft = store.create({ id: "com.example.flow", name: "Flow", description: "Flow" });

    expect(() => store.markRuntimeValidation(draft.id, { valid: true, checks: ["activation"] })).toThrow(/validate_plugin_draft/);
    expect(() => store.markInstalled(draft.id)).toThrow(/run_plugin_draft_checks/);
  });

  it("applies a draft file edit only when the old text matches exactly", () => {
    const store = createPluginDraftStore();
    const draft = store.create({ id: "com.example.edit", name: "Edit", description: "Edit" });
    const before = draft.files["index.js"];

    expect(() => store.editFile(draft.id, "index.js", "missing", "replacement")).toThrow(/oldText/);
    const updated = store.editFile(draft.id, "index.js", "const BLOCK_TYPE", "const BLOCK_TYPE = \"changed\"; //");

    expect(updated.files["index.js"]).not.toBe(before);
    expect(updated.phase).toBe("implementing");
  });

  it("builds planned block types into the generated plugin scaffold", () => {
    const store = createPluginDraftStore();
    const plan = store.createPlan({
      id: "com.example.template",
      name: "Template",
      description: "Template",
      blocks: [{ type: "com_example_template_star", purpose: "draw a star", inputs: ["SIZE"] }],
    });
    const draft = store.create({ id: "com.example.template", name: "Template", description: "Template", planId: plan.id });

    expect(draft.files["index.js"]).toContain("com_example_template_star");
    expect(draft.files["index.js"]).toContain('name: "SIZE"');
  });

  it("creates a valid standard plugin scaffold", () => {
    const store = createPluginDraftStore();
    const draft = store.create({ id: "com.example.shapes", name: "Shapes", description: "Basic shapes" });

    expect(draft.files).toMatchObject({
      "plugin.json": expect.any(String),
      "codegen.json": expect.any(String),
      "index.js": expect.any(String),
      "README.md": expect.any(String),
    });
    expect(JSON.parse(draft.files["plugin.json"])).toMatchObject({
      agent: { description: "Basic shapes", detect: "project" },
    });
    expect(validatePluginDraft(draft)).toMatchObject({ valid: true, issues: [] });
  });

  it("updates only the requested draft files", () => {
    const store = createPluginDraftStore();
    const draft = store.create({ id: "com.example.shapes", name: "Shapes", description: "Basic shapes" });
    const updated = store.update(draft.id, { "README.md": "# Shapes\n" });

    expect(updated.files["README.md"]).toBe("# Shapes\n");
    expect(updated.files["index.js"]).toBe(draft.files["index.js"]);
    expect(updated.phase).toBe("implementing");
  });

  it("keeps a structured plugin plan attached to the draft", () => {
    const store = createPluginDraftStore();
    const plan = store.createPlan({
      id: "com.example.shapes",
      name: "Shapes",
      description: "Basic shapes",
      blocks: [{ type: "com_example_shapes_circle", purpose: "draw a circle", inputs: ["RADIUS"] }],
    });
    const draft = store.create({ id: "com.example.shapes", name: "Shapes", description: "Basic shapes", planId: plan.id });

    expect(draft.plan).toMatchObject({ id: plan.plan.id, blocks: [{ type: "com_example_shapes_circle", inputs: ["RADIUS"] }] });
    expect(draft.phase).toBe("drafted");
  });

  it("moves a draft to needs_fix after failed validation", () => {
    const store = createPluginDraftStore();
    const draft = store.create({ id: "com.example.invalid", name: "Invalid", description: "Invalid" });
    const result = validatePluginDraft(draft);
    expect(result.valid).toBe(true);
    const broken = store.update(draft.id, { "plugin.json": "{}" });
    expect(validatePluginDraft(broken).valid).toBe(false);
    expect(store.markValidation(broken.id, validatePluginDraft(broken))).toMatchObject({ phase: "needs_fix" });
  });

  it("imports an installed plugin without replacing its files with a scaffold", () => {
    const store = createPluginDraftStore();
    const files = {
      "plugin.json": JSON.stringify({ id: "com.example.installed", name: "Installed", version: "1.2.3", apiVersion: "1", entry: "src/index.js" }),
      "codegen.json": JSON.stringify({ version: 1, mode: "standalone" }),
      "src/index.js": "export default { activate(context) { context.registerCommand({ id: 'com.example.installed.run', title: 'Run', run() {} }); } };\n",
      "docs/guide.txt": "installed source\n",
    };

    const draft = store.createFromFiles(files);

    expect(draft.files).toEqual(files);
    expect(draft.files).not.toBe(files);
    expect(store.get(draft.id)).toEqual(draft);
  });

  it("rejects an entry module that registers no plugin contributions", () => {
    const result = validatePluginDraft({
      files: {
        "plugin.json": JSON.stringify({ id: "com.example.empty", name: "Empty", version: "1.0.0", apiVersion: "1", entry: "index.js" }),
        "codegen.json": JSON.stringify({ version: 1, mode: "standalone", blocks: { demo: {} } }),
        "index.js": `export default { activate() { return { codegen: "./codegen.json" }; } };`,
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("activate(context)"),
      expect.stringContaining("codegen.json"),
    ]));
  });

  it("requires a toolbox category when a plugin registers blocks", () => {
    const result = validatePluginDraft({
      files: {
        "plugin.json": JSON.stringify({ id: "com.example.hidden", name: "Hidden", version: "1.0.0", apiVersion: "1", entry: "index.js" }),
        "codegen.json": JSON.stringify({ version: 1, mode: "standalone" }),
        "index.js": `export default { activate(context) {
          context.registerBlock({ type: "com_example_hidden_value", message0: "value", output: null }, () => ["1", 0]);
        } };`,
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("入口注册了积木，但没有调用 context.registerToolboxCategory() 将积木加入工具箱");
  });

  it("reports invalid manifest, missing entry, and unsafe paths", () => {
    const result = validatePluginDraft({
      files: {
        "plugin.json": JSON.stringify({ id: "Bad ID", name: "", version: "1", apiVersion: "2", entry: "../index.js" }),
        "notes/../README.md": "unsafe",
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("plugin.json"),
      expect.stringContaining("entry"),
      expect.stringContaining("路径"),
    ]));
  });

  it("rejects a standalone generator that uses an undeclared runtime object", () => {
    const result = validatePluginDraft({
      files: {
        "plugin.json": JSON.stringify({ id: "com.example.robot", name: "Robot", version: "1.0.0", apiVersion: "1", entry: "index.js" }),
        "codegen.json": JSON.stringify({ version: 1, mode: "standalone" }),
        "index.js": `export default { activate(context) {
          context.registerBlock({ type: "com_example_robot_move", message0: "移动" }, () => "robot.move()\\n");
        } };`,
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("生成代码使用了未声明的运行对象：robot");
  });

  it("accepts a standalone generator that initializes its runtime objects", () => {
    const result = validatePluginDraft({
      files: {
        "plugin.json": JSON.stringify({ id: "com.example.robot", name: "Robot", version: "1.0.0", apiVersion: "1", entry: "index.js" }),
        "codegen.json": JSON.stringify({ version: 1, mode: "standalone" }),
        "index.js": `export default { activate(context) {
          context.registerBlock({ type: "com_example_robot_move", message0: "移动" }, () => "import robotics\\nrobot = robotics.Robot()\\nrobot.move()\\n");
          context.registerToolboxCategory({ id: "com.example.robot.toolbox", name: "Robot", colour: "#397ca5", contents: [] });
        } };`,
      },
    });

    expect(result).toMatchObject({ valid: true, issues: [] });
  });

  it("does not confuse JavaScript callback parameters with generated Python runtime objects", () => {
    const result = validatePluginDraft({
      files: {
        "plugin.json": JSON.stringify({ id: "com.example.callback", name: "Callback", version: "1.0.0", apiVersion: "1", entry: "index.js" }),
        "codegen.json": JSON.stringify({ version: 1, mode: "standalone" }),
        "index.js": `const readValue = (source) => source.getValue();
        export default { activate(context) {
          context.registerBlock({ type: "com_example_callback_print", message0: "输出" }, (block) => \`print(\${readValue(block)})\\n\`);
          context.registerToolboxCategory({ id: "com.example.callback.toolbox", name: "Callback", colour: "#397ca5", contents: [] });
        } };`,
      },
    });

    expect(result).toMatchObject({ valid: true, issues: [] });
  });

  it("accepts declared runtime objects only from an available plugin capability", () => {
    const draft = {
      files: {
        "plugin.json": JSON.stringify({ id: "com.example.robot-extension", name: "Robot Extension", version: "1.0.0", apiVersion: "1", entry: "index.js" }),
        "codegen.json": JSON.stringify({ version: 1, mode: "extension", provider: "visual-python.robot", runtimeNames: ["robot"] }),
        "index.js": `export default { activate(context) {
          context.registerBlock({ type: "com_example_robot_extension_move", message0: "移动" }, () => "robot.move()\\n");
          context.registerToolboxCategory({ id: "com.example.robot-extension.toolbox", name: "Robot Extension", colour: "#397ca5", contents: [] });
        } };`,
      },
    };

    expect(validatePluginDraft(draft, { availableCapabilities: [{ id: "visual-python.robot", entryBlock: "visual_python_robot_program", statementInput: "BODY", runtimeNames: ["robot"] }] })).toMatchObject({ valid: true, issues: [] });
    expect(validatePluginDraft(draft).issues).toContain("代码生成契约依赖的插件当前不可用：visual-python.robot");
    expect(validatePluginDraft(draft, { availableCapabilities: [] }).issues).toContain("代码生成契约依赖的插件当前不可用：visual-python.robot");
    expect(validatePluginDraft(draft, { availableCapabilities: [{ id: "visual-python.robot", runtimeNames: ["screen"] }] }).issues).toContain("提供方 visual-python.robot 未声明运行对象：robot");
  });
});
