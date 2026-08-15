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

  it("compacts only old complete tool rounds when the history grows too large", () => {
    let messages = buildAgentRequestMessages(createAgentRequestContext({ system: "system", prompt: "任务", history: [], snapshot: {}, memory: "memory" }));
    for (let index = 0; index < 5; index += 1) {
      messages = appendAgentTurn(messages, [
        { role: "assistant", content: "", toolCalls: [{ id: `call-${index}`, type: "function", function: { name: "get_context", arguments: "{}" } }] },
        { role: "tool", toolCallId: `call-${index}`, content: `round-${index}:${"x".repeat(10_000)}` },
      ]);
    }

    const serialized = JSON.stringify(messages);
    expect(serialized.length).toBeLessThan(40_000);
    expect(serialized).not.toContain("round-0:");
    expect(serialized).toContain("round-4:");
    expect(serialized).toContain("历史工具回合已压缩");
    messages.forEach((message, index) => {
      if (message.role !== "assistant" || !message.toolCalls?.length) return;
      expect(messages[index + 1]?.role).toBe("tool");
    });
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

  it("removes repeated full code from incremental Blockly results", () => {
    const result = compactAgentToolResult("add_workspace_block", {
      ok: true,
      changed: true,
      block: { id: "block-2", type: "visual_python_turtle_forward", parentId: "program-1" },
      blockCount: 2,
      code: "x".repeat(20_000),
    });

    expect(result).toContain("block-2");
    expect(result).toContain("blockCount");
    expect(result).not.toContain("x".repeat(500));
  });

  it("keeps oversized plugin tool results as valid compact JSON", () => {
    const result = compactAgentToolResult("update_plugin_draft", {
      updated: true,
      draftId: "draft-1",
      files: Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`file-${index}.js`, "x".repeat(20_000)])),
    });

    expect(() => JSON.parse(result)).not.toThrow();
    expect(result.length).toBeLessThanOrEqual(6_000);
  });

  it("preserves a bounded plugin source page", () => {
    const result = compactAgentToolResult("read_plugin_draft_file", {
      path: "index.js",
      offset: 0,
      content: "x".repeat(5_000),
      totalChars: 8_000,
      truncated: true,
      nextOffset: 5_000,
    });

    expect(JSON.parse(result)).toMatchObject({ content: "x".repeat(5_000), nextOffset: 5_000 });
  });

  it("compacts only verbose assistant narration in the model-history copy", () => {
    expect(compactAgentAssistantMessage("说明".repeat(1000))).toContain("[内容已截断]");
  });
});
