import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { groupAgentActivities, highlightAssistantCode, isNearLatestScroll, MarkdownContent, normalizeAssistantMarkdown, safeExternalMarkdownUrl, trimAiConversationHistory } from "./AiAssistantPanel";
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
    expect(grouped.slice(1).every((entry) => entry.kind === "activity")).toBe(true);
  });

  it("keeps a single routine tool visible without an unnecessary group", () => {
    const activity: AiAgentActivity = { id: "tool-1", kind: "tool", status: "done", title: "读取场景", toolName: "get_scene" };
    expect(groupAgentActivities([activity])).toEqual([{ kind: "activity", activity }]);
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
