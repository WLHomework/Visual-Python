import { describe, expect, it } from "vitest";
import type { AiChatMessage } from "../aiConfig";
import { buildAgentRequestMessages, compactAgentToolResult, createAgentRequestContext } from "./context";

describe("Agent context compression", () => {
  it("keeps the initial code snapshot but omits it from later rounds", () => {
    const context = createAgentRequestContext({
      system: "system",
      prompt: "添加一个圆",
      history: [],
      snapshot: { project: { scene: { name: "Demo" } }, code: "class Demo:\n    pass", lineCount: 2 },
      memory: "任务记忆摘要：暂无额外记录。",
    });

    const first = buildAgentRequestMessages(context, [], true);
    const later = buildAgentRequestMessages(context, [], false);

    expect(first.at(-1)?.content).toContain("class Demo");
    expect(later.at(-1)?.content).not.toContain("class Demo");
    expect(later.at(-1)?.content).toContain("代码行数");
  });

  it("keeps only recent bounded conversation context", () => {
    const context = createAgentRequestContext({
      system: "system",
      prompt: "当前任务",
      history: Array.from({ length: 8 }, (_, index) => ({ user: `user-${index}`, assistant: `assistant-${index}` })),
      snapshot: {},
      memory: "memory",
    });

    const messages = buildAgentRequestMessages(context, [], false);
    expect(messages.filter((message) => message.role === "user").map((message) => message.content).join("\n")).toContain("user-7");
    expect(messages.map((message) => message.content).join("\n")).not.toContain("user-0");
  });

  it("preserves tool-call pairing while replacing old rounds with a compact context", () => {
    const latest: AiChatMessage[] = [
      { role: "assistant", content: "", toolCalls: [{ id: "call-1", type: "function", function: { name: "edit_code", arguments: "{}" } }] },
      { role: "tool", toolCallId: "call-1", content: JSON.stringify({ ok: true, changed: true }) },
    ];
    const context = createAgentRequestContext({ system: "system", prompt: "修改代码", history: [], snapshot: {}, memory: "memory" });
    const messages = buildAgentRequestMessages(context, latest, false);

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
});
