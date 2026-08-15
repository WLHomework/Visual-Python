import { describe, expect, it, vi } from "vitest";
import { createManimCapabilityExecutor, type ManimAgentServices } from "./agentRuntime";
import { applyExactCodeEdits } from "../../../agentV2/codeChanges";

const code = "from manim import *\n\nclass Demo(Scene):\n    def construct(self):\n        pass\n";

const services = () => ({
  workspaceModeRef: { current: "code" },
  documentsRef: { current: [{ id: "scene", name: "Demo", code }] },
  activeDocumentIdRef: { current: "scene" },
  sourceCodeRef: { current: code },
  projectPathRef: { current: null },
  projectResourcesRef: { current: [] },
  taskId: { current: null },
  renderTaskId: { current: null },
  renderAttempt: { current: null },
  renderOutputRef: { current: null },
  problemsRef: { current: [] },
  problemIdRef: { current: 1 },
  projectName: "demo.vpy",
  pythonEnvironment: { path: "python", version: "3.12" },
  voiceoverRoles: [],
  ttsConfig: { baseUrl: "", provider: "", model: "", voice: "", speed: 1, emotion: "", tone: "", intonation: "", readingStyle: "", customInstruction: "" },
  ttsApiKey: "",
  renderConfig: { outputType: "video", transparentBackground: false, selectedScene: "Demo" },
  getCurrentCode: () => code,
  setDocuments: vi.fn(),
  setActiveDocumentId: vi.fn(),
  setSourceCode: vi.fn(),
  setSourceCodeInitialized: vi.fn(),
  setDirty: vi.fn(),
  setProblems: vi.fn(),
  setActivePanel: vi.fn(),
  switchDocumentConsoleState: vi.fn(),
  updateRenderConfig: vi.fn(),
  render: vi.fn(),
  inspectImageQuality: vi.fn(),
  inspectVideoQuality: vi.fn(),
  invoke: vi.fn().mockResolvedValue({ classes: [{ name: "Demo", methods: [{ name: "construct" }] }] }),
} as unknown as ManimAgentServices);

describe("Manim Agent runtime", () => {
  it("lists only Manim documents through the plugin capability", async () => {
    const runtime = services();
    runtime.documentsRef.current.push({ id: "helper", name: "helper", code: "VALUE = 1" });
    const execute = createManimCapabilityExecutor(runtime, vi.fn());
    await expect(execute("list_scenes", {}, new AbortController().signal)).resolves.toMatchObject({ scenes: [{ id: "scene", name: "Demo" }] });
  });

  it("renders through the plugin service and reports a started task", async () => {
    const runtime = services();
    runtime.render = vi.fn(async () => { runtime.renderTaskId.current = 7; });
    const execute = createManimCapabilityExecutor(runtime, vi.fn());
    await expect(execute("render_manim", { outputType: "video" }, new AbortController().signal)).resolves.toEqual({ started: true, outputType: "video" });
    expect(runtime.render).toHaveBeenCalledWith(expect.objectContaining({ outputType: "video" }));
  });

  it("rejects invalid render dimensions at the plugin execution boundary", async () => {
    const runtime = services();
    const execute = createManimCapabilityExecutor(runtime, vi.fn());

    await expect(execute("render_manim", { outputType: "image", imageWidth: 32, imageHeight: 1080 }, new AbortController().signal)).rejects.toThrow("图片宽高必须是 64 到 8192 之间的整数");
    expect(runtime.render).not.toHaveBeenCalled();
  });

  it("uses animation capture when an image frame step is provided", async () => {
    const runtime = services();
    runtime.render = vi.fn(async () => { runtime.renderTaskId.current = 7; });
    const execute = createManimCapabilityExecutor(runtime, vi.fn());

    await execute("render_manim", { outputType: "image", imageAnimationStep: 4 }, new AbortController().signal);

    expect(runtime.render).toHaveBeenCalledWith(expect.objectContaining({ imageCaptureMode: "animation", imageAnimationStep: 4 }));
  });

  it("reports duplicate construct methods and missing resource files", async () => {
    const runtime = services();
    runtime.projectPathRef.current = "C:\\demo\\lesson.vpy";
    runtime.projectResourcesRef.current = [{ id: "image-1", type: "image", path: "images/missing.png", originalName: "missing.png", size: 1 }];
    runtime.sourceCodeRef.current = code.replace("pass", "path = 'resource://image-1'");
    runtime.getCurrentCode = () => runtime.sourceCodeRef.current;
    runtime.invoke = vi.fn(async <T,>(command: string): Promise<T> => {
      if (command === "inspect_python_structure") return { classes: [{ name: "Demo", methods: [{ name: "construct" }, { name: "construct" }] }] } as T;
      if (command === "inspect_project_resources") return [{ path: "images/missing.png", exists: false, size: 0 }] as T;
      return undefined as T;
    }) as typeof runtime.invoke;
    const execute = createManimCapabilityExecutor(runtime, vi.fn());

    const result = await execute("validate_scene", {}, new AbortController().signal);

    expect(result).toMatchObject({ valid: false });
    expect((result.issues as Array<{ code: string }>).map((issue) => issue.code)).toEqual(expect.arrayContaining(["duplicate-construct", "missing-resource-file"]));
  });

  it("validates generated Manim code in a visual workspace without a document name mismatch", async () => {
    const runtime = services();
    runtime.workspaceModeRef.current = "visual";
    runtime.documentsRef.current = [];
    runtime.activeDocumentIdRef.current = "";
    runtime.getCurrentCode = () => code;
    const execute = createManimCapabilityExecutor(runtime, vi.fn());

    await expect(execute("validate_scene", {}, new AbortController().signal)).resolves.toMatchObject({ valid: true, kind: "manim", sceneName: "Demo" });
  });

  it("reads voiceover configuration in a visual workspace", async () => {
    const runtime = services();
    runtime.workspaceModeRef.current = "visual";
    runtime.invoke = vi.fn().mockResolvedValue(true) as typeof runtime.invoke;
    const execute = createManimCapabilityExecutor(runtime, vi.fn());

    await expect(execute("get_voiceover_context", {}, new AbortController().signal)).resolves.toMatchObject({ configured: false, hasApiKey: true });
  });

  it("switches to a non-active scene before renaming its source", async () => {
    const runtime = services();
    const otherCode = code.replaceAll("Demo", "Other");
    runtime.documentsRef.current.push({ id: "other", name: "Other", code: otherCode });
    const executeCoreTool = vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("replace_code");
      expect(runtime.activeDocumentIdRef.current).toBe("other");
      runtime.sourceCodeRef.current = String(args.code);
      return { ok: true, changed: true };
    });
    const execute = createManimCapabilityExecutor(runtime, executeCoreTool);

    await expect(execute("rename_scene", { sceneId: "other", name: "Renamed" }, new AbortController().signal)).resolves.toMatchObject({ renamed: true, id: "other", name: "Renamed" });

    expect(runtime.switchDocumentConsoleState).toHaveBeenCalledWith("scene", "other");
    expect(runtime.activeDocumentIdRef.current).toBe("other");
    expect(runtime.sourceCodeRef.current).toContain("class Renamed(Scene)");
    expect(runtime.documentsRef.current.find((document) => document.id === "scene")?.code).toBe(code);
  });

  it("submits voiceover insertion as a focused code edit", async () => {
    const runtime = services();
    runtime.ttsConfig.baseUrl = "https://example.com";
    runtime.ttsApiKey = "key";
    const executeCoreTool = vi.fn().mockResolvedValue({ ok: true, changed: true });
    const execute = createManimCapabilityExecutor(runtime, executeCoreTool);

    await execute("add_voiceover", { anchorText: "        pass", text: "你好", placement: "before" }, new AbortController().signal);

    expect(executeCoreTool).toHaveBeenCalledWith("edit_code", expect.objectContaining({ edits: [expect.objectContaining({ oldText: "        pass" })] }), expect.any(AbortSignal));
    const editArgs = executeCoreTool.mock.calls[0][1] as { edits: Array<{ oldText: string; newText: string }> };
    expect(applyExactCodeEdits(code, editArgs.edits)).toContain("visual-python-voiceover");
  });
});
