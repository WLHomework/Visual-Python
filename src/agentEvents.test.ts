import { describe, expect, it } from "vitest";
import { mapCodexServerRequest, mapCodexStreamEvent } from "./codexAgentClient";
import { resolveAgentEventText } from "./agentEvents";
import type { AgentModelEvent } from "./agentEvents";

describe("protocol-neutral Agent model events", () => {
  it("keeps the event title when the protocol provides empty markdown", () => {
    expect(resolveAgentEventText({ title: "正在读取当前工程", markdown: "" })).toBe("正在读取当前工程");
    expect(resolveAgentEventText({ title: "占位标题", markdown: "读取完成。" })).toBe("读取完成。");
  });

  it.each([
    [
      { type: "assistantDelta", threadId: "thread-1", turnId: "turn-1", itemId: "message-1", delta: "完成" },
      { type: "textDelta", threadId: "thread-1", turnId: "turn-1", itemId: "message-1", delta: "完成" },
    ],
    [
      { type: "reasoningDelta", threadId: "thread-1", turnId: "turn-1", itemId: "reasoning-1", delta: "先分析" },
      { type: "reasoningDelta", threadId: "thread-1", turnId: "turn-1", itemId: "reasoning-1", delta: "先分析" },
    ],
    [
      { type: "tokenUsage", threadId: "thread-1", turnId: "turn-1", inputTokens: 10, cachedInputTokens: 7, outputTokens: 3, totalTokens: 13 },
      { type: "tokenUsage", threadId: "thread-1", turnId: "turn-1", inputTokens: 10, cachedInputTokens: 7, outputTokens: 3, totalTokens: 13 },
    ],
    [
      { type: "turnCompleted", threadId: "thread-1", turnId: "turn-1", status: "completed", turn: { id: "turn-1" } },
      { type: "turnCompleted", threadId: "thread-1", turnId: "turn-1", status: "completed", turn: { id: "turn-1", } },
    ],
  ])("maps %j to the shared event shape", (source, expected) => {
    expect(mapCodexStreamEvent(source as never)).toEqual(expected as AgentModelEvent);
  });

  it("drops protocol-only notifications from the model event stream", () => {
    expect(mapCodexStreamEvent({ type: "other", method: "item/started", params: {} })).toBeUndefined();
  });

  it("maps App Server dynamic tool calls to the shared host request", () => {
    expect(mapCodexServerRequest({
      id: 7,
      method: "item/tool/call",
      params: { callId: "call-1", tool: "edit_code", arguments: { edits: [] } },
    })).toEqual({ requestId: 7, callId: "call-1", name: "edit_code", arguments: { edits: [] } });
  });

  it("rejects non-tool and malformed App Server requests at the protocol boundary", () => {
    expect(mapCodexServerRequest({ id: 8, method: "item/commandExecution", params: {} })).toBeUndefined();
    expect(mapCodexServerRequest({ id: 9, method: "item/tool/call", params: { tool: "" } })).toBeUndefined();
  });
});
