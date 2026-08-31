import { describe, expect, it, vi } from "vitest";
import { ChatCompletionsTransport, type AgentModelTransport } from "./agentTransport";
import { runAgentCore } from "./agentCore";
import type { AgentModelEvent } from "./agentEvents";

const mocks = vi.hoisted(() => ({ streamAiChat: vi.fn() }));

vi.mock("./aiConfig", async () => {
  const actual = await vi.importActual<typeof import("./aiConfig")>("./aiConfig");
  return { ...actual, streamAiChat: mocks.streamAiChat };
});

describe("Chat Completions Agent transport", () => {
  it("maps every streamed channel to the shared model event stream", async () => {
    mocks.streamAiChat.mockImplementation(async (_messages, onText, options) => {
      onText("完成");
      options.onReasoningDelta?.("先分析");
      options.onToolCallDelta?.({ index: 0, name: "edit_code", delta: "{}" });
      return { content: "完成", toolCalls: [], model: "test-model", totalTokens: 12 };
    });
    const events: AgentModelEvent[] = [];

    await new ChatCompletionsTransport().runTurn([], {
      maxTokens: 8192,
      reasoningEffort: "high",
      signal: new AbortController().signal,
      tools: [],
      onEvent: (event) => events.push(event),
    });

    expect(events).toEqual([
      { type: "textDelta", delta: "完成" },
      { type: "reasoningDelta", delta: "先分析" },
      { type: "toolCallDelta", index: 0, name: "edit_code", delta: "{}" },
      { type: "tokenUsage", inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 12 },
      { type: "turnCompleted", status: "completed" },
    ]);
  });

  it("forwards streamed text, reasoning, tool fragments, and request options", async () => {
    mocks.streamAiChat.mockImplementation(async (_messages, onText, options) => {
      onText("完成");
      options.onReasoningDelta?.("先分析");
      options.onToolCallDelta?.({ index: 0, name: "edit_code", delta: "{}" });
      return { content: "完成", toolCalls: [], model: "test-model", totalTokens: 12 };
    });
    const onEvent = vi.fn();
    const transport = new ChatCompletionsTransport();
    const tools = [{ type: "function" as const, function: { name: "edit_code", description: "edit", parameters: { type: "object" } } }];

    const result = await transport.runTurn([{ role: "user", content: "修改代码" }], {
      maxTokens: 8192,
      reasoningEffort: "high",
      signal: new AbortController().signal,
      tools,
      toolChoice: "auto",
      onEvent,
    });

    expect(result.model).toBe("test-model");
    expect(onEvent).toHaveBeenCalledWith({ type: "textDelta", delta: "完成" });
    expect(onEvent).toHaveBeenCalledWith({ type: "reasoningDelta", delta: "先分析" });
    expect(onEvent).toHaveBeenCalledWith({ type: "toolCallDelta", index: 0, name: "edit_code", delta: "{}" });
    expect(mocks.streamAiChat).toHaveBeenCalledWith(
      [{ role: "user", content: "修改代码" }],
      expect.any(Function),
      expect.objectContaining({ maxTokens: 8192, reasoningEffort: "high", tools, toolChoice: "auto" }),
    );
  });

  it("allows the Agent Core to run with an injected protocol transport", async () => {
    const runTurn = vi.fn().mockResolvedValue({ content: "任务完成", toolCalls: [], model: "test-model", totalTokens: 4 });
    const transport: AgentModelTransport = { runTurn };

    const result = await runAgentCore({
      prompt: "检查当前代码",
      host: { getSnapshot: () => ({ workspaceMode: "code" }), getTools: () => [], executeTool: vi.fn() },
      onEvent: vi.fn(),
      signal: new AbortController().signal,
      transport,
    });

    expect(result.summary).toBe("任务已完成。");
    expect(runTurn).toHaveBeenCalledTimes(1);
  });
});
