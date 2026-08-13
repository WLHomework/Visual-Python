import { describe, expect, it } from "vitest";
import type { AiChatMessage } from "../aiConfig";
import { appendAgentTurn, buildAgentRequestMessages, compactAgentAssistantMessage, compactAgentToolResult, createAgentRequestContext } from "./context";

describe("Agent context compression", () => {
  it("builds one immutable initial request with the current code snapshot", () => {
    const context = createAgentRequestContext({
      system: "system",
      prompt: "添加一个圆",
      history: [],
      snapshot: { project: { scene: { name: "Demo" } }, code: "class Demo:\n    pass", lineCount: 2 },
      memory: "任务记忆摘要：暂无额外记录。",
    });

    const first = buildAgentRequestMessages(context);

    expect(first.at(-1)?.content).toContain("class Demo");
  });

  it("keeps only recent bounded conversation context", () => {
    const context = createAgentRequestContext({
      system: "system",
      prompt: "当前任务",
      history: Array.from({ length: 8 }, (_, index) => ({ user: `user-${index}`, assistant: `assistant-${index}` })),
      snapshot: {},
      memory: "memory",
    });

    const messages = buildAgentRequestMessages(context);
    expect(messages.filter((message) => message.role === "user").map((message) => message.content).join("\n")).toContain("user-7");
    expect(messages.map((message) => message.content).join("\n")).not.toContain("user-0");
  });

  it("appends tool-call rounds without changing the existing request prefix", () => {
    const turn: AiChatMessage[] = [
      { role: "assistant", content: "", toolCalls: [{ id: "call-1", type: "function", function: { name: "edit_code", arguments: "{}" } }] },
      { role: "tool", toolCallId: "call-1", content: JSON.stringify({ ok: true, changed: true }) },
    ];
    const context = createAgentRequestContext({ system: "system", prompt: "修改代码", history: [], snapshot: {}, memory: "memory" });
    const initial = buildAgentRequestMessages(context);
    const messages = appendAgentTurn(initial, turn);

    expect(messages.slice(0, initial.length)).toEqual(initial);
    expect(messages.at(-2)).toMatchObject({ role: "assistant", toolCalls: [{ id: "call-1" }] });
    expect(messages.at(-1)).toMatchObject({ role: "tool", toolCallId: "call-1" });
  });

  it("removes full code snapshots from mutation results while retaining the diff", () => {
    const result = compactAgentToolResult("edit_code", {
      ok: true,
      changed: true,
      diff: "@@ 第 4 行 @@\n- pass\n+ self.add(Circle())",
      __codeChange: { before: "x".repeat(20_000), after: "y".repeat(20_000) },
    });

    expect(result).toContain("self.add(Circle())");
    expect(result).not.toContain("before");
    expect(result).not.toContain("x".repeat(500));
  });

  it("compacts only verbose assistant narration in the model-history copy", () => {
    expect(compactAgentAssistantMessage("说明".repeat(1000))).toContain("[内容已截断]");
  });
});
