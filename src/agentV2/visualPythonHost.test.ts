import { describe, expect, it, vi } from "vitest";
import { createPluginDraftStore } from "./pluginAuthoring";
import { createVisualPythonToolExecutor } from "./visualPythonHost";
import type { VisualPythonHostServices } from "./visualPythonHost";
import visualPythonHostSource from "./visualPythonHost.ts?raw";

const createServices = (code: string) => ({
  workspaceModeRef: { current: "code" },
  documentsRef: { current: [{ id: "main", name: "main", code }] },
  activeDocumentIdRef: { current: "main" },
  sourceCodeRef: { current: code },
  projectPathRef: { current: null },
  projectResourcesRef: { current: [] },
  taskId: { current: null },
  runningRef: { current: false },
  manimTaskId: { current: null },
  manimRenderAttempt: { current: null },
  switchDocumentConsoleState: vi.fn(),
  setDocuments: vi.fn(),
  setActiveDocumentId: vi.fn(),
  setSourceCode: vi.fn(),
  projectName: "Test Project",
  pythonEnvironment: null,
  getProjectDirty: () => false,
} as unknown as VisualPythonHostServices);

describe("Visual Python tool applicability", () => {
  it("keeps the generic host free of Manim plugin implementation", () => {
    expect(visualPythonHostSource).not.toMatch(/Manim|validate_scene|render_manim|voiceover|list_scenes|create_scene/);
  });
  it("does not implement plugin tools in the generic host", async () => {
    const executeTool = createVisualPythonToolExecutor(createServices("print('hello')"));
    await expect(executeTool("render_manim", {}, new AbortController().signal)).rejects.toThrow("未实现工具 render_manim");
  });

  it("keeps regular Python code available to the generic syntax checker", async () => {
    const services = createServices("print('hello')");
    services.invoke = vi.fn().mockResolvedValue(undefined);
    services.setCodeSyntaxDiagnostic = vi.fn();
    services.setProblems = vi.fn();
    const executeTool = createVisualPythonToolExecutor(services);

    await expect(executeTool("check_code", {}, new AbortController().signal)).resolves.toEqual({
      valid: true,
      lineCount: 1,
    });
  });

  it("switches between regular Python documents without Manim scene handling", async () => {
    const services = createServices("print('main')");
    services.documentsRef.current.push({ id: "helper", name: "helper", code: "VALUE = 1" });
    const executeTool = createVisualPythonToolExecutor(services);

    await expect(executeTool("switch_document", { documentId: "helper" }, new AbortController().signal)).resolves.toEqual({
      switched: true,
      id: "helper",
      name: "helper",
      code: "VALUE = 1",
      lineCount: 1,
    });
    expect(services.activeDocumentIdRef.current).toBe("helper");
    expect(services.sourceCodeRef.current).toBe("VALUE = 1");
  });

  it("creates, updates, and validates plugin drafts without installing them", async () => {
    const services = createServices("print('hello')");
    services.pluginDraftStore = createPluginDraftStore();
    const executeTool = createVisualPythonToolExecutor(services);

    const plan = await executeTool("create_plugin_plan", { id: "com.example.shapes", name: "Shapes", description: "Basic shapes" }, new AbortController().signal);
    const created = await executeTool("create_plugin_draft", { id: "com.example.shapes", name: "Shapes", description: "Basic shapes", planId: String(plan.id) }, new AbortController().signal);
    expect(created).toMatchObject({ created: true, mode: "ir", validation: { valid: true, issues: [] } });
    const draftId = String(created.draftId);

    const updated = await executeTool("apply_plugin_plan", {
      draftId,
      operations: [
        { action: "set_manifest", set: { description: "Updated shapes" } },
        { action: "add_hook", hook: { ref: "hook-1", slot: "activate", code: "context.registerCommand({ id: \"com.example.shapes.run\", title: \"Run\", run() {} });" } },
      ],
    }, new AbortController().signal);
    expect(updated).toMatchObject({ applied: true, changed: true, validation: { valid: true, issues: [] } });
    await expect(executeTool("read_plugin_draft", { draftId }, new AbortController().signal)).resolves.toMatchObject({
      draftId,
      manifest: { description: "Updated shapes" },
      hooks: [{ ref: "hook-1", slot: "activate" }],
    });
    const failed = await executeTool("apply_plugin_plan", { draftId, operations: [{ action: "delete_block", ref: "missing" }] }, new AbortController().signal);
    expect(failed).toMatchObject({ applied: false, changed: false });
    expect((failed as { issues?: unknown[] }).issues?.[0]).toMatchObject({ code: "UNKNOWN_REF", ref: "missing", operationIndex: 0 });
    await expect(executeTool("validate_plugin_draft", { draftId }, new AbortController().signal)).resolves.toMatchObject({ draftId, validation: { valid: true, issues: [] } });
    await expect(executeTool("read_plugin_draft", { draftId: "draft-missing" }, new AbortController().signal)).rejects.toThrow(/当前可用草稿/);
    await expect(executeTool("read_plugin_guide", {}, new AbortController().signal)).resolves.toMatchObject({ found: true, section: null });
    const guide = await executeTool("read_plugin_guide", { section: "PluginContext" }, new AbortController().signal) as { found?: boolean; section?: string; content?: string };
    expect(guide.found).toBe(true);
    expect(guide.section).toBe("六、PluginContext API");
    expect(guide.content).toContain("registerBlock");
  });

  it("requires a successful runtime check before plugin installation", async () => {
    const services = createServices("print('hello')");
    services.pluginDraftStore = createPluginDraftStore();
    services.installPluginDraft = vi.fn().mockResolvedValue({ pluginId: "com.example.shapes", active: true });
    services.runPluginDraftChecks = vi.fn().mockResolvedValue({ valid: true, checks: ["activation", "block_samples", "python_syntax"] });
    const executeTool = createVisualPythonToolExecutor(services);
    const plan = await executeTool("create_plugin_plan", { id: "com.example.shapes", name: "Shapes", description: "Basic shapes" }, new AbortController().signal);
    const created = await executeTool("create_plugin_draft", { id: "com.example.shapes", name: "Shapes", description: "Basic shapes", planId: String(plan.id) }, new AbortController().signal);
    const draftId = String(created.draftId);

    await expect(executeTool("install_plugin_draft", { draftId }, new AbortController().signal)).resolves.toMatchObject({
      installed: false,
      validation: { valid: true },
      phase: "validated",
    });
    await expect(executeTool("run_plugin_draft_checks", { draftId }, new AbortController().signal)).resolves.toMatchObject({ valid: true, phase: "ready" });
    await expect(executeTool("install_plugin_draft", { draftId }, new AbortController().signal)).resolves.toMatchObject({ installed: true, phase: "installed" });
    expect(services.runPluginDraftChecks).toHaveBeenCalledTimes(1);
    expect(services.installPluginDraft).toHaveBeenCalledTimes(1);
  });

  it("lists installed plugins and imports one into an editable draft", async () => {
    const services = createServices("print('hello')");
    services.pluginDraftStore = createPluginDraftStore();
    services.listInstalledPlugins = vi.fn().mockResolvedValue([
      { id: "com.example.installed", name: "Installed", version: "1.2.3", active: true },
    ]);
    services.readInstalledPluginFiles = vi.fn().mockResolvedValue({
      files: {
        "plugin.json": JSON.stringify({ id: "com.example.installed", name: "Installed", version: "1.2.3", apiVersion: "1", entry: "index.js" }),
        "codegen.json": JSON.stringify({ version: 1, mode: "standalone" }),
        "index.js": "export default { activate(context) { context.registerCommand({ id: 'com.example.installed.run', title: 'Run', run() {} }); } };\n",
      },
      skipped: [],
    });
    services.installPluginDraft = vi.fn().mockResolvedValue({ pluginId: "com.example.installed", active: true });
    services.runPluginDraftChecks = vi.fn().mockResolvedValue({ valid: true, checks: ["activation", "block_samples", "python_syntax"] });
    const executeTool = createVisualPythonToolExecutor(services);

    await expect(executeTool("list_installed_plugins", {}, new AbortController().signal)).resolves.toEqual({
      plugins: [{ id: "com.example.installed", name: "Installed", version: "1.2.3", active: true }],
    });
    const imported = await executeTool("import_installed_plugin_draft", { pluginId: "com.example.installed" }, new AbortController().signal);

    expect(imported).toMatchObject({ imported: true, pluginId: "com.example.installed", files: ["plugin.json", "codegen.json", "index.js"] });
    await expect(executeTool("read_plugin_draft_file", {
      draftId: String(imported.draftId),
      path: "index.js",
      offset: 0,
      maxChars: 40,
    }, new AbortController().signal)).resolves.toMatchObject({
      path: "index.js",
      offset: 0,
      content: "export default { activate(context) { con",
      truncated: true,
      nextOffset: 40,
    });
    expect(services.listInstalledPlugins).toHaveBeenCalledTimes(1);
    expect(services.readInstalledPluginFiles).toHaveBeenCalledWith("com.example.installed");
    expect(services.pluginDraftStore.get(String(imported.draftId))?.files["index.js"]).toContain("registerCommand");
    await executeTool("update_plugin_draft", { draftId: String(imported.draftId), files: { "docs/guide.txt": "updated\n" } }, new AbortController().signal);
    await executeTool("run_plugin_draft_checks", { draftId: String(imported.draftId) }, new AbortController().signal);
    await expect(executeTool("install_plugin_draft", { draftId: String(imported.draftId) }, new AbortController().signal)).resolves.toMatchObject({
      installed: true,
      pluginId: "com.example.installed",
      active: true,
    });
    expect(services.installPluginDraft).toHaveBeenCalledWith(expect.objectContaining({
      files: expect.objectContaining({ "docs/guide.txt": "updated\n", "index.js": expect.stringContaining("registerCommand") }),
    }), expect.any(AbortSignal));
  });

  it("reads bounded recent output and problems without requiring a running task", async () => {
    const services = createServices("print('hello')");
    services.outputRef = { current: [
      { id: 1, stream: "system", data: "starting\n" },
      { id: 2, stream: "stderr", data: "plugin load failed\n" },
      { id: 3, stream: "stdout", data: "done\n" },
    ] } as any;
    services.problemsRef = { current: [
      { id: 1, kind: "plugin", line: 0, message: "manifest invalid", suggestion: "check plugin.json" },
      { id: 2, kind: "runtime", line: 8, message: "name is not defined" },
    ] } as any;
    const executeTool = createVisualPythonToolExecutor(services);

    await expect(executeTool("get_diagnostics", { limit: 1 }, new AbortController().signal)).resolves.toEqual({
      output: [{ stream: "stdout", data: "done\n" }],
      problems: [{ kind: "runtime", line: 8, message: "name is not defined", suggestion: undefined }],
      hasErrors: true,
    });
  });

  it("edits a plugin draft at one exact file location", async () => {
    const services = createServices("print('hello')");
    const store = createPluginDraftStore();
    services.pluginDraftStore = store;
    const executeTool = createVisualPythonToolExecutor(services);
    const draft = store.createFromFiles({
      "plugin.json": JSON.stringify({ id: "com.example.edit", name: "Edit", version: "1.0.0", apiVersion: "1", entry: "index.js" }),
      "codegen.json": JSON.stringify({ version: 1, mode: "standalone" }),
      "index.js": "const BLOCK_TYPE = \"original\";\nexport default { activate(context) { context.registerCommand({ id: \"com.example.edit.run\", title: \"Run\", run() {} }); } };\n",
    });

    await expect(executeTool("edit_plugin_draft_file", {
      draftId: draft.id,
      path: "index.js",
      oldText: "const BLOCK_TYPE",
      newText: "const BLOCK_TYPE = \"edited\"; //",
    }, new AbortController().signal)).resolves.toMatchObject({ edited: true, phase: "implementing" });
  });

  it("uses live plugin capabilities after a plugin is activated", async () => {
    const services = createServices("print('hello')");
    services.agentCapabilities = [];
    services.getAgentCapabilities = () => [{ id: "com.example.numpy", name: "NumPy", description: "NumPy blocks", active: true }];
    const executeTool = createVisualPythonToolExecutor(services);

    await expect(executeTool("get_context", {}, new AbortController().signal)).resolves.toMatchObject({
      capabilities: [{ id: "com.example.numpy", name: "NumPy" }],
    });
  });

  it("includes the active workbench profile in context", async () => {
    const services = createServices("print('hello')");
    services.getWorkbench = () => ({ id: "esp32-wroom", label: "ESP32 WROOM", kind: "micropython", boardId: "esp32-wroom" });
    const executeTool = createVisualPythonToolExecutor(services);

    await expect(executeTool("get_context", {}, new AbortController().signal)).resolves.toMatchObject({
      workbench: { id: "esp32-wroom", label: "ESP32 WROOM", kind: "micropython", boardId: "esp32-wroom" },
    });
  });

  it("can read only the requested diagnostics channel", async () => {
    const services = createServices("print('hello')");
    services.outputRef = { current: [{ id: 1, stream: "stderr", data: "failed\n" }] } as any;
    services.problemsRef = { current: [{ id: 1, kind: "plugin", line: 0, message: "broken" }] } as any;
    const executeTool = createVisualPythonToolExecutor(services);

    await expect(executeTool("get_diagnostics", { includeOutput: false, includeProblems: true }, new AbortController().signal)).resolves.toEqual({
      problems: [{ kind: "plugin", line: 0, message: "broken", suggestion: undefined }],
      hasErrors: true,
    });
  });

  it("validates extension contracts against active plugin capabilities", async () => {
    const services = createServices("print('hello')");
    const store = createPluginDraftStore();
    services.pluginDraftStore = store;
    services.agentCapabilities = [{ id: "visual-python.robot", name: "Robot", description: "Robot runtime", codegen: { entryBlock: "visual_python_robot_program", statementInput: "BODY", runtimeNames: ["robot"] } }] as any;
    const draft = store.createFromFiles({
      "plugin.json": JSON.stringify({ id: "com.example.robot-extension", name: "Robot Extension", version: "1.0.0", apiVersion: "1", entry: "index.js" }),
      "codegen.json": JSON.stringify({ version: 1, mode: "extension", provider: "visual-python.robot", runtimeNames: ["robot"] }),
      "index.js": `export default { activate(context) {
        context.registerBlock({ type: "com_example_robot_extension_move", message0: "移动" }, () => "robot.move()\\n");
        context.registerToolboxCategory({ id: "com.example.robot-extension.toolbox", name: "Robot Extension", colour: "#397ca5", contents: [] });
      } };`,
    });
    const executeTool = createVisualPythonToolExecutor(services);

    await expect(executeTool("validate_plugin_draft", { draftId: draft.id }, new AbortController().signal)).resolves.toMatchObject({ validation: { valid: true, issues: [] } });
    services.agentCapabilities = [];
    await expect(executeTool("validate_plugin_draft", { draftId: draft.id }, new AbortController().signal)).resolves.toMatchObject({
      validation: { valid: false, issues: ["代码生成契约依赖的插件当前不可用：visual-python.robot"] },
    });
  });

});
