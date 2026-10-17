import { describe, expect, it } from "vitest";
import type { AiChatMessage } from "../aiConfig";
import { appendAgentTurn, buildAgentRequestMessages, compactAgentAssistantMessage, compactAgentToolResult, createAgentRequestContext, graphicalCatalogInstructions } from "./context";

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

  it("attaches same-session images to the current user message", () => {
    const messages = buildAgentRequestMessages(createAgentRequestContext({
      system: "system",
      prompt: "按图片修改工程",
      history: [],
      snapshot: {},
      memory: "memory",
      attachments: [{ id: "image-1", name: "diagram.png", mimeType: "image/png", width: 100, height: 80, sourceBytes: 20, dataUrl: "data:image/jpeg;base64,abc", sendable: true }],
    }));
    expect(messages.at(-1)?.contentParts).toEqual([
      { type: "text", text: expect.stringContaining("按图片修改工程") },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,abc", detail: "auto" } },
    ]);
  });

  it("keeps the full block catalog outside the bounded workspace snapshot", () => {
    const catalog = JSON.stringify({ blocks: "x".repeat(15_000) });
    const messages = buildAgentRequestMessages(createAgentRequestContext({
      system: "system",
      prompt: "创建动画",
      history: [],
      snapshot: { code: "pass" },
      memory: "memory",
      blockCatalog: catalog,
    }));

    expect(messages.at(-1)?.content).toContain(catalog);
    expect(messages.some((message) => message.content.startsWith("[Block catalog]"))).toBe(true);
  });

  it("keeps an oversized block catalog in one bounded message", () => {
    const catalog = JSON.stringify({ blocks: "x".repeat(110_000) });
    const messages = buildAgentRequestMessages(createAgentRequestContext({
      system: "system",
      prompt: "创建动画",
      history: [],
      snapshot: { code: "pass" },
      memory: "memory",
      blockCatalog: catalog,
    }));
    expect(messages.every((message) => message.content.length <= 50_000)).toBe(true);
    const catalogMessage = messages.find((message) => message.content.startsWith("[Block catalog]"));
    expect(catalogMessage).toBeDefined();
    expect(catalogMessage?.content).not.toContain(catalog);
    expect(() => JSON.parse((catalogMessage?.content.split("\n\n")[0] || "").replace("[Block catalog]\n", ""))).not.toThrow();
  });

  it("compacts a task directory result without dropping its candidate contract", () => {
    const result = compactAgentToolResult("get_task_block_directory", {
      categories: [{ name: "扩展", blockCount: 1 }],
      candidates: [{
        type: "third_party_draw",
        label: "绘制对象",
        category: "扩展",
        description: "描述".repeat(5_000),
        aliases: ["画图", "可视化"],
        contract: {
          inputSlots: [{ name: "BODY", kind: "statement" }],
          hasOutputConnection: false,
          outputCheck: null,
          hasPreviousConnection: true,
          previousCheck: null,
          hasNextConnection: true,
          nextCheck: null,
          fields: [],
        },
      }],
      hint: "候选积木",
    });

    expect(result.length).toBeLessThanOrEqual(6_000);
    const parsed = JSON.parse(result) as { candidates: Array<Record<string, unknown>> };
    expect(parsed.candidates[0]).toMatchObject({ type: "third_party_draw", label: "绘制对象" });
    expect(parsed.candidates[0]).toHaveProperty("contract");
    expect(result).not.toContain("描述".repeat(1_000));
  });

  it("keeps an oversized task directory as valid JSON", () => {
    const result = compactAgentToolResult("get_task_block_directory", {
      categories: [{ name: "扩展", blockCount: 120 }],
      candidates: Array.from({ length: 120 }, (_, index) => ({
        type: `third_party_${index}`,
        label: `积木 ${index}`,
        category: "扩展",
        description: "x".repeat(20_000),
        examples: ["示例".repeat(2_000)],
      })),
    });

    expect(result.length).toBeLessThanOrEqual(6_000);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("keeps planning fields and drops scoring-only metadata in compacted directories", () => {
    const result = compactAgentToolResult("get_task_block_directory", {
      categories: [],
      candidates: [{
        type: "visual_python_manim_circle_object",
        label: "圆形",
        category: "Manim / 常用",
        purpose: "创建圆形对象，可用于弹跳小球动画",
        keywords: ["小球", "ball"],
        aliases: ["小球"],
        intentTags: ["geometry"],
        capabilities: ["create-object"],
        dependencies: ["manim"],
        recommendedFor: ["弹跳动画"],
        contract: {
          inputSlots: [],
          hasOutputConnection: true,
          outputCheck: ["ManimObject"],
          hasPreviousConnection: false,
          previousCheck: null,
          hasNextConnection: false,
          nextCheck: null,
          fields: [],
        },
      }],
    });

    const parsed = JSON.parse(result) as { candidates: Array<Record<string, unknown>> };
    expect(parsed.candidates[0]).toMatchObject({ type: "visual_python_manim_circle_object", purpose: "创建圆形对象，可用于弹跳小球动画", recommendedFor: ["弹跳动画"] });
    expect(parsed.candidates[0]).toHaveProperty("contract");
    expect(parsed.candidates[0]).not.toHaveProperty("keywords");
    expect(parsed.candidates[0]).not.toHaveProperty("aliases");
    expect(parsed.candidates[0]).not.toHaveProperty("intentTags");
  });

  it("keeps the request under the total character limit without sending duplicate block states", () => {
    const catalog = JSON.stringify({
      categories: [{
        name: "Python",
        categories: [],
        blocks: Array.from({ length: 1_200 }, (_, index) => ({
          type: `python_block_${index}`,
          label: `常用积木 ${index}`,
          state: { type: `python_block_${index}`, inputs: { DEFAULT: "x".repeat(200) } },
          inputSlots: [{ name: "VALUE", kind: "value", check: ["String"] }],
          fields: [{ name: "MODE", value: "DEFAULT", text: "默认" }],
        })),
      }],
    });
    const messages = buildAgentRequestMessages(createAgentRequestContext({
      system: "system",
      prompt: "创建动画",
      history: [],
      snapshot: { code: "pass" },
      memory: "memory",
      blockCatalog: catalog,
    }));
    const catalogText = (messages.find((message) => message.content.startsWith("[Block catalog]"))?.content.split("\n\n")[0] || "").replace("[Block catalog]\n", "");
    const compactCatalog = JSON.parse(catalogText);
    const blocks = compactCatalog.categories[0].blocks;

    expect(messages.reduce((total, message) => total + message.content.length, 0)).toBeLessThanOrEqual(150_000);
    expect(blocks.length + compactCatalog.omittedBlockCount).toBe(1_200);
    expect(blocks[0]).not.toHaveProperty("state");
    expect(blocks[0].type).toBe("python_block_0");
    expect(messages.some((message) => message.content.includes("仅附带部分积木候选"))).toBe(compactCatalog.omittedBlockCount > 0);
  });

  it("prefers attached contracts over extra directory discovery", () => {
    const truncated = graphicalCatalogInstructions(JSON.stringify({
      candidates: [{ type: "python_print", label: "输出", contract: { inputSlots: [], fields: [], requiredInputs: ["VALUE"] } }],
      omittedCandidateCount: 5,
    }));
    expect(truncated).toContain("omittedCandidateCount");
    expect(truncated).toContain("requiredInputs");
    expect(truncated).not.toContain("do not call get_task_block_directory or search_blocks");

    const complete = graphicalCatalogInstructions(JSON.stringify({
      candidates: [{ type: "python_print", label: "输出", contract: { inputSlots: [], fields: [] } }],
    }));
    expect(complete).toContain("complete catalog");
    expect(complete).toContain("do not call get_task_block_directory or search_blocks");
  });

  it("keeps at most the twenty-four most recent conversation turns", () => {
    const context = createAgentRequestContext({
      system: "system",
      prompt: "当前任务",
      history: Array.from({ length: 40 }, (_, index) => ({ user: `user-${index}`, assistant: `assistant-${index}` })),
      snapshot: {},
      memory: "memory",
    });

    const messages = buildAgentRequestMessages(context);
    const joined = messages.map((message) => message.content).join("\n");
    expect(joined).toContain("user-39");
    expect(joined).toContain("user-16");
    expect(joined).not.toContain("user-15");
  });

  it("keeps the newest turns when the conversation history exceeds the character budget", () => {
    const context = createAgentRequestContext({
      system: "system",
      prompt: "当前任务",
      history: Array.from({ length: 10 }, (_, index) => ({
        user: `user-${index}:${"x".repeat(6_000)}`,
        assistant: `assistant-${index}:${"y".repeat(6_000)}`,
      })),
      snapshot: {},
      memory: "memory",
    });

    const joined = buildAgentRequestMessages(context).map((message) => message.content).join("\n");
    expect(joined).toContain("user-9:");
    expect(joined).not.toContain("user-7:");
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

  it("preserves prior block-directory evidence when compacting old tool rounds", () => {
    const initial = buildAgentRequestMessages(createAgentRequestContext({
      system: "system",
      prompt: "创建冒泡排序积木程序",
      history: [],
      snapshot: {},
      memory: "memory",
    }));
    const directory = JSON.stringify({
      categories: [{ name: "循环", blockCount: 4 }],
      candidates: [{ type: "controls_for", label: "重复执行", category: "循环" }],
    });
    const withDirectory = appendAgentTurn(initial, [
      { role: "assistant", content: "先读取积木目录。", toolCalls: [{ id: "directory-call", type: "function", function: { name: "get_task_block_directory", arguments: "{\"task\":\"冒泡排序\"}" } }] },
      { role: "tool", toolCallId: "directory-call", content: directory },
    ]);
    let compacted = withDirectory;
    for (let index = 0; index < 2; index += 1) {
      compacted = appendAgentTurn(compacted, [
        { role: "assistant", content: "继续处理", toolCalls: [{ id: `large-call-${index}`, type: "function", function: { name: "get_context", arguments: "{}" } }] },
        { role: "tool", toolCallId: `large-call-${index}`, content: "x".repeat(18_000) },
      ]);
    }

    const serialized = JSON.stringify(compacted);
    expect(serialized).not.toContain("directory-call");
    expect(serialized).toContain("get_task_block_directory");
    expect(serialized).toContain("controls_for");
    expect(serialized).toContain("重复执行");
    expect(serialized).toContain("冒泡排序");
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

  it("keeps BlockPlan outcomes compact without returning the workspace or generated code", () => {
    const result = compactAgentToolResult("apply_block_plan", {
      ok: true,
      changed: true,
      changedBlockIds: ["block-2"],
      refIds: { scene: "block-2" },
      blockCount: 2,
      code: "x".repeat(20_000),
      state: { blocks: { blocks: ["x".repeat(20_000)] } },
      issues: [],
    });

    expect(JSON.parse(result)).toMatchObject({ ok: true, changed: true, blockCount: 2, changedBlockIds: ["block-2"], refIds: { scene: "block-2" }, issues: [] });
    expect(result).not.toContain('"state"');
    expect(result).not.toContain('"code"');
    expect(result).not.toContain("x".repeat(500));
  });

  it("keeps all compact block template contracts without serializing their states", () => {
    const result = compactAgentToolResult("get_block_templates", {
      templates: Array.from({ length: 50 }, (_, index) => ({
        type: `block_${index}`,
        label: `Block ${index}`,
        state: { type: `block_${index}`, payload: "x".repeat(10_000) },
        inputSlots: [{ name: "VALUE", kind: "value", check: ["Number"] }],
        fields: [],
      })),
    });

    const parsed = JSON.parse(result) as { templates: Array<Record<string, unknown>> };
    expect(parsed.templates).toHaveLength(50);
    expect(parsed.templates[49]?.type).toBe("block_49");
    expect(result).not.toContain('"state"');
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

  it("preserves a bounded plugin guide page", () => {
    const result = compactAgentToolResult("read_plugin_guide", {
      found: true,
      section: "六、PluginContext API",
      offset: 0,
      content: "y".repeat(4_000),
      totalChars: 6_000,
      truncated: true,
      nextOffset: 4_000,
      available: [],
    });

    expect(JSON.parse(result)).toMatchObject({ content: "y".repeat(4_000), nextOffset: 4_000, section: "六、PluginContext API" });
  });

  it("compacts only verbose assistant narration in the model-history copy", () => {
    expect(compactAgentAssistantMessage("说明".repeat(1000))).toContain("[内容已截断]");
  });
});
