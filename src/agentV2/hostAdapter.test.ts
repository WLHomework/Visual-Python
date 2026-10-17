import { describe, expect, it, vi } from "vitest";
import { createVisualPythonHostAdapter, type VisualPythonHostServices } from "./hostAdapter";

describe("Visual Python host adapter", () => {
  it("exposes only the AgentHost contract and delegates current project state", async () => {
    const getSnapshot = vi.fn(() => ({ activeDocument: "main", code: "pass" }));
    const getCapabilities = vi.fn(() => [{ id: "sample", name: "Sample", description: "Sample capability" }]);
    const observeExecution = vi.fn().mockResolvedValue({ rendering: false });
    const adapter = createVisualPythonHostAdapter({
      getSnapshot,
      getCapabilities,
      observeExecution,
      workspaceModeRef: { current: "code" },
      documentsRef: { current: [{ id: "main", name: "MainScene", code: "pass" }] },
      activeDocumentIdRef: { current: "main" },
      sourceCodeRef: { current: "pass" },
    } as unknown as VisualPythonHostServices);

    expect(adapter.getSnapshot()).toEqual({ activeDocument: "main", code: "pass" });
    expect(adapter.getCapabilities?.()).toEqual([{ id: "sample", name: "Sample", description: "Sample capability" }]);
    await expect(adapter.executeTool("list_documents", {}, new AbortController().signal)).resolves.toEqual({
      activeDocumentId: "main",
      documents: [{ id: "main", name: "MainScene", lineCount: 1, active: true }],
    });
    await expect(adapter.observeExecution?.("render_manim", new AbortController().signal)).resolves.toEqual({ rendering: false });
    expect(observeExecution).toHaveBeenCalledWith("render_manim", expect.any(AbortSignal));
  });

  it("does not expose optional preview or editor implementation details", () => {
    const adapter = createVisualPythonHostAdapter({ getSnapshot: () => ({}) } as unknown as VisualPythonHostServices);

    expect(Object.keys(adapter)).toEqual(["getSnapshot", "executeTool", "observeExecution"]);
  });

  it("exposes the generated block catalog through the host contract", () => {
    const getBlockCatalog = vi.fn((task?: string) => JSON.stringify({ task, categories: [{ name: "Manim" }] }));
    const adapter = createVisualPythonHostAdapter({
      getSnapshot: () => ({}),
      getBlockCatalog,
    } as unknown as VisualPythonHostServices);

    expect(adapter.getBlockCatalog?.("create a circle")).toContain('"Manim"');
    expect(getBlockCatalog).toHaveBeenCalledWith("create a circle");
  });

  it("routes dynamically registered plugin tools through the plugin executor", async () => {
    const executePluginTool = vi.fn().mockResolvedValue({ ok: true });
    const adapter = createVisualPythonHostAdapter({
      getSnapshot: () => ({}),
      getTools: () => [{
        definition: { type: "function", function: { name: "sample_tool", description: "Sample", parameters: { type: "object", properties: {} } } },
        label: "Sample",
      }],
      executePluginTool,
    } as unknown as VisualPythonHostServices);

    await expect(adapter.executeTool("sample_tool", { value: 1 }, new AbortController().signal)).resolves.toEqual({ ok: true });
    expect(executePluginTool).toHaveBeenCalledWith("sample_tool", { value: 1 }, expect.any(AbortSignal), expect.any(Function));
  });

  it("does not route a visual-capable plugin tool through the Blockly executor", async () => {
    const executePluginTool = vi.fn().mockResolvedValue({ ok: true, plugin: true });
    const blocklyTools = vi.fn().mockResolvedValue({ ok: true, blockly: true });
    const adapter = createVisualPythonHostAdapter({
      getSnapshot: () => ({ workspaceMode: "visual" }),
      getTools: () => [{
        definition: { type: "function", function: { name: "render_plugin", description: "Render", parameters: { type: "object", properties: {} } } },
        label: "Render",
        workspaceModes: ["visual", "split"],
      }],
      blocklyTools,
      blocklyToolNames: ["get_workspace"],
      executePluginTool,
    } as unknown as VisualPythonHostServices);

    await expect(adapter.executeTool("render_plugin", {}, new AbortController().signal)).resolves.toEqual({ ok: true, plugin: true });
    expect(executePluginTool).toHaveBeenCalledOnce();
    expect(blocklyTools).not.toHaveBeenCalled();
  });
});
