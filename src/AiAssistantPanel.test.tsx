import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildPlanExecutionRequest, buildTaskResumeRequest, createInitialTaskPlan, extractPlanSteps, formatAgentElapsed, formatAiTokenCount, groupAgentActivities, highlightAssistantCode, isNearLatestScroll, MarkdownContent, normalizeAssistantMarkdown, prepareTaskPlanForResume, safeExternalMarkdownUrl, storeConversationState, summarizeAgentActivities, taskPlanResumeLabel, trimAiConversationHistory } from "./AiAssistantPanel";
import type { AiAgentActivity } from "./aiAgent";

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
