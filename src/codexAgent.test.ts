import { describe, expect, it, vi } from "vitest";
import { CodexAgentUnavailableError, runCodexVisualPythonAgent, type CodexAgentTransport } from "./codexAgent";
import type { AgentActivityEvent, AgentHost, AgentTool } from "./agentV2/types";

vi.mock("./aiConfig", async () => {
  const actual = await vi.importActual<typeof import("./aiConfig")>("./aiConfig");
  return {
    ...actual,
    getAiModelConfig: () => ({ baseUrl: "https://api.openai.com/v1", model: "test-model" }),
  };
});

const editTool: AgentTool = {
  definition: { type: "function", function: { name: "edit_code", description: "定点修改代码", parameters: { type: "object", properties: {} } } },
  label: "定点修改代码",
  changesState: true,
  mutation: true,
  verificationTool: "check_code",
};

function args(host: AgentHost, onEvent: (event: AgentActivityEvent) => void) {
  return {
    prompt: "修改当前代码",
    history: [],
    mode: "agent" as const,
    reasoningEffort: "high" as const,
    host,
    onEvent,
    onProgress: vi.fn(),
    onPermissionRequest: vi.fn().mockResolvedValue(true),
    signal: new AbortController().signal,
  };
}

describe("runCodexVisualPythonAgent", () => {
  it("executes a dynamic edit tool, reports the code change, and returns the response to Codex", async () => {
    const codeChange = { before: "x = 1", after: "x = 2", documentId: "doc-1", documentName: "示例" };
    const host: AgentHost = {
      getSnapshot: () => ({ workspaceMode: "code", code: "x = 1" }),
      getTools: () => [editTool],
      executeTool: vi.fn().mockResolvedValue({ ok: true, changed: true, __codeChange: codeChange }),
    };
    const responses: unknown[] = [];
    const transport: CodexAgentTransport = {
      runTurn: vi.fn(async (_prompt, options) => {
        await options.onServerRequest?.({ id: 7, method: "item/tool/call", params: { callId: "call-1", tool: "edit_code", arguments: { edits: [] } } });
        options.onEvent?.({ type: "textDelta", threadId: "thread-1", turnId: "turn-1", itemId: "message-1", delta: "已完成修改" });
        options.onEvent?.({ type: "turnCompleted", threadId: "thread-1", turnId: "turn-1", status: "completed" });
        return { threadId: "thread-1", turnId: "turn-1", status: "completed", resumed: false };
      }),
      respondToServerRequest: vi.fn(async (_id, result) => { responses.push(result); }),
      rejectServerRequest: vi.fn(),
    };
    const events: AgentActivityEvent[] = [];

    const result = await runCodexVisualPythonAgent(args(host, (event) => events.push(event)), transport);

    expect(host.executeTool).toHaveBeenCalledWith("edit_code", { edits: [] }, expect.any(AbortSignal));
    expect(host.executeTool).toHaveBeenCalledWith("check_code", {}, expect.any(AbortSignal));
    expect(responses[0]).toMatchObject({ success: true });
    expect(events.some((event) => event.toolName === "edit_code" && event.status === "done" && event.codeChange?.after === "x = 2")).toBe(true);
    expect(result.summary).toBe("已完成修改");
    expect(result.toolCallCount).toBe(1);
  });

  it("waits for long-running render observations before responding", async () => {
    const renderTool: AgentTool = {
      definition: { type: "function", function: { name: "render_scene", description: "渲染", parameters: { type: "object", properties: {} } } },
      label: "渲染场景",
      longRunning: true,
      requiresPermission: true,
    };
    const host: AgentHost = {
      getSnapshot: () => ({ workspaceMode: "code" }),
      getTools: () => [renderTool],
      executeTool: vi.fn().mockResolvedValue({ started: true }),
      observeExecution: vi.fn().mockResolvedValue({ rendering: false, problems: [], output: "rendered.mp4" }),
    };
    const transport: CodexAgentTransport = {
      runTurn: vi.fn(async (_prompt, options) => {
        await options.onServerRequest?.({ id: 8, method: "item/tool/call", params: { callId: "call-2", tool: "render_scene", arguments: {} } });
        options.onEvent?.({ type: "turnCompleted", threadId: "thread-1", turnId: "turn-1", status: "completed" });
        return { threadId: "thread-1", turnId: "turn-1", status: "completed", resumed: false };
      }),
      respondToServerRequest: vi.fn(),
      rejectServerRequest: vi.fn(),
    };

    await runCodexVisualPythonAgent(args(host, vi.fn()), transport);

    expect(host.observeExecution).toHaveBeenCalledWith("render_scene", expect.any(AbortSignal));
    expect(transport.respondToServerRequest).toHaveBeenCalledWith(8, expect.objectContaining({
      success: true,
      contentItems: [expect.objectContaining({ text: expect.stringContaining("rendered.mp4") })],
    }));
  });

  it("does not execute a protected tool when the user rejects permission", async () => {
    const protectedTool = { ...editTool, requiresPermission: true };
    const host: AgentHost = {
      getSnapshot: () => ({ workspaceMode: "code" }),
      getTools: () => [protectedTool],
      executeTool: vi.fn(),
    };
    const transport: CodexAgentTransport = {
      runTurn: vi.fn(async (_prompt, options) => {
        await options.onServerRequest?.({ id: 9, method: "item/tool/call", params: { callId: "call-3", tool: "edit_code", arguments: {} } });
        options.onEvent?.({ type: "turnCompleted", threadId: "thread-1", turnId: "turn-1", status: "completed" });
        return { threadId: "thread-1", turnId: "turn-1", status: "completed", resumed: false };
      }),
      respondToServerRequest: vi.fn(),
      rejectServerRequest: vi.fn(),
    };
    const runArgs = args(host, vi.fn());
    runArgs.onPermissionRequest = vi.fn().mockResolvedValue(false);

    await runCodexVisualPythonAgent(runArgs, transport);

    expect(host.executeTool).not.toHaveBeenCalled();
    expect(transport.respondToServerRequest).toHaveBeenCalledWith(9, expect.objectContaining({ success: false }));
  });

  it("forwards file mutations through the host adapter and verifies the result", async () => {
    const writeFileTool: AgentTool = {
      definition: { type: "function", function: { name: "write_project_file", description: "写入工程文件", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } } } } },
      label: "写入工程文件",
      changesState: true,
      mutation: true,
      verificationTool: "inspect_project",
    };
    const host: AgentHost = {
      getSnapshot: () => ({ workspaceMode: "code" }),
      getTools: () => [writeFileTool],
      executeTool: vi.fn()
        .mockResolvedValueOnce({ ok: true, changed: true, path: "plugin/index.ts" })
        .mockResolvedValueOnce({ ok: true, exists: true }),
    };
    const transport: CodexAgentTransport = {
      runTurn: vi.fn(async (_prompt, options) => {
        await options.onServerRequest?.({ id: 10, method: "item/tool/call", params: { callId: "call-file", tool: "write_project_file", arguments: { path: "plugin/index.ts", content: "export default {}" } } });
        options.onEvent?.({ type: "turnCompleted", threadId: "thread-1", turnId: "turn-1", status: "completed" });
        return { threadId: "thread-1", turnId: "turn-1", status: "completed", resumed: false };
      }),
      respondToServerRequest: vi.fn(),
      rejectServerRequest: vi.fn(),
    };

    await runCodexVisualPythonAgent(args(host, vi.fn()), transport);

    expect(host.executeTool).toHaveBeenNthCalledWith(1, "write_project_file", { path: "plugin/index.ts", content: "export default {}" }, expect.any(AbortSignal));
    expect(host.executeTool).toHaveBeenNthCalledWith(2, "inspect_project", {}, expect.any(AbortSignal));
    expect(transport.respondToServerRequest).toHaveBeenCalledWith(10, expect.objectContaining({ success: true }));
  });

  it("rejects native file and shell requests instead of bypassing the Visual Python host", async () => {
    const rejectServerRequest = vi.fn();
    const transport: CodexAgentTransport = {
      runTurn: vi.fn(async (_prompt, options) => {
        await options.onServerRequest?.({ id: 11, method: "item/commandExecution", params: { command: "type secret.txt" } });
        options.onEvent?.({ type: "turnCompleted", threadId: "thread-1", turnId: "turn-1", status: "completed" });
        return { threadId: "thread-1", turnId: "turn-1", status: "completed", resumed: false };
      }),
      respondToServerRequest: vi.fn(),
      rejectServerRequest,
    };

    await runCodexVisualPythonAgent(args({ getSnapshot: () => ({ workspaceMode: "code" }), executeTool: vi.fn() }, vi.fn()), transport);

    expect(rejectServerRequest).toHaveBeenCalledWith(11, expect.stringContaining("Visual Python"));
  });

  it("does not expose a partially executed turn as a protocol fallback", async () => {
    const host: AgentHost = {
      getSnapshot: () => ({ workspaceMode: "code" }),
      getTools: () => [{
        definition: { type: "function", function: { name: "get_context", description: "读取工程", parameters: { type: "object", properties: {} } } },
        label: "读取工程",
        readOnly: true,
      }],
      executeTool: vi.fn().mockResolvedValue({ ok: true, code: "class Demo: pass" }),
    };
    const transport: CodexAgentTransport = {
      runTurn: vi.fn(async (_prompt, options) => {
        await options.onServerRequest?.({ id: 12, method: "item/tool/call", params: { callId: "call-partial", tool: "get_context", arguments: {} } });
        throw new Error("App Server connection lost after tool execution");
      }),
      respondToServerRequest: vi.fn(),
      rejectServerRequest: vi.fn(),
    };

    const failure = await runCodexVisualPythonAgent(args(host, vi.fn()), transport).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(CodexAgentUnavailableError);
    expect((failure as Error).message).toContain("App Server connection lost after tool execution");
    expect(host.executeTool).toHaveBeenCalledTimes(1);
  });
});
