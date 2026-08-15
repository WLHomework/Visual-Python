import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ streamAiChat: vi.fn() }));

vi.mock("./aiConfig", () => ({ streamAiChat: mocks.streamAiChat }));

import { normalizeAiToolCalls, parseTextToolCalls, runVisualPythonAgent, type AgentActivityEvent, type AgentHost } from "./agentV2";
import type { AiChatMessage } from "./aiConfig";
import { coreAgentTools, requiresPermission } from "./agentV2/toolRegistry";
import { manimAgentTools } from "./plugins/builtin/manim/agentTools";

const toolCall = (id: string, name: string, args: Record<string, unknown> = {}) => ({
  id,
  type: "function" as const,
  function: { name, arguments: JSON.stringify(args) },
});

const completion = (content = "", toolCalls: ReturnType<typeof toolCall>[] = [], truncated = false) => ({
  content,
  toolCalls,
  truncated,
  model: "test-model",
  promptTokens: 10,
  completionTokens: 5,
  totalTokens: 15,
  cachedTokens: 8,
});

function createHost(overrides: Partial<AgentHost> = {}): AgentHost {
  return {
    getSnapshot: () => ({ code: "class Demo: pass", scene: "Demo" }),
    getTools: () => manimAgentTools,
    executeTool: vi.fn().mockResolvedValue({ ok: true, changed: true }),
    observeExecution: vi.fn().mockResolvedValue({ running: false, rendering: false, problems: [] }),
    ...overrides,
  };
}

describe("Visual Python Agent v2", () => {
  beforeEach(() => mocks.streamAiChat.mockReset());

  it("keeps plugin-specific Manim tools out of the core tool set", () => {
    expect(coreAgentTools.some((tool) => ["validate_scene", "render_manim", "get_voiceover_context"].includes(tool.definition.function.name))).toBe(false);
  });

  it("uses the host confirmation as the only confirmation for explicit rendering", () => {
    const renderTool = manimAgentTools.find((tool) => tool.definition.function.name === "render_manim")?.definition;
    expect(renderTool?.function.description).toContain("不要先用 ask_user 询问是否渲染");
  });

  it("exposes generic document tools alongside plugin capabilities", async () => {
    mocks.streamAiChat.mockImplementationOnce(async (messages, onDelta, options) => {
      const system = (messages as AiChatMessage[]).find((message) => message.role === "system")?.content || "";
      expect(system).toContain("Sample Plugin");
      expect(system).toContain("sample.inspect");
      expect(system).toContain(".sample");
      expect(system).toContain("content");
      expect((options.tools as Array<{ function: { name: string } }>).some((tool) => tool.function.name === "switch_document")).toBe(true);
      onDelta("已读取当前项目。");
      return completion("已读取当前项目。");
    });

    await runVisualPythonAgent({
      prompt: "查看当前项目",
      host: createHost({
        getCapabilities: () => [{ id: "sample", name: "Sample Plugin", description: "处理示例文档", tools: ["sample.inspect"], fileTypes: [".sample"], detect: "content" }],
      }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });
  });

  it("parses DSML tool calls into the normal function-call shape", () => {
    const calls = parseTextToolCalls([
      "<|DSML|tool_calls>",
      "<|DSML|invoke name=\"get_context\">",
      "<|DSML|parameter name=\"includeResources\" string=\"false\">true",
      "<|DSML|tool_calls>",
    ].join("\n"));

    expect(calls).toEqual([expect.objectContaining({
      id: "compat-0",
      function: { name: "get_context", arguments: '{"includeResources":true}' },
    })]);
  });

  it("assigns unique fallback IDs to empty or duplicate tool call IDs", () => {
    const calls = normalizeAiToolCalls([
      toolCall("same", "get_context"),
      toolCall("same", "get_scene"),
      toolCall("", "check_code"),
    ]);

    expect(calls.map((call) => call.id)).toEqual(["same", "same-2", "compat-2"]);
  });

  it("uses one decision loop without a separate router and exposes reasoning as an event", async () => {
    mocks.streamAiChat
      .mockImplementationOnce(async (_messages, onDelta, options) => {
        options.onReasoningDelta?.("先读取当前场景，再执行用户要求。\n");
        onDelta("我先确认当前场景。\n\n");
        return completion("我先确认当前场景。\n\n", [toolCall("1", "get_context")]);
      })
      .mockImplementationOnce(async (_messages, onDelta, options) => {
        options.onReasoningDelta?.("已获得真实状态，开始修改。\n");
        onDelta("已完成修改。");
        return completion("已完成修改。");
      });

    const events: AgentActivityEvent[] = [];
    const result = await runVisualPythonAgent({
      prompt: "添加一个圆，不要渲染。",
      host: createHost(),
      onEvent: (event) => events.push(event),
      signal: new AbortController().signal,
    });

    expect(mocks.streamAiChat).toHaveBeenCalledTimes(2);
    expect(mocks.streamAiChat.mock.calls[0][2]).toEqual(expect.objectContaining({ maxTokens: 8_192 }));
    expect((mocks.streamAiChat.mock.calls[0][2].tools as Array<{ function: { name: string } }>).some((tool) => tool.function.name === "save_project")).toBe(true);
    expect(events.some((event) => event.kind === "thinking" && event.status === "done")).toBe(true);
    expect(events.some((event) => event.kind === "tool" && event.toolName === "get_context")).toBe(true);
    expect(events.some((event) => event.kind === "decision")).toBe(false);
    const toolEvents = events.filter((event) => event.kind === "tool" && event.toolName === "get_context");
    expect(toolEvents.at(-1)?.title).not.toMatch(/^(执行：|已执行：)/);
    expect(toolEvents.at(-1)?.detail).toBeUndefined();
    expect(events.at(-1)).toMatchObject({ kind: "message", status: "done" });
    expect(result.summary).toContain("已完成修改");
  });

  it("keeps the initial request as an exact prefix while omitting full mutation snapshots", async () => {
    const initialCode = `class Demo:\n    ${"pass\n    ".repeat(500)}`;
    const changedCode = initialCode.replace("pass", "self.add(Circle())");
    const executeTool = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        changed: true,
        diff: "@@ 第 2 行 @@\n- pass\n+ self.add(Circle())",
        __codeChange: { before: initialCode, after: changedCode },
      })
      .mockResolvedValueOnce({ valid: true });
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [toolCall("edit-1", "edit_code", { edits: [{ oldText: "pass", newText: "self.add(Circle())" }] })]))
      .mockResolvedValueOnce(completion("已完成"));

    await runVisualPythonAgent({
      prompt: "添加一个圆",
      host: createHost({ getSnapshot: () => ({ code: initialCode, lineCount: 501 }), executeTool }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    const firstRequest = JSON.stringify(mocks.streamAiChat.mock.calls[0][0]);
    const secondRequest = JSON.stringify(mocks.streamAiChat.mock.calls[1][0]);
    expect(firstRequest).toContain("class Demo");
    const firstMessages = mocks.streamAiChat.mock.calls[0][0];
    const secondMessages = mocks.streamAiChat.mock.calls[1][0];
    expect(secondMessages.slice(0, firstMessages.length)).toEqual(firstMessages);
    expect(secondMessages.filter((message: { content?: string }) => message.content?.includes("class Demo"))).toHaveLength(1);
    expect(secondRequest).not.toContain("\"before\"");
    expect(secondRequest).toContain("self.add(Circle())");
  });

  it("keeps every later tool round append-only", async () => {
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [toolCall("context-1", "get_context", { includeResources: false })]))
      .mockResolvedValueOnce(completion("", [toolCall("context-2", "get_context", { includeResources: true })]))
      .mockResolvedValueOnce(completion("", [toolCall("context-3", "get_context", { includeResources: false })]))
      .mockResolvedValueOnce(completion("读取完成"));

    await runVisualPythonAgent({
      prompt: "读取工程状态",
      host: createHost(),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    const requests = mocks.streamAiChat.mock.calls.map(([messages]) => messages as unknown[]);
    for (let index = 1; index < requests.length; index += 1) {
      expect(requests[index].slice(0, requests[index - 1].length)).toEqual(requests[index - 1]);
    }
  });

  it("reports context and tool payload telemetry with provider token usage", async () => {
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [toolCall("context-1", "get_context")]))
      .mockResolvedValueOnce(completion("完成"));

    const result = await runVisualPythonAgent({
      prompt: "读取工程",
      host: createHost(),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    expect(result.tokenUsage).toEqual(expect.objectContaining({
      prompt: 20,
      completion: 10,
      total: 30,
      requests: 2,
      rounds: 2,
      inputCharacters: expect.any(Number),
      toolSchemaCharacters: expect.any(Number),
      toolResultCharacters: expect.any(Number),
      cached: 16,
      uncachedPrompt: 4,
      cacheHitRate: 0.8,
    }));
    expect(result.tokenUsage.inputCharacters).toBeGreaterThan(0);
    expect(result.tokenUsage.toolSchemaCharacters).toBeGreaterThan(0);
    expect(result.tokenUsage.toolResultCharacters).toBeGreaterThan(0);
  });

  it("keeps the task tool schema byte-for-byte stable across rounds", async () => {
    const executeTool = vi.fn()
      .mockResolvedValueOnce({ ok: true, changed: true, diff: "- pass\n+ self.add(Circle())" })
      .mockResolvedValueOnce({ valid: true });
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [toolCall("edit-1", "edit_code", { edits: [{ oldText: "pass", newText: "self.add(Circle())" }] })]))
      .mockResolvedValueOnce(completion("完成"));

    await runVisualPythonAgent({
      prompt: "添加一个圆",
      host: createHost({ executeTool }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    const firstTools = mocks.streamAiChat.mock.calls[0][2].tools as Array<{ function: { name: string } }>;
    const secondTools = mocks.streamAiChat.mock.calls[1][2].tools as Array<{ function: { name: string } }>;
    expect(secondTools).toEqual(firstTools);
    expect(secondTools.some((tool) => tool.function.name === "check_code")).toBe(true);
    expect(secondTools.some((tool) => tool.function.name === "render_manim")).toBe(true);
    expect(secondTools.some((tool) => tool.function.name === "activate_tool_group")).toBe(false);
    expect(secondTools.some((tool) => tool.function.name === "install_dependencies")).toBe(true);
  });

  it("keeps the reusable system and tool prefix stable across different tasks", async () => {
    mocks.streamAiChat.mockResolvedValue(completion("完成"));
    await runVisualPythonAgent({ prompt: "添加一个圆", host: createHost(), onEvent: () => undefined, signal: new AbortController().signal });
    await runVisualPythonAgent({ prompt: "创建一个坐标轴", host: createHost(), onEvent: () => undefined, signal: new AbortController().signal });

    const first = mocks.streamAiChat.mock.calls[0];
    const second = mocks.streamAiChat.mock.calls[1];
    expect(first[0][0]).toEqual(second[0][0]);
    expect(first[2].tools).toEqual(second[2].tools);
    expect(JSON.stringify(first[0][0]).length + JSON.stringify(first[2].tools).length).toBeGreaterThan(8_000);
  });

  it("calls specialized tools directly without an activation round", async () => {
    const executeTool = vi.fn()
      .mockResolvedValueOnce({ ok: true, changed: true, diff: "- pass\n+ self.add(Circle())" })
      .mockResolvedValueOnce({ valid: true })
      .mockResolvedValueOnce({ installed: true, packages: ["numpy"], verified: true });
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [toolCall("edit-1", "edit_code", { edits: [{ oldText: "pass", newText: "self.add(Circle())" }] })]))
      .mockResolvedValueOnce(completion("", [toolCall("install-1", "install_dependencies", { packages: ["numpy"] })]))
      .mockResolvedValueOnce(completion("完成"));

    await runVisualPythonAgent({
      prompt: "修改代码并处理依赖",
      host: createHost({ executeTool }),
      onPermissionRequest: vi.fn().mockResolvedValue(true),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    const secondTools = mocks.streamAiChat.mock.calls[1][2].tools as Array<{ function: { name: string } }>;
    expect(secondTools.some((tool) => tool.function.name === "install_dependencies")).toBe(true);
    expect(mocks.streamAiChat).toHaveBeenCalledTimes(3);
    expect(executeTool).not.toHaveBeenCalledWith("activate_tool_group", expect.anything(), expect.anything());
    expect(executeTool).toHaveBeenCalledWith("install_dependencies", { packages: ["numpy"] }, expect.any(AbortSignal));
  });

  it("continues a truncated response instead of failing the task immediately", async () => {
    mocks.streamAiChat
      .mockImplementationOnce(async (_messages, onDelta) => {
        onDelta("部分响应");
        return completion("", [], true);
      })
      .mockImplementationOnce(async (_messages, onDelta) => {
        onDelta("已完成");
        return completion();
      });

    const result = await runVisualPythonAgent({
      prompt: "继续完成任务",
      host: createHost(),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    expect(result.summary).toBe("已完成");
    expect(mocks.streamAiChat).toHaveBeenCalledTimes(2);
    const continuedMessages = mocks.streamAiChat.mock.calls[1][0] as Array<{ role: string; content?: string }>;
    expect(continuedMessages.at(-1)?.content).toContain("上一轮响应达到本轮输出上限");
  });

  it("does not execute an incomplete tool call from a truncated response", async () => {
    const incomplete = toolCall("truncated-call", "get_context");
    incomplete.function.arguments = "{\"includeResources\":";
    const executeTool = vi.fn();
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [incomplete], true))
      .mockResolvedValueOnce(completion("已继续完成"));

    await runVisualPythonAgent({
      prompt: "读取当前工程",
      host: createHost({ executeTool }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    expect(executeTool).not.toHaveBeenCalled();
    expect(mocks.streamAiChat).toHaveBeenCalledTimes(2);
  });

  it("requires confirmation for high-impact tools even in automatic mode", async () => {
    const coreHighImpactTools = ["install_dependencies", "run_project", "save_project"];
    expect(coreHighImpactTools.every((name) => requiresPermission(name))).toBe(true);
    expect(manimAgentTools.filter((tool) => ["delete_scene", "render_manim"].includes(tool.definition.function.name)).every((tool) => tool.requiresPermission)).toBe(true);

    const permissionRequest = vi.fn().mockResolvedValue(true);
    const executeTool = vi.fn().mockResolvedValue({ ok: true, started: true });
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [toolCall("1", "render_manim", { outputType: "video" })]))
      .mockImplementationOnce(async (_messages, onDelta) => {
        onDelta("已完成");
        return completion();
      });

    await runVisualPythonAgent({
      prompt: "渲染当前场景",
      permissionMode: "auto",
      onPermissionRequest: permissionRequest,
      host: createHost({ executeTool }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    expect(permissionRequest).toHaveBeenCalledWith(expect.objectContaining({ toolName: "render_manim" }));
    expect(executeTool).toHaveBeenCalledWith("render_manim", { outputType: "video" }, expect.any(AbortSignal));
  });

  it("does not execute a high-impact tool when the confirmation handler is unavailable", async () => {
    const executeTool = vi.fn().mockResolvedValue({ ok: true, started: true });
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [toolCall("1", "render_manim", { outputType: "video" })]))
      .mockResolvedValueOnce(completion("已拒绝执行"));

    await runVisualPythonAgent({
      prompt: "渲染当前场景",
      host: createHost({ executeTool }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    expect(executeTool).not.toHaveBeenCalled();
  });

  it("requests confirmation for each high-impact tool in one model turn", async () => {
    const permissionRequest = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const executeTool = vi.fn().mockResolvedValue({ ok: true, started: true });
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [
        toolCall("render-call", "render_manim", { outputType: "video" }),
        toolCall("run-call", "run_project"),
      ]))
      .mockResolvedValueOnce(completion("已完成允许的操作"));

    await runVisualPythonAgent({
      prompt: "渲染并运行当前工程",
      permissionMode: "auto",
      onPermissionRequest: permissionRequest,
      host: createHost({ executeTool }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    expect(permissionRequest.mock.calls.map(([request]) => request.toolName)).toEqual(["render_manim", "run_project"]);
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledWith("render_manim", { outputType: "video" }, expect.any(AbortSignal));
    const secondRequestMessages = mocks.streamAiChat.mock.calls[1][0] as Array<{ role: string; toolCallId?: string; toolCalls?: Array<{ id: string }> }>;
    const assistantToolCalls = secondRequestMessages.find((message) => message.role === "assistant" && message.toolCalls)?.toolCalls?.map((call) => call.id) || [];
    const toolResponses = secondRequestMessages.filter((message) => message.role === "tool").map((message) => message.toolCallId);
    expect(toolResponses).toEqual(assistantToolCalls);
  });

  it("keeps tool responses paired when one tool call fails", async () => {
    const executeTool = vi.fn()
      .mockRejectedValueOnce(new Error("读取失败"))
      .mockResolvedValueOnce({ ok: true, scene: "Demo" })
      .mockResolvedValueOnce({ ok: true, scene: "Demo" })
      .mockResolvedValueOnce({ ok: true, code: "当前代码" });
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [toolCall("context-call", "get_context"), toolCall("scene-call", "get_scene", { sceneId: "demo" })]))
      .mockResolvedValueOnce(completion("改用读取工具", [toolCall("scene-retry", "get_scene", { sceneId: "demo" })]))
      .mockResolvedValueOnce(completion("重新读取工程", [toolCall("context-retry", "get_context")]))
      .mockResolvedValueOnce(completion("已处理工具错误"));

    await runVisualPythonAgent({
      prompt: "读取当前工程和场景",
      host: createHost({ executeTool }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    const secondRequestMessages = mocks.streamAiChat.mock.calls[1][0] as Array<{ role: string; toolCallId?: string; toolCalls?: Array<{ id: string }> }>;
    const assistantToolCalls = secondRequestMessages.find((message) => message.role === "assistant" && message.toolCalls)?.toolCalls?.map((call) => call.id) || [];
    const toolResponses = secondRequestMessages.filter((message) => message.role === "tool").map((message) => message.toolCallId);
    expect(toolResponses).toEqual(assistantToolCalls);
  });

  it("passes a tool failure back to the model so it can choose a different action", async () => {
    const executeTool = vi.fn()
      .mockResolvedValueOnce({ valid: false, error: "代码存在语法错误" })
      .mockResolvedValueOnce({ ok: true, code: "当前代码" })
      .mockResolvedValueOnce({ valid: true });
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("先检查代码", [toolCall("check-1", "check_code")]))
      .mockResolvedValueOnce(completion("改用读取工具", [toolCall("context-1", "get_context")]))
      .mockResolvedValueOnce(completion("重新检查代码", [toolCall("check-2", "check_code")]))
      .mockResolvedValueOnce(completion("已取得结果"));

    await runVisualPythonAgent({
      prompt: "处理当前代码",
      host: createHost({ executeTool }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    expect(executeTool).toHaveBeenNthCalledWith(1, "check_code", {}, expect.any(AbortSignal));
    expect(executeTool).toHaveBeenNthCalledWith(2, "get_context", {}, expect.any(AbortSignal));
    expect(executeTool).toHaveBeenNthCalledWith(3, "check_code", {}, expect.any(AbortSignal));
    const secondRequestMessages = mocks.streamAiChat.mock.calls[1][0] as Array<{ role: string; content?: string }>;
    expect(secondRequestMessages.some((message) => message.role === "tool" && message.content?.includes("代码存在语法错误"))).toBe(true);
  });

  it("does not execute an identical failed tool call twice", async () => {
    const executeTool = vi.fn()
      .mockRejectedValueOnce(new Error("场景不存在"))
      .mockResolvedValueOnce({ ok: true, scene: "Other" });
    const repeatedCall = toolCall("scene-1", "get_scene", { sceneId: "missing" });
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("读取场景", [repeatedCall]))
      .mockResolvedValueOnce(completion("再次读取", [toolCall("scene-2", "get_scene", { sceneId: "missing" })]))
      .mockResolvedValueOnce(completion("调整场景", [toolCall("scene-3", "get_scene", { sceneId: "other" })]))
      .mockResolvedValueOnce(completion("任务结束"));

    await runVisualPythonAgent({
      prompt: "读取目标场景",
      host: createHost({ executeTool }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    expect(executeTool).toHaveBeenCalledTimes(2);
    const thirdRequestMessages = mocks.streamAiChat.mock.calls[2][0] as Array<{ role: string; content?: string }>;
    expect(thirdRequestMessages.some((message) => message.role === "tool" && message.content?.includes("请先调整参数或方案"))).toBe(true);
  });

  it("reuses an unchanged read result instead of executing the same tool again", async () => {
    const executeTool = vi.fn().mockResolvedValue({ ok: true, scene: "Demo", code: "x".repeat(10_000) });
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [toolCall("context-1", "get_context")]))
      .mockResolvedValueOnce(completion("", [toolCall("context-2", "get_context")]))
      .mockResolvedValueOnce(completion("读取完成"));

    await runVisualPythonAgent({
      prompt: "读取当前工程",
      host: createHost({ executeTool }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    expect(executeTool).toHaveBeenCalledTimes(1);
    const thirdRequest = mocks.streamAiChat.mock.calls[2][0] as Array<{ role: string; content?: string }>;
    const cachedToolMessage = thirdRequest.filter((message) => message.role === "tool").at(-1);
    expect(cachedToolMessage?.content).toContain("状态未变化");
    expect(cachedToolMessage?.content).not.toContain("x".repeat(200));
  });

  it("stops early when the model repeatedly reads the same unchanged state", async () => {
    const executeTool = vi.fn().mockResolvedValue({ ok: true, scene: "Demo" });
    mocks.streamAiChat.mockResolvedValue(completion("", [toolCall("context", "get_context")]));

    await expect(runVisualPythonAgent({
      prompt: "读取当前工程",
      host: createHost({ executeTool }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    })).rejects.toThrow("连续重复读取未变化的状态");

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(mocks.streamAiChat.mock.calls.length).toBeLessThan(12);
  });

  it("continues beyond the soft round budget while the task keeps making progress", async () => {
    const executeTool = vi.fn().mockResolvedValue({ ok: true, changed: true });
    let toolRounds = 0;
    mocks.streamAiChat.mockImplementation(async () => {
      if (toolRounds < 13) {
        toolRounds += 1;
        return completion("", [toolCall(`create-${toolRounds}`, "create_document", { name: `Document ${toolRounds}` })]);
      }
      return completion("long task completed");
    });

    const result = await runVisualPythonAgent({
      prompt: "连续创建十三个独立文档",
      host: createHost({ executeTool }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    expect(result.summary).toBe("任务已完成。");
    expect(executeTool).toHaveBeenCalledTimes(13);
    expect(mocks.streamAiChat).toHaveBeenCalledTimes(14);
  });

  it("invalidates cached reads after a code mutation", async () => {
    const executeTool = vi.fn()
      .mockResolvedValueOnce({ ok: true, code: "pass" })
      .mockResolvedValueOnce({ ok: true, changed: true, diff: "- pass\n+ self.add(Circle())" })
      .mockResolvedValueOnce({ valid: true })
      .mockResolvedValueOnce({ ok: true, code: "self.add(Circle())" });
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [toolCall("context-1", "get_context")]))
      .mockResolvedValueOnce(completion("", [toolCall("edit-1", "edit_code", { edits: [{ oldText: "pass", newText: "self.add(Circle())" }] })]))
      .mockResolvedValueOnce(completion("", [toolCall("context-2", "get_context")]))
      .mockResolvedValueOnce(completion("完成"));

    await runVisualPythonAgent({
      prompt: "修改并重新读取工程",
      host: createHost({ executeTool }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    expect(executeTool).toHaveBeenCalledTimes(4);
    expect(executeTool).toHaveBeenNthCalledWith(4, "get_context", {}, expect.any(AbortSignal));
  });

  it("allows one informed retry but blocks a third failed call in the same state", async () => {
    const executeTool = vi.fn()
      .mockRejectedValueOnce(new Error("场景不存在"))
      .mockResolvedValueOnce({ ok: true, scenes: [{ id: "other" }] })
      .mockRejectedValueOnce(new Error("场景仍不存在"))
      .mockResolvedValueOnce({ ok: true, scene: "Other" });
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [toolCall("scene-1", "get_scene", { sceneId: "missing" })]))
      .mockResolvedValueOnce(completion("", [toolCall("list-1", "list_scenes")]))
      .mockResolvedValueOnce(completion("", [toolCall("scene-2", "get_scene", { sceneId: "missing" })]))
      .mockResolvedValueOnce(completion("", [toolCall("list-2", "list_scenes")]))
      .mockResolvedValueOnce(completion("", [toolCall("scene-3", "get_scene", { sceneId: "missing" })]))
      .mockResolvedValueOnce(completion("", [toolCall("scene-4", "get_scene", { sceneId: "other" })]))
      .mockResolvedValueOnce(completion("完成"));

    await runVisualPythonAgent({
      prompt: "读取目标场景",
      host: createHost({ executeTool }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    expect(executeTool).toHaveBeenCalledTimes(4);
    expect(executeTool).toHaveBeenNthCalledWith(4, "get_scene", { sceneId: "other" }, expect.any(AbortSignal));
  });

  it("does not finish while a tool failure is still unresolved", async () => {
    const executeTool = vi.fn()
      .mockResolvedValueOnce({ valid: false, error: "代码存在语法错误" })
      .mockResolvedValueOnce({ ok: true, changed: true })
      .mockResolvedValueOnce({ valid: true });
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("检查代码", [toolCall("check-1", "check_code")]))
      .mockResolvedValueOnce(completion("检查未通过，但任务完成"))
      .mockResolvedValueOnce(completion("修复代码", [toolCall("edit-1", "edit_code", { edits: [{ oldText: "pass", newText: "return" }] })]))
      .mockResolvedValueOnce(completion("任务完成"));

    const result = await runVisualPythonAgent({
      prompt: "检查并处理当前代码",
      host: createHost({ executeTool }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    expect(result.summary).toBe("任务已完成。");
    expect(executeTool).toHaveBeenCalledTimes(3);
    expect(mocks.streamAiChat).toHaveBeenCalledTimes(4);
    const forcedContinuation = mocks.streamAiChat.mock.calls[2][0] as Array<{ role: string; content?: string }>;
    expect(forcedContinuation.some((message) => message.role === "user" && message.content?.includes("不能结束任务"))).toBe(true);
  });

  it("treats whitespace-only tool arguments as an empty object", async () => {
    const call = toolCall("empty-args", "get_context");
    call.function.arguments = "   ";
    const executeTool = vi.fn().mockResolvedValue({ ok: true });
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [call]))
      .mockResolvedValueOnce(completion("已读取"));

    await runVisualPythonAgent({
      prompt: "读取当前工程",
      host: createHost({ executeTool }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    expect(executeTool).toHaveBeenCalledWith("get_context", {}, expect.any(AbortSignal));
  });

  it("returns a paired tool error when the model sends invalid JSON arguments", async () => {
    const call = toolCall("invalid-json", "get_context");
    call.function.arguments = "{\"includeResources\":";
    const executeTool = vi.fn();
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [call]))
      .mockResolvedValueOnce(completion("参数已修正"));

    await runVisualPythonAgent({
      prompt: "读取当前工程",
      host: createHost({ executeTool }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    expect(executeTool).not.toHaveBeenCalled();
    const secondRequestMessages = mocks.streamAiChat.mock.calls[1][0] as Array<{ role: string; toolCallId?: string; toolCalls?: Array<{ id: string }> }>;
    const assistantToolCalls = secondRequestMessages.find((message) => message.role === "assistant" && message.toolCalls)?.toolCalls?.map((call) => call.id) || [];
    const toolResponses = secondRequestMessages.filter((message) => message.role === "tool").map((message) => message.toolCallId);
    expect(toolResponses).toEqual(assistantToolCalls);
  });

  it("keeps the save schema stable but only executes saving when explicitly requested", async () => {
    mocks.streamAiChat.mockImplementationOnce(async (_messages, onDelta, options) => {
      onDelta("已保存");
      expect((options.tools as Array<{ function: { name: string } }>).some((tool) => tool.function.name === "save_project")).toBe(true);
      return completion();
    });

    await runVisualPythonAgent({
      prompt: "完成后保存工程",
      host: createHost(),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    const executeTool = vi.fn();
    mocks.streamAiChat
      .mockReset()
      .mockResolvedValueOnce(completion("", [toolCall("save-1", "save_project")]))
      .mockResolvedValueOnce(completion("没有保存工程"));
    await runVisualPythonAgent({
      prompt: "添加一个圆",
      host: createHost({ executeTool }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });
    expect(executeTool).not.toHaveBeenCalledWith("save_project", expect.anything(), expect.anything());
  });

  it("observes long-running work in the host without asking the model to poll", async () => {
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [toolCall("1", "render_manim", { outputType: "video" })]))
      .mockResolvedValueOnce(completion("渲染已完成。"));

    const observeExecution = vi.fn().mockResolvedValue({
      running: false,
      rendering: false,
      problems: [],
      renderOutput: { type: "video", scene: "Demo", path: "demo.mp4" },
    });
    const executeTool = vi.fn().mockResolvedValue({ ok: true, started: true });
    const events: AgentActivityEvent[] = [];

    await runVisualPythonAgent({
      prompt: "渲染当前场景。",
      onPermissionRequest: vi.fn().mockResolvedValue(true),
      host: createHost({ executeTool, observeExecution }),
      onEvent: (event) => events.push(event),
      signal: new AbortController().signal,
    });

    expect(executeTool).toHaveBeenCalledWith("render_manim", { outputType: "video" }, expect.any(AbortSignal));
    expect(observeExecution).toHaveBeenCalledTimes(1);
    expect(executeTool).not.toHaveBeenCalledWith("wait", expect.anything(), expect.anything());
    expect(events.some((event) => event.kind === "observation" && event.status === "running" && event.title === "渲染 Manim" && event.toolName === "render_manim")).toBe(true);
    expect(events.some((event) => event.kind === "verification" && event.status === "done" && event.title === "渲染 Manim 通过")).toBe(true);
    const secondRequestMessages = mocks.streamAiChat.mock.calls[1][0] as Array<{ role: string; toolCallId?: string; toolCalls?: Array<{ id: string }> }>;
    const assistantToolCalls = secondRequestMessages.find((message) => message.role === "assistant" && message.toolCalls)?.toolCalls?.map((call) => call.id) || [];
    const toolResponses = secondRequestMessages.filter((message) => message.role === "tool").map((message) => message.toolCallId);
    expect(toolResponses).toEqual(assistantToolCalls);
  });

  it("marks an invalid render inspection as a failed verification", async () => {
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [toolCall("1", "render_manim", { outputType: "video" })]))
      .mockResolvedValueOnce(completion("渲染结果需要处理"));

    const observeExecution = vi.fn().mockResolvedValue({
      running: false,
      rendering: false,
      problems: [],
      renderOutput: { type: "video", scene: "Demo", path: "demo.mp4" },
      inspection: { valid: false, warning: "输出画面疑似空白" },
    });
    const events: AgentActivityEvent[] = [];

    await runVisualPythonAgent({
      prompt: "渲染当前场景",
      onPermissionRequest: vi.fn().mockResolvedValue(true),
      host: createHost({ executeTool: vi.fn().mockResolvedValue({ ok: true, started: true }), observeExecution }),
      onEvent: (event) => events.push(event),
      signal: new AbortController().signal,
    });

    expect(events).toContainEqual(expect.objectContaining({
      kind: "verification",
      status: "error",
      title: "渲染 Manim 发现问题",
      detail: "输出画面疑似空白",
    }));
  });

  it("closes a running observation when host observation fails", async () => {
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [toolCall("1", "render_manim", { outputType: "video" })]))
      .mockResolvedValueOnce(completion("先读取工程", [toolCall("context-1", "get_context")]))
      .mockResolvedValueOnce(completion("重新渲染", [toolCall("render-2", "render_manim", { outputType: "video" })]))
      .mockResolvedValueOnce(completion("渲染失败，准备处理"));
    const events: AgentActivityEvent[] = [];

    await runVisualPythonAgent({
      prompt: "渲染当前场景",
      onPermissionRequest: vi.fn().mockResolvedValue(true),
      host: createHost({
        executeTool: vi.fn().mockResolvedValue({ ok: true, started: true }),
        observeExecution: vi.fn()
          .mockRejectedValueOnce(new Error("没有生成输出文件"))
          .mockResolvedValueOnce({ running: false, rendering: false, problems: [], renderOutput: { type: "video", scene: "Demo", path: "demo.mp4" } }),
      }),
      onEvent: (event) => events.push(event),
      signal: new AbortController().signal,
    });

    expect(events).toContainEqual(expect.objectContaining({
      kind: "observation",
      status: "error",
      title: "渲染 Manim 失败",
      detail: "没有生成输出文件",
    }));
  });

  it("marks a returned tool failure as an error activity", async () => {
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [toolCall("1", "check_code")]))
      .mockResolvedValueOnce(completion("先读取工程", [toolCall("context-1", "get_context")]))
      .mockResolvedValueOnce(completion("重新检查", [toolCall("check-2", "check_code")]))
      .mockResolvedValueOnce(completion("代码需要修复"));
    const events: AgentActivityEvent[] = [];
    const executeTool = vi.fn()
      .mockResolvedValueOnce({ valid: false, error: "语法错误" })
      .mockResolvedValueOnce({ ok: true, code: "当前代码" })
      .mockResolvedValueOnce({ valid: true });

    await runVisualPythonAgent({
      prompt: "检查当前代码",
      host: createHost({ executeTool }),
      onEvent: (event) => events.push(event),
      signal: new AbortController().signal,
    });

    expect(events).toContainEqual(expect.objectContaining({
      kind: "tool",
      toolName: "check_code",
      status: "error",
      detail: "失败",
    }));
  });

  it("automatically validates a code mutation in the host loop", async () => {
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [toolCall("1", "edit_code", { edits: [{ oldText: "pass", newText: "self.add(Circle())" }] })]))
      .mockResolvedValueOnce(completion("代码已修改并通过检查。"));
    const executeTool = vi.fn()
      .mockResolvedValueOnce({ ok: true, changed: true })
      .mockResolvedValueOnce({ ok: true, valid: true });
    const events: AgentActivityEvent[] = [];

    await runVisualPythonAgent({
      prompt: "在当前场景添加圆形。",
      host: createHost({ executeTool }),
      onEvent: (event) => events.push(event),
      signal: new AbortController().signal,
    });

    expect(executeTool).toHaveBeenNthCalledWith(2, "check_code", {}, expect.any(AbortSignal));
    const verification = events.find((event) => event.kind === "verification" && event.status === "done");
    expect(verification).toBeDefined();
    expect(verification?.detail).toBeUndefined();
    expect(events.some((event) => event.kind === "verification" && event.status === "running")).toBe(false);
    const secondRequestMessages = mocks.streamAiChat.mock.calls[1][0] as Array<{ role: string; toolCallId?: string; toolCalls?: Array<{ id: string }> }>;
    const assistantToolCalls = secondRequestMessages.find((message) => message.role === "assistant" && message.toolCalls)?.toolCalls?.map((call) => call.id) || [];
    const toolResponses = secondRequestMessages.filter((message) => message.role === "tool").map((message) => message.toolCallId);
    expect(toolResponses).toEqual(assistantToolCalls);
  });

  it("does not run the code-only validator after a transactional Blockly mutation", async () => {
    mocks.streamAiChat
      .mockResolvedValueOnce(completion("", [toolCall("1", "apply_workspace", { mode: "replace", blocks: [] })]))
      .mockResolvedValueOnce(completion("图形化工作区已修改。"));
    const executeTool = vi.fn().mockResolvedValue({ ok: true, changed: true, validated: true });

    await runVisualPythonAgent({
      prompt: "清空图形化工作区",
      host: createHost({
        getSnapshot: () => ({ workspaceMode: "visual" }),
        getTools: () => [{
          definition: {
            type: "function",
            function: {
              name: "apply_workspace",
              description: "事务性修改图形化工作区",
              parameters: { type: "object", properties: {} },
            },
          },
          label: "修改图形化工作区",
          workspaceModes: ["visual"],
          changesState: true,
          mutation: true,
        }],
        executeTool,
      }),
      onEvent: () => undefined,
      signal: new AbortController().signal,
    });

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledWith("apply_workspace", { mode: "replace", blocks: [] }, expect.any(AbortSignal));
    expect(executeTool).not.toHaveBeenCalledWith("check_code", {}, expect.any(AbortSignal));
  });

  it("returns a clarification as a first-class question event", async () => {
    mocks.streamAiChat.mockResolvedValueOnce(completion("", [toolCall("1", "ask_user", {
      question: "使用当前场景还是新建场景？",
      options: ["当前场景", "新建场景"],
    })]));

    const events: AgentActivityEvent[] = [];
    const result = await runVisualPythonAgent({
      prompt: "做一个圆形动画。",
      host: createHost(),
      onEvent: (event) => events.push(event),
      signal: new AbortController().signal,
    });

    expect(result.clarification).toEqual({ question: "使用当前场景还是新建场景？", options: ["当前场景", "新建场景"] });
    expect(events.at(-1)).toMatchObject({ kind: "question", status: "done" });

    expect(events).toContainEqual(expect.objectContaining({ kind: "tool", toolName: "ask_user", status: "done" }));
  });
});
