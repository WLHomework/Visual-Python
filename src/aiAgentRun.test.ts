import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ streamAiChat: vi.fn() }));

vi.mock("./aiConfig", () => ({ streamAiChat: mocks.streamAiChat }));

import { routeAiAgentRequest, runAiCodeAgent, type AiAgentRouteDecision } from "./aiAgent";

const completion = (
  content = "",
  toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [],
  promptTokens = 100,
  completionTokens = 20,
) => ({ content, toolCalls, model: "test", promptTokens, completionTokens, totalTokens: promptTokens + completionTokens });

const route = (decision: AiAgentRouteDecision) => completion("", [{
  id: "route-1",
  type: "function",
  function: { name: "route_request", arguments: JSON.stringify(decision) },
}], 40, 10);

const toolCompletion = (id: string, name: string, args: Record<string, unknown> = {}) => completion("", [{
  id,
  type: "function",
  function: { name, arguments: JSON.stringify(args) },
}]);

const executeRoute = (overrides: Partial<AiAgentRouteDecision> = {}): AiAgentRouteDecision => ({
  intent: "execute",
  requiredActions: ["mutation"],
  allowRun: false,
  renderPolicy: "auto",
  allowWholeFileRewrite: false,
  allowClarification: false,
  response: "",
  ...overrides,
});

const run = (
  prompt: string,
  executeTool = vi.fn().mockResolvedValue({}),
  getSnapshot: () => Record<string, unknown> = () => ({ code: "from manim import *\nclass Demo(Scene):\n    def construct(self):\n        pass\n" }),
) => runAiCodeAgent({
  prompt,
  agentMode: "agent",
  host: {
    executeTool,
    getSnapshot,
    getLineCount: () => 4,
    previewCode: vi.fn(),
    cancelCodePreview: vi.fn(),
  },
  onActivity: vi.fn(),
  onProgress: vi.fn(),
  permissionMode: "auto",
  onPermissionRequest: vi.fn().mockResolvedValue(true),
  signal: new AbortController().signal,
});

describe("AI code agent semantic routing", () => {
  beforeEach(() => mocks.streamAiChat.mockReset());

  it("answers ordinary conversation without exposing project tools", async () => {
    mocks.streamAiChat.mockResolvedValueOnce(route({
      intent: "chat",
      requiredActions: [],
      allowRun: false,
      renderPolicy: "forbid",
      allowWholeFileRewrite: false,
      allowClarification: false,
      response: "你好，我可以帮助你处理 Manim 项目。",
    }));
    const executeTool = vi.fn();

    const result = await run("你好，你能做什么？", executeTool);

    expect(mocks.streamAiChat).toHaveBeenCalledTimes(1);
    expect(mocks.streamAiChat.mock.calls[0][2].tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual(["route_request"]);
    expect(executeTool).not.toHaveBeenCalled();
    expect(result).toMatchObject({ intent: "chat", summary: "你好，我可以帮助你处理 Manim 项目。", toolCallCount: 0 });
  });

  it("keeps project analysis read-only", async () => {
    mocks.streamAiChat
      .mockResolvedValueOnce(route({
        intent: "inspect", requiredActions: [], allowRun: false, renderPolicy: "forbid",
        allowWholeFileRewrite: false, allowClarification: false, response: "",
      }))
      .mockResolvedValueOnce(completion("标签位于原点附近，因为锚点使用了 c2p(0, 0)。"));
    const executeTool = vi.fn();

    const result = await run("为什么 x 和 y 会跑到原点附近？", executeTool);

    const names = mocks.streamAiChat.mock.calls[1][2].tools.map((tool: { function: { name: string } }) => tool.function.name);
    expect(names).toContain("get_context");
    expect(names).not.toContain("edit_code");
    expect(names).not.toContain("render_manim");
    expect(executeTool).not.toHaveBeenCalled();
    expect(result.intent).toBe("inspect");
  });

  it("executes an arbitrary natural-language correction and preserves automatic checks", async () => {
    const originalCode = "from manim import *\nclass Demo(Scene):\n    def construct(self):\n        x_label.next_to(axes.c2p(0, 0), DOWN)\n";
    let currentCode = originalCode;
    mocks.streamAiChat
      .mockResolvedValueOnce(route(executeRoute()))
      .mockResolvedValueOnce(completion("", [{
        id: "edit-1",
        type: "function",
        function: {
          name: "edit_code",
          arguments: JSON.stringify({
            summary: "校正标签锚点",
            edits: [{ oldText: "axes.c2p(0, 0)", newText: "axes.x_axis.get_end()" }],
          }),
        },
      }]))
      .mockResolvedValueOnce(completion("轴标签已经定位到对应轴端，并通过检查。"));
    const executeTool = vi.fn(async (name: string) => {
      if (name === "edit_code") {
        currentCode = originalCode.replace("axes.c2p(0, 0)", "axes.x_axis.get_end()");
        return { changed: true, diff: "+ axes.x_axis.get_end()" };
      }
      if (name === "check_code") return { valid: true };
      if (name === "validate_scene") return { valid: true };
      throw new Error(`unexpected tool: ${name}`);
    });

    const result = await run("右边那两个标记还挤在中心，替我处理好。", executeTool, () => ({ code: currentCode }));

    expect(mocks.streamAiChat).toHaveBeenCalledTimes(3);
    expect(mocks.streamAiChat.mock.calls[1][2].tools.some((tool: { function: { name: string } }) => tool.function.name === "edit_code")).toBe(true);
    expect(executeTool.mock.calls.map(([name]) => name)).toEqual(["edit_code", "check_code", "validate_scene"]);
    expect(result.intent).toBe("execute");
    expect(result.toolCallCount).toBe(3);
    expect(result.tokenUsage?.requests).toBe(3);
  });

  it("does not accept a claimed fix when the semantic route requires a real mutation", async () => {
    mocks.streamAiChat
      .mockResolvedValueOnce(route(executeRoute()))
      .mockResolvedValue(completion("已经修复并通过检查。"));
    const executeTool = vi.fn();

    await expect(run("这部分成果和我的目标不一致，请纠正。", executeTool)).rejects.toThrow("必要操作：实际修改代码或工程");
    expect(executeTool).not.toHaveBeenCalled();
    expect(mocks.streamAiChat).toHaveBeenCalledTimes(4);
  });

  it("does not count a successful no-op edit as a real mutation", async () => {
    mocks.streamAiChat
      .mockResolvedValueOnce(route(executeRoute()))
      .mockResolvedValueOnce(completion("", [{
        id: "edit-noop",
        type: "function",
        function: { name: "edit_code", arguments: JSON.stringify({ edits: [{ oldText: "pass", newText: "pass" }] }) },
      }]))
      .mockResolvedValue(completion("修改已完成。"));
    const executeTool = vi.fn(async (name: string) => {
      if (name === "edit_code") return { changed: false };
      if (name === "check_code" || name === "validate_scene") return { valid: true };
      throw new Error(`unexpected tool: ${name}`);
    });

    await expect(run("把当前效果调整到正确状态。", executeTool)).rejects.toThrow("必要操作：实际修改代码或工程");
    expect(executeTool.mock.calls.map(([name]) => name)).toEqual(["edit_code", "check_code", "validate_scene"]);
  });

  it("uses JSON routing when the provider rejects Function Calling", async () => {
    const fallbackDecision = {
      intent: "chat",
      requiredActions: [],
      allowRun: false,
      renderPolicy: "forbid",
      allowWholeFileRewrite: false,
      allowClarification: false,
      response: "兼容模式回复",
    };
    mocks.streamAiChat
      .mockRejectedValueOnce(new Error("HTTP 400: unknown parameter tools"))
      .mockResolvedValueOnce(completion(JSON.stringify(fallbackDecision), [], 30, 10));

    const result = await routeAiAgentRequest({
      prompt: "你好",
      signal: new AbortController().signal,
    });

    expect(result.decision).toEqual(fallbackDecision);
    expect(result.nativeFunctionCalling).toBe(false);
    expect(result.tokenUsage).toEqual({ prompt: 30, completion: 10, total: 40, requests: 1 });
    expect(mocks.streamAiChat.mock.calls[1][2].tools).toBeUndefined();
  });

  it("continues the main agent in JSON mode after route compatibility fallback", async () => {
    let currentCode = "from manim import *\nclass Demo(Scene):\n    def construct(self):\n        pass\n";
    mocks.streamAiChat
      .mockRejectedValueOnce(new Error("HTTP 400: unsupported tools"))
      .mockResolvedValueOnce(completion(JSON.stringify(executeRoute()), [], 30, 10))
      .mockResolvedValueOnce(completion(JSON.stringify({
        message: "正在修改",
        tool: { name: "edit_code", arguments: { edits: [{ oldText: "        pass", newText: "        self.add(Dot())" }] } },
      })))
      .mockResolvedValueOnce(completion(JSON.stringify({ final: "圆点已经添加并通过检查。" })));
    const executeTool = vi.fn(async (name: string) => {
      if (name === "edit_code") {
        currentCode = currentCode.replace("        pass", "        self.add(Dot())");
        return { changed: true };
      }
      if (name === "check_code" || name === "validate_scene") return { valid: true };
      throw new Error(`unexpected tool: ${name}`);
    });

    const result = await run("让当前场景中出现一个点。", executeTool, () => ({ code: currentCode }));

    expect(mocks.streamAiChat.mock.calls[2][2].tools).toBeUndefined();
    expect(executeTool.mock.calls.map(([name]) => name)).toEqual(["edit_code", "check_code", "validate_scene"]);
    expect(result.summary).toBe("圆点已经添加并通过检查。");
  });

  it("streams an ordinary chat response while the routing tool arguments arrive", async () => {
    const decision: AiAgentRouteDecision = {
      intent: "chat",
      requiredActions: [],
      allowRun: false,
      renderPolicy: "forbid",
      allowWholeFileRewrite: false,
      allowClarification: false,
      response: "这是一条流式回复。",
    };
    mocks.streamAiChat.mockImplementationOnce(async (_messages, _onDelta, options) => {
      const serialized = JSON.stringify(decision);
      options.onToolCallDelta?.({ index: 0, name: "route_request", delta: serialized.slice(0, 80) });
      options.onToolCallDelta?.({ index: 0, name: "", delta: serialized.slice(80) });
      return route(decision);
    });
    const onChatResponse = vi.fn();

    const result = await routeAiAgentRequest({
      prompt: "你好",
      signal: new AbortController().signal,
      onChatResponse,
    });

    expect(result.decision.response).toBe("这是一条流式回复。");
    expect(onChatResponse).toHaveBeenCalled();
    expect(onChatResponse.mock.calls.at(-1)?.[0]).toBe("这是一条流式回复。");
  });

  it("requires a Python run to reach and report its terminal state", async () => {
    mocks.streamAiChat
      .mockResolvedValueOnce(route(executeRoute({ requiredActions: ["run"] })))
      .mockResolvedValueOnce(toolCompletion("run-1", "run_project"))
      .mockResolvedValueOnce(toolCompletion("state-1", "get_execution_state"))
      .mockResolvedValueOnce(toolCompletion("state-2", "get_execution_state"))
      .mockResolvedValueOnce(toolCompletion("state-3", "get_execution_state"))
      .mockResolvedValueOnce(completion("运行已完成。"));
    let stateReads = 0;
    const executeTool = vi.fn(async (name: string) => {
      if (name === "run_project") return { started: true };
      if (name === "get_execution_state") {
        stateReads += 1;
        return stateReads < 3
          ? { running: true, output: [], problems: [] }
          : { running: false, output: [{ stream: "stdout", data: "done" }], problems: [] };
      }
      throw new Error(`unexpected tool: ${name}`);
    });

    const result = await run("运行当前 Python 项目并告诉我结果。", executeTool);

    expect(executeTool.mock.calls.map(([name]) => name)).toEqual([
      "run_project", "get_execution_state", "get_execution_state", "get_execution_state",
    ]);
    expect(result.intent).toBe("execute");
  });

  it("does not accept starting Python without reading the terminal state", async () => {
    mocks.streamAiChat
      .mockResolvedValueOnce(route(executeRoute({ requiredActions: ["run"] })))
      .mockResolvedValueOnce(toolCompletion("run-1", "run_project"))
      .mockResolvedValue(completion("运行已完成。"));
    const executeTool = vi.fn(async (name: string) => name === "run_project" ? { started: true } : {});

    await expect(run("运行当前 Python 项目。", executeTool)).rejects.toThrow("运行 Python 并读取最终结果");
  });

  it("allows the same revision to render again after a failed render", async () => {
    mocks.streamAiChat
      .mockResolvedValueOnce(route(executeRoute({ requiredActions: ["render"] })))
      .mockResolvedValueOnce(toolCompletion("render-1", "render_manim"))
      .mockResolvedValueOnce(toolCompletion("render-state-1", "get_execution_state"))
      .mockResolvedValueOnce(toolCompletion("render-2", "render_manim"))
      .mockResolvedValueOnce(toolCompletion("render-state-2", "get_execution_state"))
      .mockResolvedValueOnce(toolCompletion("inspect-1", "inspect_rendered_output"))
      .mockResolvedValueOnce(completion("渲染结果已检查。"));
    let stateReads = 0;
    const executeTool = vi.fn(async (name: string) => {
      if (name === "render_manim") return { started: true };
      if (name === "get_execution_state") {
        stateReads += 1;
        return stateReads === 1
          ? { rendering: false, output: [], problems: [{ kind: "runtime", line: 3, message: "boom" }] }
          : { rendering: false, output: [], problems: [], renderOutput: { type: "video", scene: "Demo", path: "demo.mp4" } };
      }
      if (name === "inspect_rendered_output") return { valid: true };
      throw new Error(`unexpected tool: ${name}`);
    });

    const result = await run("渲染当前 Manim 场景，失败时修复或重试。", executeTool);

    expect(executeTool.mock.calls.map(([name]) => name)).toEqual([
      "render_manim", "get_execution_state", "render_manim", "get_execution_state", "inspect_rendered_output",
    ]);
    expect(result.intent).toBe("execute");
  });

  it("satisfies a scene switch through host evidence without changing code revision", async () => {
    mocks.streamAiChat
      .mockResolvedValueOnce(route(executeRoute({ requiredActions: ["switch_scene"] })))
      .mockResolvedValueOnce(toolCompletion("switch-1", "switch_scene", { sceneId: "scene-2" }))
      .mockResolvedValueOnce(completion("已切换场景。"));
    const executeTool = vi.fn(async (name: string) => name === "switch_scene" ? { switched: true } : {});

    const result = await run("切换到第二个场景。", executeTool);

    expect(executeTool).toHaveBeenCalledWith("switch_scene", { sceneId: "scene-2" }, expect.any(AbortSignal));
    expect(result.summary).toBe("已切换场景。");
  });
});
