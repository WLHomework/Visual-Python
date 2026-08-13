import { describe, expect, it, vi } from "vitest";
import { createVisualPythonHostAdapter, type VisualPythonHostServices } from "./hostAdapter";

describe("Visual Python host adapter", () => {
  it("exposes only the AgentHost contract and delegates current project state", async () => {
    const getSnapshot = vi.fn(() => ({ scene: "MainScene", code: "pass" }));
    const observeExecution = vi.fn().mockResolvedValue({ rendering: false });
    const adapter = createVisualPythonHostAdapter({
      getSnapshot,
      observeExecution,
      workspaceModeRef: { current: "code" },
      sceneDocumentsRef: { current: [{ id: "main", name: "MainScene", code: "pass" }] },
      activeSceneIdRef: { current: "main" },
      sourceCodeRef: { current: "pass" },
    } as unknown as VisualPythonHostServices);

    expect(adapter.getSnapshot()).toEqual({ scene: "MainScene", code: "pass" });
    await expect(adapter.executeTool("list_scenes", {}, new AbortController().signal)).resolves.toEqual({
      activeSceneId: "main",
      scenes: [{ id: "main", name: "MainScene", lineCount: 1, active: true }],
    });
    await expect(adapter.observeExecution?.("render_manim", new AbortController().signal)).resolves.toEqual({ rendering: false });
    expect(observeExecution).toHaveBeenCalledWith("render_manim", expect.any(AbortSignal));
  });

  it("does not expose optional preview or editor implementation details", () => {
    const adapter = createVisualPythonHostAdapter({ getSnapshot: () => ({}) } as unknown as VisualPythonHostServices);

    expect(Object.keys(adapter)).toEqual(["getSnapshot", "executeTool", "observeExecution"]);
  });
});
