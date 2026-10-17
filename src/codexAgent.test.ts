import { describe, expect, it, vi } from "vitest";
import { CodexAgentLoopGuardError, CodexAgentUnavailableError, runCodexVisualPythonAgent, type CodexAgentTransport } from "./codexAgent";
import type { CodexDynamicTool } from "./codexAgentClient";
import { saveCodexThread } from "./codexThreadStore";
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
  it("uses the Codex Thread for visual workspaces and provides the task block directory once", async () => {
    const host: AgentHost = {
      getSnapshot: () => ({ workspaceMode: "visual", blockWorkspace: { blockCount: 0 } }),
      getBlockCatalog: (task) => JSON.stringify({ task, categories: [{ name: "Python" }], candidates: [{ type: "python_print", label: "输出" }] }),
      getTools: () => [{
        definition: { type: "function", function: { name: "apply_block_plan", description: "Apply graphical block plan", parameters: { type: "object", properties: {} } } },
        label: "应用积木方案",
        workspaceModes: ["visual"],
        changesState: true,
      }],
      executeTool: vi.fn(),
    };
    const transport: CodexAgentTransport = {
      runTurn: vi.fn(async (prompt, options) => {
        expect(prompt).toContain("python_print");
        expect(options.dynamicTools?.map((tool: CodexDynamicTool) => tool.name)).toContain("apply_block_plan");
        expect(options.developerInstructions).toContain("graphical workspace");
        expect(options.developerInstructions).toContain("complete catalog");
        expect(options.developerInstructions).toContain("do not call get_task_block_directory or search_blocks");
        options.onEvent?.({ type: "textDelta", threadId: "thread-visual", turnId: "turn-visual", itemId: "message-visual", delta: "Done" });
        options.onEvent?.({ type: "turnCompleted", threadId: "thread-visual", turnId: "turn-visual", status: "completed" });
        return { threadId: "thread-visual", turnId: "turn-visual", status: "completed", resumed: false };
      }),
      respondToServerRequest: vi.fn(),
      rejectServerRequest: vi.fn(),
    };

    await expect(runCodexVisualPythonAgent(args(host, vi.fn()), transport)).resolves.toMatchObject({ summary: "Done" });
    expect(transport.runTurn).toHaveBeenCalledTimes(1);
  });

  it("keeps assistant text from every message item in the final summary", async () => {
    const host: AgentHost = {
      getSnapshot: () => ({ workspaceMode: "code" }),
      executeTool: vi.fn(),
    };
    const transport: CodexAgentTransport = {
      runTurn: vi.fn(async (_prompt, options) => {
        options.onEvent?.({ type: "textDelta", threadId: "thread-text", turnId: "turn-text", itemId: "message-before", delta: "先说明操作。" });
        options.onEvent?.({ type: "textDelta", threadId: "thread-text", turnId: "turn-text", itemId: "message-after", delta: "操作完成。" });
        options.onEvent?.({ type: "turnCompleted", threadId: "thread-text", turnId: "turn-text", status: "completed" });
        return { threadId: "thread-text", turnId: "turn-text", status: "completed", resumed: false };
      }),
      respondToServerRequest: vi.fn(),
      rejectServerRequest: vi.fn(),
    };

    await expect(runCodexVisualPythonAgent(args(host, vi.fn()), transport)).resolves.toMatchObject({
      summary: "先说明操作。\n\n操作完成。",
    });
  });

  it("does not report success when a tool fails and the turn completes", async () => {
    const failingTool: AgentTool = {
      definition: { type: "function", function: { name: "run_task", description: "执行任务", parameters: { type: "object", properties: {} } } },
      label: "执行任务",
    };
    const host: AgentHost = {
      getSnapshot: () => ({ workspaceMode: "code" }),
      getTools: () => [failingTool],
      executeTool: vi.fn().mockResolvedValue({ ok: false, error: "任务执行失败：输入无效" }),
    };
    const transport: CodexAgentTransport = {
      runTurn: vi.fn(async (_prompt, options) => {
        await options.onServerRequest?.({ id: 20, method: "item/tool/call", params: { callId: "failed-call", tool: "run_task", arguments: {} } });
        options.onEvent?.({ type: "turnCompleted", threadId: "thread-failure", turnId: "turn-failure", status: "completed" });
        return { threadId: "thread-failure", turnId: "turn-failure", status: "completed", resumed: false };
      }),
      respondToServerRequest: vi.fn(),
      rejectServerRequest: vi.fn(),
    };

    const failure = await runCodexVisualPythonAgent(args(host, vi.fn()), transport).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("任务执行失败：输入无效");
    expect((failure as Error).message).toContain("任务未完成");
  });

  it("refreshes and resends the task block directory when resuming a graphical thread", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    const config = { baseUrl: "https://api.openai.com/v1", model: "test-model" };
    saveCodexThread("visual-target", config, "thread-existing");
    const getBlockCatalog = vi.fn(() => JSON.stringify({ candidates: [{ type: "python_print" }] }));
    const host: AgentHost = {
      getSnapshot: () => ({ workspaceMode: "visual" }),
      getBlockCatalog,
      executeTool: vi.fn(),
    };
    const transport: CodexAgentTransport = {
      runTurn: vi.fn(async (prompt, options) => {
        expect(prompt).toContain("python_print");
        expect(options.conversationTargetId).toBe("visual-target");
        options.onEvent?.({ type: "textDelta", threadId: "thread-existing", turnId: "turn-2", itemId: "message-2", delta: "Continued" });
        options.onEvent?.({ type: "turnCompleted", threadId: "thread-existing", turnId: "turn-2", status: "completed" });
        return { threadId: "thread-existing", turnId: "turn-2", status: "completed", resumed: true };
      }),
      respondToServerRequest: vi.fn(),
      rejectServerRequest: vi.fn(),
    };

    await expect(runCodexVisualPythonAgent({ ...args(host, vi.fn()), conversationTargetId: "visual-target" }, transport)).resolves.toMatchObject({ summary: "Continued" });
    expect(getBlockCatalog).toHaveBeenCalledWith("修改当前代码");
    vi.unstubAllGlobals();
  });

  it("allows one broad block search when the task catalog was truncated", async () => {
    const host: AgentHost = {
      getSnapshot: () => ({ workspaceMode: "visual", blockWorkspace: { blockCount: 0 } }),
      getBlockCatalog: () => JSON.stringify({
        categories: [{ name: "Python", blockCount: 200 }],
        candidates: [{ type: "python_print", label: "杈撳嚭" }],
        omittedCandidateCount: 199,
      }),
      getTools: () => [],
      executeTool: vi.fn(),
    };
    const transport: CodexAgentTransport = {
      runTurn: vi.fn(async (_prompt, options) => {
        expect(options.developerInstructions).toContain("omittedCandidateCount");
        expect(options.developerInstructions).toContain("at most one broad search_blocks");
        expect(options.developerInstructions).not.toContain("do not call get_task_block_directory or search_blocks");
        options.onEvent?.({ type: "textDelta", threadId: "thread-truncated", turnId: "turn-truncated", itemId: "message-truncated", delta: "Done" });
        options.onEvent?.({ type: "turnCompleted", threadId: "thread-truncated", turnId: "turn-truncated", status: "completed" });
        return { threadId: "thread-truncated", turnId: "turn-truncated", status: "completed", resumed: false };
      }),
      respondToServerRequest: vi.fn(),
      rejectServerRequest: vi.fn(),
    };

    await expect(runCodexVisualPythonAgent(args(host, vi.fn()), transport)).resolves.toMatchObject({ summary: "Done" });
  });

  it("passes the actual compressed catalog state to Codex discovery instructions", async () => {
    const host: AgentHost = {
      getSnapshot: () => ({ workspaceMode: "visual", blockWorkspace: { blockCount: 0 } }),
      getBlockCatalog: () => JSON.stringify({
        categories: [{ name: "Python", blockCount: 80 }],
        candidates: Array.from({ length: 80 }, (_, index) => ({
          type: `python_block_${index}`,
          label: `积木 ${index}`,
          description: "用于当前任务的积木描述。".repeat(80),
        })),
      }),
      getTools: () => [],
      executeTool: vi.fn(),
    };
    const transport: CodexAgentTransport = {
      runTurn: vi.fn(async (_prompt, options) => {
        expect(options.developerInstructions).toContain("omittedCandidateCount");
        expect(options.developerInstructions).toContain("at most one broad search_blocks");
        expect(options.developerInstructions).not.toContain("do not call get_task_block_directory or search_blocks");
        options.onEvent?.({ type: "textDelta", threadId: "thread-compressed", turnId: "turn-compressed", itemId: "message-compressed", delta: "Done" });
        options.onEvent?.({ type: "turnCompleted", threadId: "thread-compressed", turnId: "turn-compressed", status: "completed" });
        return { threadId: "thread-compressed", turnId: "turn-compressed", status: "completed", resumed: false };
      }),
      respondToServerRequest: vi.fn(),
      rejectServerRequest: vi.fn(),
    };

    await expect(runCodexVisualPythonAgent(args(host, vi.fn()), transport)).resolves.toMatchObject({ summary: "Done" });
  });

  it("reuses an unchanged read result instead of executing the same host read repeatedly", async () => {
    const readTool: AgentTool = {
      definition: { type: "function", function: { name: "get_workspace", description: "读取工作区", parameters: { type: "object", properties: {} } } },
      label: "读取工作区",
      readOnly: true,
    };
    const executeTool = vi.fn().mockResolvedValue({ ok: true, blockCount: 8 });
    const host: AgentHost = { getSnapshot: () => ({ workspaceMode: "visual" }), getTools: () => [readTool], executeTool };
    const transport: CodexAgentTransport = {
      runTurn: vi.fn(async (_prompt, options) => {
        const request = (id: number) => options.onServerRequest?.({ id, method: "item/tool/call", params: { callId: `read-${id}`, tool: "get_workspace", arguments: {} } });
        await request(1);
        await request(2);
        options.onEvent?.({ type: "textDelta", threadId: "thread-1", turnId: "turn-1", itemId: "message-1", delta: "Done" });
        options.onEvent?.({ type: "turnCompleted", threadId: "thread-1", turnId: "turn-1", status: "completed" });
        return { threadId: "thread-1", turnId: "turn-1", status: "completed", resumed: false };
      }),
      respondToServerRequest: vi.fn(),
      rejectServerRequest: vi.fn(),
    };

    await runCodexVisualPythonAgent(args(host, vi.fn()), transport);

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(transport.respondToServerRequest).toHaveBeenCalledTimes(2);
    expect(transport.respondToServerRequest).toHaveBeenNthCalledWith(2, 2, expect.objectContaining({
      contentItems: [expect.objectContaining({ text: expect.stringContaining("stateUnchanged") })],
    }));
  });

  it("stops an identical failing tool loop with the concrete failure reason", async () => {
    const failingTool: AgentTool = {
      definition: { type: "function", function: { name: "apply_block_plan", description: "应用积木方案", parameters: { type: "object", properties: {} } } },
      label: "应用积木方案",
      changesState: true,
      mutation: true,
    };
    const host: AgentHost = {
      getSnapshot: () => ({ workspaceMode: "visual" }),
      getTools: () => [failingTool],
      executeTool: vi.fn().mockResolvedValue({ ok: false, error: "缺少 DO connection" }),
    };
    const transport: CodexAgentTransport = {
      runTurn: vi.fn(async (_prompt, options) => {
        for (let id = 1; id <= 3; id += 1) {
          await options.onServerRequest?.({ id, method: "item/tool/call", params: { callId: `plan-${id}`, tool: "apply_block_plan", arguments: { version: 1, mode: "append", operations: [] } } });
        }
        return { threadId: "thread-1", turnId: "turn-1", status: "completed", resumed: false };
      }),
      respondToServerRequest: vi.fn(),
      rejectServerRequest: vi.fn(),
    };

    const failure = await runCodexVisualPythonAgent(args(host, vi.fn()), transport).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(CodexAgentLoopGuardError);
    expect((failure as Error).message).toContain("缺少 DO connection");
    expect((failure as Error).message).toContain("连续失败 3 次");
    expect(host.executeTool).toHaveBeenCalledTimes(3);
  });

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
