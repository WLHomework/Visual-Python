import { describe, expect, it, vi } from "vitest";
import { CodexAgentClient, mapCodexNotification, type CodexAgentInvoke } from "./codexAgentClient";

describe("CodexAgentClient", () => {
  it("extracts the real provider error and HTTP status from App Server notifications", () => {
    expect(mapCodexNotification({
      method: "error",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        error: {
          message: "Unsupported parameter: reasoning.effort",
          codexErrorInfo: { responseStreamConnectionFailed: { httpStatusCode: 400 } },
        },
        willRetry: false,
      },
    })).toEqual({
      type: "error",
      message: "Unsupported parameter: reasoning.effort",
      status: 400,
    });
  });

  it("reports a closed App Server when the event stream ends", async () => {
    const invokeMock = vi.fn(async <T>(command: string) => {
      if (command === "codex_agent_next_event") return null as T;
      throw new Error(`unexpected command ${command}`);
    });

    await expect(new CodexAgentClient(invokeMock as CodexAgentInvoke).nextEvent()).rejects.toThrow("运行时已关闭");
  });

  it("starts App Server with the Visual Python model config and streams one turn", async () => {
    const events: unknown[] = [
      { kind: "notification", notification: { method: "item/agentMessage/delta", params: { threadId: "thread-1", turnId: "turn-1", itemId: "message-1", delta: "完成" } } },
      { kind: "notification", notification: { method: "turn/completed", params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } } } },
    ];
    const invokeMock = vi.fn(async <T>(command: string, args?: Record<string, unknown>) => {
      if (command === "codex_agent_start") return undefined as T;
      if (command === "codex_agent_request") {
        const request = args?.request as { method: string };
        if (request.method === "thread/start") return { ok: true, result: { thread: { id: "thread-1" } } } as T;
        if (request.method === "turn/start") return { ok: true, result: { turn: { id: "turn-1", status: "inProgress" } } } as T;
      }
      if (command === "codex_agent_next_event") return events.shift() as T;
      throw new Error(`unexpected command ${command}`);
    });
    const client = new CodexAgentClient(invokeMock as CodexAgentInvoke);
    const streamed: string[] = [];

    const result = await client.runTurn("创建圆形", {
      config: { baseUrl: "https://example.com/v1", model: "example-model" },
      dynamicTools: [{ type: "function", name: "get_context", description: "读取上下文", inputSchema: { type: "object" } }],
      onEvent: (event) => { if (event.type === "textDelta") streamed.push(event.delta); },
    });

    expect(result).toMatchObject({ threadId: "thread-1", turnId: "turn-1", status: "completed" });
    expect(streamed).toEqual(["完成"]);
    expect(invokeMock).toHaveBeenCalledWith("codex_agent_start", { config: { baseUrl: "https://example.com/v1", model: "example-model" } });
    const threadStart = invokeMock.mock.calls.find((call) => call[0] === "codex_agent_request" && (call[1]?.request as { method?: string })?.method === "thread/start");
    expect((threadStart?.[1]?.request as { params: Record<string, unknown> }).params).toMatchObject({
      model: "example-model",
      modelProvider: "visual-python",
      sandbox: "read-only",
      approvalPolicy: "never",
      ephemeral: false,
      dynamicTools: [{ type: "function", name: "get_context", inputSchema: { type: "object" } }],
    });
  });

  it("resumes the persisted thread for the same conversation target", async () => {
    const storage = new Map<string, string>();
    const localStorageLike = {
      get length() { return storage.size; },
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      key: (index: number) => [...storage.keys()][index] ?? null,
    };
    vi.stubGlobal("localStorage", localStorageLike);
    const events = () => [{ kind: "notification", notification: { method: "turn/completed", params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } } } }];
    const calls: string[] = [];
    const invokeMock = vi.fn(async <T>(command: string, args?: Record<string, unknown>) => {
      if (command === "codex_agent_start") return undefined as T;
      if (command === "codex_agent_request") {
        const request = args?.request as { method: string };
        calls.push(request.method);
        if (request.method === "thread/start") return { ok: true, result: { thread: { id: "thread-1" } } } as T;
        if (request.method === "thread/resume") return { ok: true, result: { thread: { id: "thread-1" } } } as T;
        if (request.method === "turn/start") return { ok: true, result: { turn: { id: "turn-1", status: "inProgress" } } } as T;
      }
      if (command === "codex_agent_next_event") return events().shift() as T;
      throw new Error(`unexpected command ${command}`);
    });
    const client = new CodexAgentClient(invokeMock as CodexAgentInvoke);
    const options = {
      config: { baseUrl: "https://example.com/v1", model: "example-model" },
      conversationTargetId: "project-1:conversation-1",
    };

    await client.runTurn("first", options);
    await client.runTurn("second", options);

    expect(calls.filter((method) => method === "thread/start")).toHaveLength(1);
    expect(calls.filter((method) => method === "thread/resume")).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("starts a fresh thread when the dynamic tool set changes", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const calls: string[] = [];
    let currentThreadId = "";
    let currentTurnId = "";
    const invokeMock = vi.fn(async <T>(command: string, args?: Record<string, unknown>) => {
      if (command === "codex_agent_start") return undefined as T;
      if (command === "codex_agent_request") {
        const request = args?.request as { method: string };
        calls.push(request.method);
        if (request.method === "thread/start") {
          currentThreadId = `thread-${calls.filter((method) => method === "thread/start").length}`;
          return { ok: true, result: { thread: { id: currentThreadId } } } as T;
        }
        if (request.method === "thread/resume") return { ok: true, result: { thread: { id: "thread-1" } } } as T;
        if (request.method === "turn/start") {
          currentTurnId = `turn-${calls.filter((method) => method === "turn/start").length}`;
          return { ok: true, result: { turn: { id: currentTurnId, status: "inProgress" } } } as T;
        }
      }
      if (command === "codex_agent_next_event") return { kind: "notification", notification: { method: "turn/completed", params: { threadId: currentThreadId, turn: { id: currentTurnId, status: "completed" } } } } as T;
      throw new Error(`unexpected command ${command}`);
    });
    const client = new CodexAgentClient(invokeMock as CodexAgentInvoke);
    const options = {
      config: { baseUrl: "https://example.com/v1", model: "example-model" },
      conversationTargetId: "project-1:conversation-1",
    };

    await client.runTurn("first", { ...options, dynamicTools: [{ type: "function", name: "old_tool", description: "old", inputSchema: { type: "object" } }] });
    await client.runTurn("second", { ...options, dynamicTools: [{ type: "function", name: "new_tool", description: "new", inputSchema: { type: "object" } }] });

    expect(calls.filter((method) => method === "thread/start")).toHaveLength(2);
    expect(calls.filter((method) => method === "thread/resume")).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("interrupts the active turn when the user aborts", async () => {
    const controller = new AbortController();
    const invokeMock = vi.fn(async <T>(command: string, args?: Record<string, unknown>) => {
      if (command === "codex_agent_start") return undefined as T;
      if (command === "codex_agent_request") {
        const method = (args?.request as { method: string }).method;
        if (method === "thread/start") return { ok: true, result: { thread: { id: "thread-1" } } } as T;
        if (method === "turn/start") {
          queueMicrotask(() => controller.abort());
          return { ok: true, result: { turn: { id: "turn-1", status: "inProgress" } } } as T;
        }
        if (method === "turn/interrupt") return { ok: true, result: {} } as T;
      }
      if (command === "codex_agent_next_event") return await new Promise<T>(() => undefined);
      throw new Error(`unexpected command ${command}`);
    });

    await expect(new CodexAgentClient(invokeMock as CodexAgentInvoke).runTurn("停止测试", {
      config: { baseUrl: "https://example.com/v1", model: "example-model" },
      signal: controller.signal,
    })).rejects.toThrow("任务已停止");
    expect(invokeMock.mock.calls.filter((call) => call[0] === "codex_agent_request" && (call[1]?.request as { method?: string })?.method === "turn/interrupt")).toHaveLength(1);
  });

  it("rejects an unhandled server request instead of silently dropping it", async () => {
    const events: unknown[] = [
      { kind: "serverRequest", request: { id: 42, method: "item/tool/call", params: { tool: "unknown" } } },
    ];
    const invokeMock = vi.fn(async <T>(command: string, args?: Record<string, unknown>) => {
      if (command === "codex_agent_start") return undefined as T;
      if (command === "codex_agent_request") {
        const request = args?.request as { method: string };
        if (request.method === "thread/start") return { ok: true, result: { thread: { id: "thread-1" } } } as T;
        if (request.method === "turn/start") return { ok: true, result: { turn: { id: "turn-1", status: "inProgress" } } } as T;
      }
      if (command === "codex_agent_next_event") {
        const event = events.shift();
        if (event) return event as T;
        return { kind: "notification", notification: { method: "turn/completed", params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } } } } as T;
      }
      if (command === "codex_agent_reject_request") return undefined as T;
      throw new Error(`unexpected command ${command}`);
    });

    await expect(new CodexAgentClient(invokeMock as CodexAgentInvoke).runTurn("未处理请求", {
      config: { baseUrl: "https://example.com/v1", model: "example-model" },
    })).resolves.toMatchObject({ status: "completed" });
    expect(invokeMock).toHaveBeenCalledWith("codex_agent_reject_request", {
      requestId: 42,
      code: -32601,
      message: "客户端未提供动态工具请求处理器",
      data: null,
    });
  });

  it("ignores late stream events from a previous turn", async () => {
    const events: unknown[] = [
      { kind: "notification", notification: { method: "item/agentMessage/delta", params: { threadId: "old-thread", turnId: "old-turn", itemId: "old-message", delta: "旧回复" } } },
      { kind: "notification", notification: { method: "item/agentMessage/delta", params: { threadId: "thread-1", turnId: "turn-1", itemId: "message-1", delta: "当前回复" } } },
      { kind: "notification", notification: { method: "turn/completed", params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } } } },
    ];
    const invokeMock = vi.fn(async <T>(command: string, args?: Record<string, unknown>) => {
      if (command === "codex_agent_start") return undefined as T;
      if (command === "codex_agent_request") {
        const request = args?.request as { method: string };
        if (request.method === "thread/start") return { ok: true, result: { thread: { id: "thread-1" } } } as T;
        if (request.method === "turn/start") return { ok: true, result: { turn: { id: "turn-1", status: "inProgress" } } } as T;
      }
      if (command === "codex_agent_next_event") return events.shift() as T;
      throw new Error(`unexpected command ${command}`);
    });
    const streamed: string[] = [];

    await new CodexAgentClient(invokeMock as CodexAgentInvoke).runTurn("过滤旧事件", {
      config: { baseUrl: "https://example.com/v1", model: "example-model" },
      onEvent: (event) => { if (event.type === "textDelta") streamed.push(event.delta); },
    });

    expect(streamed).toEqual(["当前回复"]);
  });
});
