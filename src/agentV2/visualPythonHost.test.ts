import { describe, expect, it, vi } from "vitest";
import { createVisualPythonToolExecutor } from "./visualPythonHost";
import type { VisualPythonHostServices } from "./visualPythonHost";
import visualPythonHostSource from "./visualPythonHost.ts?raw";

const createServices = (code: string) => ({
  workspaceModeRef: { current: "code" },
  documentsRef: { current: [{ id: "main", name: "main", code }] },
  activeDocumentIdRef: { current: "main" },
  sourceCodeRef: { current: code },
  taskId: { current: null },
  manimTaskId: { current: null },
  manimRenderAttempt: { current: null },
  switchDocumentConsoleState: vi.fn(),
  setDocuments: vi.fn(),
  setActiveDocumentId: vi.fn(),
  setSourceCode: vi.fn(),
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

});
