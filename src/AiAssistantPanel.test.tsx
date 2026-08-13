import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentActivityRow, AgentResponseFooter, buildPlanExecutionRequest, buildTaskResumeRequest, CodeChangeSummary, createInitialTaskPlan, extractPlanSteps, finalizeAgentRunActivities, formatAgentElapsed, formatAiTokenCount, formatAgentRunError, formatAgentToolResult, formatCodeChangeStats, groupAgentActivities, highlightAssistantCode, isNearLatestScroll, MarkdownContent, normalizeAssistantMarkdown, prepareTaskPlanForResume, removeFinalMessageActivity, safeExternalMarkdownUrl, settlePermissionResolvers, storeConversationState, summarizeAgentActivities, taskPlanResumeLabel, trimAiConversationHistory } from "./AiAssistantPanel";
import type { AiAgentActivity } from "./agentV2";

describe("AI assistant Markdown", () => {
  it("unwraps a model-supplied Markdown fence", () => {
    expect(normalizeAssistantMarkdown("```markdown\n**完成**\n\n- 已修改代码\n```"))
      .toBe("**完成**\n\n- 已修改代码");
  });

  it("keeps ordinary source-code fences intact", () => {
    const markdown = "```python\nprint('ok')\n```";
    expect(normalizeAssistantMarkdown(markdown)).toBe(markdown);
  });

  it("renders common and GFM Markdown as elements", () => {
    const html = renderToStaticMarkup(<MarkdownContent>{"**完成**\n\n- [x] 已检查\n\n| 项目 | 状态 |\n| --- | --- |\n| 代码 | 通过 |"}</MarkdownContent>);
    expect(html).toContain("<strong>完成</strong>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<table>");
    expect(html).not.toContain("**完成**");
  });

  it("renders inline and display LaTeX formulas with KaTeX", () => {
    const html = renderToStaticMarkup(<MarkdownContent>{"Hyperbola $\\frac{x^2}{a^2} - \\frac{y^2}{b^2} = 1$.\n\n$$\nc^2 = a^2 + b^2\n$$"}</MarkdownContent>);
    expect(html).toContain("katex");
    expect(html).toContain("katex-display");
    expect(html).toContain("mfrac");
    expect(html).not.toContain("$\\frac");
  });

  it("keeps LaTeX delimiters literal inside code fences", () => {
    const html = renderToStaticMarkup(<MarkdownContent>{"```text\n$\\frac{x}{y}$\n```"}</MarkdownContent>);
    expect(html).toContain("$\\frac{x}{y}$");
    expect(html).not.toContain("katex");
  });

  it("renders clarification choices as a numbered list", () => {
    const html = renderToStaticMarkup(<MarkdownContent>{"请选择讲解重点：\n\n1. 斜率与截距\n2. 图像变化\n3. 由 AI 决定"}</MarkdownContent>);
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>斜率与截距</li>");
    expect(html).not.toContain("<button");
  });

  it("places completion metadata in the response footer", () => {
    const html = renderToStaticMarkup(<AgentResponseFooter status="完成" meta="2 次操作 · 9 行代码 · 9 秒"/>);
    expect(html).toContain('class="ai-agent-response-footer"');
    expect(html.indexOf("完成")).toBeLessThan(html.indexOf("2 次操作"));
    expect(html).not.toContain("<svg");
  });

  it("hides successful tool JSON and keeps only a code diff", () => {
    const codeDiff = "@@ 第 6 行 @@\n- pass\n+ self.add(Circle())";
    expect(formatAgentToolResult({
      id: "edit-1",
      kind: "tool",
      status: "done",
      title: "定点修改代码",
      toolName: "edit_code",
      result: JSON.stringify({ diff: codeDiff, changed: true }),
    })).toBe(codeDiff);
    expect(formatAgentToolResult({
      id: "check-1",
      kind: "tool",
      status: "done",
      title: "验证场景结构",
      toolName: "validate_scene",
      result: JSON.stringify({ valid: true, issues: [] }),
    })).toBeNull();
  });

  it("shows dependency findings as completed checks instead of generic failures", () => {
    expect(formatAgentToolResult({
      id: "dependencies-1",
      kind: "tool",
      status: "done",
      title: "检查 Python 依赖",
      toolName: "check_dependencies",
      result: JSON.stringify({ ok: true, checked: true, allInstalled: false, packages: [{ name: "numpy", installed: true }], missing: ["manim"] }),
    })).toBe("未安装：manim");
    expect(formatAgentToolResult({
      id: "dependencies-2",
      kind: "tool",
      status: "done",
      title: "检查 Python 依赖",
      toolName: "check_dependencies",
      result: JSON.stringify({ ok: true, checked: true, allInstalled: true, packages: [{ name: "numpy", installed: true }], missing: [] }),
    })).toBeNull();
  });

  it("keeps validation diagnostics visible when a check returns a business failure", () => {
    expect(formatAgentToolResult({
      id: "code-check-1",
      kind: "tool",
      status: "done",
      title: "检查 Python 代码",
      toolName: "check_code",
      result: JSON.stringify({ valid: false, error: "SyntaxError: invalid syntax" }),
    })).toBe("SyntaxError: invalid syntax");
    expect(formatAgentToolResult({
      id: "render-check-1",
      kind: "tool",
      status: "done",
      title: "检查渲染结果",
      toolName: "inspect_rendered_output",
      result: JSON.stringify({ valid: false, warning: "输出画面疑似空白" }),
    })).toBe("输出画面疑似空白");
  });

  it("reduces tracebacks to the final actionable exception", () => {
    expect(formatAgentToolResult({
      id: "code-check-traceback",
      kind: "tool",
      status: "error",
      title: "检查 Python 代码",
      toolName: "check_code",
      result: "Traceback (most recent call last):\n  File \"scene.py\", line 6\n    self.play(Circle())\nTypeError: Unexpected argument Circle passed to Scene.play().",
    })).toBe("TypeError: Unexpected argument Circle passed to Scene.play().");
  });

  it("does not expose malformed tool protocol or JSON fragments", () => {
    expect(formatAgentToolResult({
      id: "protocol-error",
      kind: "tool",
      status: "error",
      title: "修改代码",
      toolName: "edit_code",
      result: '<｜DSML｜tool_calls><｜DSML｜invoke name="edit_code">',
    })).toBe("工具返回格式无效");
    expect(formatAgentToolResult({
      id: "json-error",
      kind: "tool",
      status: "error",
      title: "检查代码",
      toolName: "check_code",
      result: '{"ok":false,"error":"SyntaxError: invalid syntax"',
    })).toBe("工具返回格式无效");
  });

  it("renders a failed tool once with its concise reason", () => {
    const html = renderToStaticMarkup(<AgentActivityRow
      activity={{
        id: "tool-error",
        kind: "tool",
        status: "error",
        title: "检查 Python 代码",
        toolName: "check_code",
        detail: "失败",
        result: JSON.stringify({ ok: false, error: "SyntaxError: invalid syntax" }),
      }}
      onRevealCodeChange={() => undefined}
      onRevealProblem={() => undefined}
    />);
    expect(html).toContain("检查 Python 代码");
    expect(html).toContain("SyntaxError: invalid syntax");
    expect(html).not.toContain(">失败<");
    expect(html).not.toContain("<details");
  });

  it("renders a denied tool as a concise cancellation instead of a technical failure", () => {
    const html = renderToStaticMarkup(<AgentActivityRow
      activity={{
        id: "tool-denied",
        kind: "tool",
        status: "error",
        title: "渲染 Manim",
        toolName: "render_manim",
        detail: "用户拒绝了这次操作",
        result: JSON.stringify({ ok: false, error: "用户拒绝了这次操作" }),
      }}
      onRevealCodeChange={() => undefined}
      onRevealProblem={() => undefined}
    />);
    expect(html).toContain('class="ai-agent-tool-line denied"');
    expect(html).toContain("已取消");
    expect(html).not.toContain("用户拒绝了这次操作");
  });

  it("formats task-level protocol and structured errors for users", () => {
    expect(formatAgentRunError("AI 请求失败（HTTP 400）：An assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'. (insufficient tool messages following tool_calls message)"))
      .toBe("模型返回的工具调用响应不完整，请重试。");
    expect(formatAgentRunError('{"ok":false,"error":{"message":"API Key 无效"}}'))
      .toBe("API Key 无效");
    expect(formatAgentRunError('AI 请求失败（HTTP 400）：{"error":{"message":"API Key 无效"}}'))
      .toBe("AI 请求失败（HTTP 400）：API Key 无效");
  });

  it("renders successful scene validation with the same verification status as code checks", () => {
    const html = renderToStaticMarkup(<AgentActivityRow
      activity={{
        id: "validate-1",
        kind: "tool",
        status: "done",
        title: "验证场景结构",
        toolName: "validate_scene",
        result: JSON.stringify({ valid: true, issues: [] }),
      }}
      onRevealCodeChange={() => undefined}
      onRevealProblem={() => undefined}
    />);
    expect(html).toContain("ai-agent-event verification done");
    expect(html).toContain("验证场景结构通过");
    expect(html).not.toContain("验证场景结构</strong>");
  });

  it("renders completed Manim rendering with the same verification status", () => {
    const html = renderToStaticMarkup(<AgentActivityRow
      activity={{
        id: "render-1",
        kind: "message",
        channel: "verification",
        status: "done",
        title: "渲染 Manim 通过",
      }}
      onRevealCodeChange={() => undefined}
      onRevealProblem={() => undefined}
    />);
    expect(html).toContain("ai-agent-event verification done");
    expect(html).toContain("渲染 Manim 通过");
  });

  it("renders code changes as a compact file summary", () => {
    const html = renderToStaticMarkup(<CodeChangeSummary
      activity={{
        id: "edit-2",
        kind: "tool",
        status: "done",
        title: "定点修改代码",
        toolName: "edit_code",
        codeChange: { before: "line 1\nline 2\n", after: "line 1\nnew 2\nnew 3\n", sceneName: "purple_circle" },
      }}
      onRevealCodeChange={() => undefined}
    />);
    expect(html).toContain("purple_circle");
    expect(html).not.toContain("purple_circle.py");
    expect(html).toContain(">+2<");
    expect(html).toContain(">-1<");
    expect(html).toContain("查看变更");
    expect(html).toContain("ai-agent-code-change");
    expect(html).not.toContain("ai-agent-code-change-icon");
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it("counts added and removed lines from a code diff", () => {
    expect(formatCodeChangeStats("@@ 第 2 行 @@\n- old\n+ new\n+ extra")).toEqual({ added: 2, removed: 1 });
  });

  it("labels and highlights fenced Python code", () => {
    const html = renderToStaticMarkup(<MarkdownContent>{"```python\nfrom manim import Scene\n```"}</MarkdownContent>);
    expect(html).toContain("ai-markdown-code-block");
    expect(html).toContain("Python");
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("复制代码");
  });

  it("does not guess highlighting for unknown languages", () => {
    expect(highlightAssistantCode("some content", "unknown-language")).toBeNull();
  });

  it("only allows web links to leave the application", () => {
    expect(safeExternalMarkdownUrl("https://example.com/docs")).toBe("https://example.com/docs");
    expect(safeExternalMarkdownUrl("http://localhost:8000/help")).toBe("http://localhost:8000/help");
    expect(safeExternalMarkdownUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalMarkdownUrl("file:///C:/secret.txt")).toBeNull();
    expect(safeExternalMarkdownUrl("/relative/path")).toBeNull();
  });

  it("renders unsupported links as non-clickable text", () => {
    const html = renderToStaticMarkup(<MarkdownContent>{"[危险链接](javascript:alert(1))"}</MarkdownContent>);
    expect(html).not.toContain("<a");
  });

  it("keeps the newest 24 completed turns as model context", () => {
    const history = Array.from({ length: 30 }, (_, index) => ({ user: `user-${index}`, assistant: `assistant-${index}` }));
    const trimmed = trimAiConversationHistory(history);
    expect(trimmed).toHaveLength(24);
    expect(trimmed[0].user).toBe("user-6");
    expect(trimmed.at(-1)?.user).toBe("user-29");
  });

  it("limits context characters while retaining the newest turns", () => {
    const history = Array.from({ length: 12 }, (_, index) => ({ user: `${index}${"u".repeat(5000)}`, assistant: "a".repeat(5000) }));
    const trimmed = trimAiConversationHistory(history);
    expect(trimmed).toHaveLength(8);
    expect(trimmed.at(-1)?.user.startsWith("11")).toBe(true);
    expect(trimmed.every((turn) => turn.user.length <= 4000 && turn.assistant.length <= 4000)).toBe(true);
  });

  it("preserves clarification state in conversation context", () => {
    expect(trimAiConversationHistory([{ user: "制作动画", assistant: "请选择方向", clarification: true }]))
      .toEqual([{ user: "制作动画", assistant: "请选择方向", clarification: true }]);
  });
});

describe("AI assistant streaming events", () => {
  it("does not render an extra spinner for an empty streaming response", () => {
    const html = renderToStaticMarkup(<AgentActivityRow
      activity={{ id: "message-1", kind: "message", status: "running", title: "" }}
      onRevealCodeChange={() => undefined}
      onRevealProblem={() => undefined}
    />);
    expect(html).toBe("");
  });
});

describe("AI assistant failed-run cleanup", () => {
  it("settles all pending permission requests when the panel is disposed", () => {
    const resolvers = new Map<number, (approved: boolean) => void>();
    const results: boolean[] = [];
    resolvers.set(1, (approved) => results.push(approved));
    resolvers.set(2, (approved) => results.push(approved));

    settlePermissionResolvers(resolvers);

    expect(results).toEqual([false, false]);
    expect(resolvers.size).toBe(0);
  });

  it("settles streaming activities when the request fails", () => {
    expect(finalizeAgentRunActivities([
      { id: "thinking", kind: "message", channel: "thinking", status: "running", title: "思考中" },
      { id: "tool", kind: "tool", status: "done", title: "已执行" },
      { id: "reply", kind: "message", status: "running", title: "" },
    ], "error")).toEqual([
      { id: "thinking", kind: "message", channel: "thinking", status: "error", title: "思考中" },
      { id: "tool", kind: "tool", status: "done", title: "已执行" },
      { id: "reply", kind: "message", status: "error", title: "" },
    ]);
  });

  it("removes the streamed copy when the final response is rendered", () => {
    const activities: AiAgentActivity[] = [
      { id: "message-1", kind: "message", channel: "message", status: "done", title: "任务已完成。" },
      { id: "thinking-1", kind: "message", channel: "thinking", status: "done", title: "已完成判断。" },
    ];
    expect(removeFinalMessageActivity(activities, "任务已完成。"))
      .toEqual([activities[1]]);
  });
});

describe("AI assistant activity grouping", () => {
  it("groups consecutive completed routine tools but preserves important activities", () => {
    const activities: AiAgentActivity[] = [
      { id: "tool-1", kind: "tool", status: "done", title: "读取场景", toolName: "get_scene" },
      { id: "tool-2", kind: "tool", status: "done", title: "检查代码", toolName: "check_code" },
      { id: "message-1", kind: "message", status: "done", title: "正在修改代码。" },
      { id: "tool-3", kind: "tool", status: "done", title: "修改代码", toolName: "edit_code", result: "+ code" },
      { id: "tool-4", kind: "tool", status: "error", title: "运行项目", toolName: "run_project", detail: "失败" },
    ];

    const grouped = groupAgentActivities(activities);

    expect(grouped).toHaveLength(4);
    expect(grouped[0].kind).toBe("group");
    expect(grouped[0].kind === "group" && grouped[0].activities).toHaveLength(2);
    expect(grouped[0].kind === "group" && grouped[0].summary).toBe("查看 1 项 · 检查 1 项");
    expect(grouped.slice(1).every((entry) => entry.kind === "activity")).toBe(true);
  });

  it("keeps a single routine tool visible without an unnecessary group", () => {
    const activity: AiAgentActivity = { id: "tool-1", kind: "tool", status: "done", title: "读取场景", toolName: "get_scene" };
    expect(groupAgentActivities([activity])).toEqual([{ kind: "activity", activity }]);
  });

  it("does not show duplicate decision activities in the timeline", () => {
    const decision: AiAgentActivity = { id: "decision-1", kind: "message", channel: "decision", status: "done", title: "决定执行：读取当前工程", toolName: "get_context" };
    expect(groupAgentActivities([decision])).toEqual([]);
  });

  it("hides internal tool-group activation from the activity timeline", () => {
    expect(groupAgentActivities([{
      id: "activate-1",
      kind: "tool",
      status: "done",
      title: "扩展工具能力",
      toolName: "activate_tool_group",
      result: JSON.stringify({ ok: true, activated: true, group: "dependencies" }),
    }])).toEqual([]);
  });

  it("shows reasoning above the assistant message from the same round", () => {
    const message: AiAgentActivity = { id: "message-1", kind: "message", channel: "message", status: "running", title: "正在回复" };
    const thinking: AiAgentActivity = { id: "thinking-1", kind: "message", channel: "thinking", status: "done", title: "思考过程" };
    const grouped = groupAgentActivities([message, thinking]);
    expect(grouped.map((entry) => entry.kind === "activity" ? entry.activity.id : entry.id))
      .toEqual(["thinking-1", "message-1"]);
  });

  it("summarizes routine tools by stable agent stages", () => {
    const activities: AiAgentActivity[] = [
      { id: "1", kind: "tool", status: "done", title: "读取项目", toolName: "get_context" },
      { id: "2", kind: "tool", status: "done", title: "读取场景", toolName: "get_scene" },
      { id: "3", kind: "tool", status: "done", title: "检查代码", toolName: "check_code" },
      { id: "4", kind: "tool", status: "done", title: "等待任务", toolName: "wait" },
      { id: "5", kind: "tool", status: "done", title: "保存工程", toolName: "save_project" },
    ];
    expect(summarizeAgentActivities(activities)).toBe("查看 2 项 · 检查 1 项 · 执行 1 项 · 其他 1 项");
  });

  it("groups successful structured tool results without showing their JSON", () => {
    const activities: AiAgentActivity[] = [
      { id: "context", kind: "tool", status: "done", title: "读取工程", toolName: "get_context", result: JSON.stringify({ ok: true }) },
      { id: "check", kind: "tool", status: "done", title: "检查代码", toolName: "check_code", result: JSON.stringify({ valid: true, issues: [] }) },
    ];
    expect(groupAgentActivities(activities)[0].kind).toBe("group");
  });

  it("keeps successful scene validation visible as a verification event", () => {
    const grouped = groupAgentActivities([{
      id: "validate-1",
      kind: "tool",
      status: "done",
      title: "验证场景结构",
      toolName: "validate_scene",
      result: JSON.stringify({ valid: true, issues: [] }),
    }]);
    expect(grouped).toEqual([{ kind: "activity", activity: expect.objectContaining({ id: "validate-1" }) }]);
  });

  it("removes the completed Manim start row after the final verification", () => {
    const grouped = groupAgentActivities([
      { id: "render-1", kind: "tool", status: "done", title: "渲染 Manim", toolName: "render_manim", result: JSON.stringify({ ok: true, started: true }) },
      { id: "observation-1", kind: "message", channel: "verification", status: "done", title: "渲染 Manim 通过", toolName: "render_manim" },
    ]);
    expect(grouped).toEqual([{ kind: "activity", activity: expect.objectContaining({ id: "observation-1" }) }]);
  });

  it("hides a pending permission tool row because the confirmation prompt represents it", () => {
    expect(groupAgentActivities([{
      id: "render-1",
      kind: "tool",
      status: "running",
      title: "渲染 Manim",
      toolName: "render_manim",
    }], "render_manim")).toEqual([]);
  });
});

describe("AI assistant scroll position", () => {
  it("treats content within 48 pixels of the bottom as latest", () => {
    expect(isNearLatestScroll(352, 200, 600)).toBe(true);
    expect(isNearLatestScroll(351, 200, 600)).toBe(false);
  });

  it("treats content shorter than the viewport as latest", () => {
    expect(isNearLatestScroll(0, 300, 200)).toBe(true);
  });
});

describe("AI assistant conversation persistence", () => {
  const conversationState = (activity: AiAgentActivity) => ({
    activeId: "conversation-current",
    conversations: [{
      id: "conversation-current",
      title: "Current",
      createdAt: 2,
      updatedAt: 2,
      runs: [{
        id: 1,
        prompt: "Create a scene",
        mode: "agent" as const,
        activities: [activity],
        status: "done" as const,
        result: { summary: "Done", toolCallCount: 1, lineCount: 10 },
      }],
    }],
  });

  class MemoryStorage {
    private readonly values = new Map<string, string>();
    private readonly limit: number;
    constructor(limit = Number.POSITIVE_INFINITY, initial: Record<string, string> = {}) {
      this.limit = limit;
      Object.entries(initial).forEach(([key, value]) => this.values.set(key, value));
    }
    get length() { return this.values.size; }
    getItem(key: string) { return this.values.get(key) ?? null; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    removeItem(key: string) { this.values.delete(key); }
    setItem(key: string, value: string) {
      const total = [...this.values.entries()].reduce((size, [candidate, stored]) => size + (candidate === key ? 0 : stored.length), 0) + value.length;
      if (total > this.limit) {
        const error = new Error("quota exceeded");
        error.name = "QuotaExceededError";
        throw error;
      }
      this.values.set(key, value);
    }
  }

  it("drops oversized code snapshots before persisting the current conversation", () => {
    const storage = new MemoryStorage();
    const source = "x".repeat(900_000);
    const state = conversationState({
      id: "edit-1",
      kind: "tool",
      status: "done",
      title: "Edit code",
      toolName: "edit_code",
      codeChange: { before: source, after: `${source}y` },
    });

    expect(storeConversationState("scene-current", state, storage)).toBe(true);
    const stored = storage.getItem("visual-python:ai-conversations:scene-current") || "";
    expect(stored.length).toBeLessThan(1_500_000);
    expect(stored).not.toContain(`\"before\":\"${source.slice(0, 100)}`);
  });

  it("evicts the oldest other-scene conversation and retries after a quota error", () => {
    const oldKey = "visual-python:ai-conversations:scene-old";
    const storage = new MemoryStorage(1_000, {
      [oldKey]: JSON.stringify({ activeId: "old", conversations: [{ id: "old", updatedAt: 1, runs: [], padding: "x".repeat(700) }] }),
    });
    const state = conversationState({ id: "message-1", kind: "message", status: "done", title: "y".repeat(400) });

    expect(storeConversationState("scene-current", state, storage)).toBe(true);
    expect(storage.getItem(oldKey)).toBeNull();
    expect(storage.getItem("visual-python:ai-conversations:scene-current")).not.toBeNull();
  });
});

describe("AI assistant task duration", () => {
  it("formats short and minute-long tasks without noisy milliseconds", () => {
    expect(formatAgentElapsed(10_000, 10_400)).toBe("<1 秒");
    expect(formatAgentElapsed(10_000, 22_000)).toBe("12 秒");
    expect(formatAgentElapsed(10_000, 80_000)).toBe("1 分 10 秒");
    expect(formatAgentElapsed(10_000, 130_000)).toBe("2 分");
  });

  it("ignores missing or invalid timestamps", () => {
    expect(formatAgentElapsed()).toBe("");
    expect(formatAgentElapsed(Number.NaN)).toBe("");
  });
});

describe("AI assistant token usage", () => {
  it("formats real usage compactly without hiding large totals", () => {
    expect(formatAiTokenCount(950)).toBe("950 Token");
    expect(formatAiTokenCount(42_300)).toBe("4.2 万 Token");
    expect(formatAiTokenCount(500_000)).toBe("50 万 Token");
    expect(formatAiTokenCount()).toBe("");
  });
});

describe("AI assistant Plan mode", () => {
  it("extracts concise execution steps from reviewed Markdown", () => {
    expect(extractPlanSteps("## 实施计划\n\n1. **读取**当前代码结构\n2. 定点修改动画\n3. 检查并渲染")).toEqual([
      "读取当前代码结构",
      "定点修改动画",
      "检查并渲染",
    ]);
    expect(extractPlanSteps("- [x] 分析现状\n- [ ] 修改代码\n- [ ] 验证结果")).toEqual(["分析现状", "修改代码", "验证结果"]);
  });

  it("builds a bounded execution request from the reviewed plan", () => {
    const request = buildPlanExecutionRequest("重构当前动画", "1. 读取结构\n2. 定点修改\n3. 验证场景");
    expect(request).toContain("原始任务：\n重构当前动画");
    expect(request).toContain("实施计划：\n1. 读取结构");
    expect(request).toContain("不要重新输出计划");

    const longRequest = buildPlanExecutionRequest("需".repeat(30_000), "计划".repeat(30_000));
    expect(longRequest.length).toBeLessThan(50_000);
    expect(longRequest).toContain("[内容已截断]");
  });

  it("preserves completed steps when preparing a failed task for resume", () => {
    const initial = createInitialTaskPlan(["读取结构", "修改动画", "验证场景"]);
    expect(initial).toEqual([
      { step: "读取结构", status: "in_progress" },
      { step: "修改动画", status: "pending" },
      { step: "验证场景", status: "pending" },
    ]);
    expect(prepareTaskPlanForResume([
      { step: "读取结构", status: "completed" },
      { step: "修改动画", status: "in_progress" },
      { step: "验证场景", status: "pending" },
    ])).toEqual([
      { step: "读取结构", status: "completed" },
      { step: "修改动画", status: "in_progress" },
      { step: "验证场景", status: "pending" },
    ]);
    expect(prepareTaskPlanForResume([
      { step: "读取结构", status: "completed" },
      { step: "修改动画", status: "completed" },
    ])).toEqual([
      { step: "读取结构", status: "completed" },
      { step: "修改动画", status: "completed" },
    ]);
  });

  it("builds a bounded resume request that skips completed work", () => {
    const steps = [
      { step: "读取结构", status: "completed" as const },
      { step: "修改动画", status: "in_progress" as const },
      { step: "验证场景", status: "pending" as const },
    ];
    const request = buildTaskResumeRequest("制作教学动画", steps);
    expect(request).toContain("工程已恢复到最近完成步骤的检查点");
    expect(request).toContain("已完成：\n- 读取结构");
    expect(request).toContain("1. 修改动画\n2. 验证场景");
    expect(buildTaskResumeRequest("任".repeat(60_000), steps).length).toBeLessThan(50_000);
    expect(taskPlanResumeLabel(steps)).toBe("从未完成步骤继续");
    expect(taskPlanResumeLabel([
      { step: "读取结构", status: "completed" },
      { step: "修改动画", status: "completed" },
    ])).toBe("继续完成任务收尾");
  });
});
