import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { activityDisplayText, AgentActivityRow, AgentResponseFooter, agentTokenUsageTitle, aiAssistantSuggestions, AiAssistantSuggestionButtons, AiAssistantWelcome, applyAiAssistantSuggestion, attachAiThreadWheelHandler, buildAiFollowUpSuggestions, buildPlanExecutionRequest, buildTaskResumeRequest, CodeChangeSummary, composeAgentRunBody, createInitialTaskPlan, extractPlanSteps, finalizeAgentRunActivities, formatAgentElapsed, formatAiTokenCount, formatAgentRunError, formatAgentToolResult, formatCodeChangeStats, getAiThreadScrollbarMetrics, groupAgentActivities, highlightAssistantCode, isNearLatestScroll, MarkdownContent, mergeAiConversationStates, nextAiThreadScrollTop, normalizeAssistantMarkdown, parseStoredRuns, prepareTaskPlanForResume, removeFinalMessageActivity, safeExternalMarkdownUrl, scrollThreadToLatest, settlePermissionResolvers, shouldPersistConversationRuns, shouldShowAiFollowUpSuggestions, storeConversationState, StreamingRichText, summarizeAgentActivities, taskPlanResumeLabel, trimAiConversationHistory, AgentRunBody } from "./AiAssistantPanel";
import { parseAgentFollowUpSuggestions } from "./agentV2/followUps";
import type { AiAgentActivity } from "./agentV2/types";

describe("AI assistant Markdown", () => {
  it("renders only the centered project-wide suggestion buttons in the welcome state", () => {
    const html = renderToStaticMarkup(<AiAssistantWelcome onSelect={() => undefined}/>);

    expect(html).toContain('class="ai-agent-empty"');
    expect(html).toContain('class="ai-agent-empty-mark"');
    expect(html).toContain('class="ai-agent-empty-title"');
    expect(html).toContain('class="ai-agent-suggestions welcome"');
    expect(aiAssistantSuggestions).toHaveLength(4);
    expect(html).toContain("探索并理解当前代码");
    expect(html).toContain("创建程序或动画");
    expect(html).toContain("检查代码并提出改进");
    expect(html).toContain("修复问题和错误");
    expect(html).not.toContain("AI 编程助手");
    expect(html).not.toContain("基于当前文档处理代码、运行和插件任务");
    expect(html).not.toContain("勾股定理");
  });

  it("shows the active document context in the welcome state", () => {
    const html = renderToStaticMarkup(<AiAssistantWelcome onSelect={() => undefined} contextName="NewScene" lineCount={12}/>);

    expect(html).toContain('title="NewScene · 12 行代码"');
    expect(html).not.toContain("AI 编程助手");
  });

  it("reuses the same suggestion buttons after a run finishes", () => {
    const html = renderToStaticMarkup(<AiAssistantSuggestionButtons onSelect={() => undefined} className="followups"/>);

    expect(html.match(/<button/g)).toHaveLength(aiAssistantSuggestions.length);
    expect(html).toContain('class="ai-agent-suggestions followups"');
    expect(shouldShowAiFollowUpSuggestions([{ status: "running" }])).toBe(false);
    expect(shouldShowAiFollowUpSuggestions([{ status: "done" }])).toBe(true);
    expect(shouldShowAiFollowUpSuggestions([{ status: "error" }])).toBe(true);
  });

  it("fills and focuses the composer when a suggestion is selected", () => {
    const setPrompt = vi.fn();
    const focusPrompt = vi.fn();

    applyAiAssistantSuggestion(aiAssistantSuggestions[1].prompt, setPrompt, focusPrompt);

    expect(setPrompt).toHaveBeenCalledWith(aiAssistantSuggestions[1].prompt);
    expect(focusPrompt).toHaveBeenCalledOnce();
  });

  it("submits a suggestion immediately when a submit handler is provided", () => {
    const setPrompt = vi.fn();
    const focusPrompt = vi.fn();
    const submitPrompt = vi.fn();

    applyAiAssistantSuggestion(aiAssistantSuggestions[1].prompt, setPrompt, focusPrompt, submitPrompt);

    expect(setPrompt).toHaveBeenCalledWith(aiAssistantSuggestions[1].prompt);
    expect(submitPrompt).toHaveBeenCalledWith(aiAssistantSuggestions[1].prompt);
    expect(focusPrompt).not.toHaveBeenCalled();
  });

  it("uses model-provided follow-up suggestions without showing metadata", () => {
    const parsed = parseAgentFollowUpSuggestions("已完成。\n<!-- visual-python-followups: [{\"label\":\"检查结果\",\"prompt\":\"检查当前结果\"},{\"label\":\"继续完善\",\"prompt\":\"继续完善当前结果\"}] -->");

    expect(parsed.suggestions).toEqual([
      { label: "检查结果", prompt: "检查当前结果" },
      { label: "继续完善", prompt: "继续完善当前结果" },
    ]);
    expect(parsed.content).toBe("已完成。");
    expect(normalizeAssistantMarkdown("已完成。\n<!-- visual-python-followups: [{\"label\":\"检查结果\",\"prompt\":\"检查当前结果\"}] -->")).toBe("已完成。");
    expect(normalizeAssistantMarkdown("已完成。\n<!-- visual-python-followups: [{\"label\":\"检查结果\"")).toBe("已完成。");
  });

  it("builds follow-up suggestions from the current work instead of fixed labels", () => {
    const suggestions = buildAiFollowUpSuggestions({ activities: [{ id: "edit", kind: "tool", status: "done", title: "修改代码", toolName: "edit_code" }] }, "MainScene");

    expect(suggestions).toHaveLength(3);
    expect(suggestions[0].prompt).toContain("MainScene");
    expect(suggestions.map(({ prompt }) => prompt)).not.toEqual(aiAssistantSuggestions.map(({ prompt }) => prompt));
  });

  it("calculates a moving thumb from the real scroll geometry", () => {
    expect(getAiThreadScrollbarMetrics({ scrollTop: 0, scrollHeight: 1000, clientHeight: 200, trackHeight: 400 })).toEqual({ visible: true, thumbHeight: 80, thumbTop: 0, maxThumbTop: 320 });
    expect(getAiThreadScrollbarMetrics({ scrollTop: 400, scrollHeight: 1000, clientHeight: 200, trackHeight: 400 })).toEqual({ visible: true, thumbHeight: 80, thumbTop: 160, maxThumbTop: 320 });
    expect(getAiThreadScrollbarMetrics({ scrollTop: 0, scrollHeight: 200, clientHeight: 200, trackHeight: 400 })).toEqual({ visible: false, thumbHeight: 400, thumbTop: 0, maxThumbTop: 0 });
  });

  it("clamps wheel scrolling to the AI thread bounds", () => {
    expect(nextAiThreadScrollTop(40, -100, 200, 600)).toBe(0);
    expect(nextAiThreadScrollTop(400, 300, 200, 600)).toBe(400);
    expect(nextAiThreadScrollTop(100, 50, 200, 600)).toBe(150);
  });

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

  it("renders fenced Python code with syntax highlighting", () => {
    const html = renderToStaticMarkup(<MarkdownContent>{"```python\nfrom manim import *\nclass Demo(Scene):\n    def construct(self):\n        self.add(Circle())\n```"}</MarkdownContent>);

    expect(html).toContain("ai-markdown-code-block");
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("hljs-title");
    expect(html).not.toContain("<code>from manim");
  });

  it("auto-detects syntax in fenced code without a language label", () => {
    const html = renderToStaticMarkup(<MarkdownContent>{"```\nfrom manim import *\nclass Demo(Scene):\n    def construct(self):\n        self.add(Circle())\n```"}</MarkdownContent>);

    expect(html).toContain("ai-markdown-code-block");
    expect(html).toContain("hljs-keyword");
  });

  it("renders inline and display LaTeX formulas with KaTeX", () => {
    const html = renderToStaticMarkup(<MarkdownContent>{"Hyperbola $\\frac{x^2}{a^2} - \\frac{y^2}{b^2} = 1$.\n\n$$\nc^2 = a^2 + b^2\n$$"}</MarkdownContent>);
    expect(html).toContain("katex");
    expect(html).toContain("katex-display");
    expect(html).toContain("mfrac");
    expect(html).not.toContain("$\\frac");
  });

  it("renders Chinese text in math mode without flooding the console", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const html = renderToStaticMarkup(<MarkdownContent>{"$中文变量 + x = 1$"}</MarkdownContent>);

    expect(html).toContain("katex");
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("unicodeTextInMathMode"));
    warn.mockRestore();
  });

  it("does not warn for common Unicode punctuation inside math mode", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const html = renderToStaticMarkup(<MarkdownContent>{"$x — y$"}</MarkdownContent>);

    expect(html).toContain("katex");
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("[unknownSymbol]"));
    warn.mockRestore();
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

  it("places only completion metadata and actions in the response footer", () => {
    const html = renderToStaticMarkup(<AgentResponseFooter status="完成" meta="9 秒 · 1.8 万 Token" metaTitle="缓存详情"><button type="button">复制</button></AgentResponseFooter>);
    expect(html).toContain('class="ai-agent-response-footer"');
    expect(html).toContain("9 秒 · 1.8 万 Token");
    expect(html).toContain("复制");
    expect(html).not.toContain(">完成<");
    expect(html).toContain('title="缓存详情"');
  });

  it("separates tool work from assistant replies in the run body", () => {
    const activities: AiAgentActivity[] = [
      { id: "thinking-1", kind: "message", channel: "thinking", status: "done", title: "思考过程", markdown: "先读代码" },
      { id: "tool-1", kind: "tool", status: "done", title: "读取当前工程", toolName: "get_context" },
      { id: "message-1", kind: "message", channel: "message", status: "done", title: "已经看过当前工程。", markdown: "已经看过当前工程。\n\n接下来会检查冒泡排序。" },
    ];
    const body = composeAgentRunBody(activities);
    expect(body.map((block) => block.kind)).toEqual(["timeline", "reply"]);
    expect(body[1]).toMatchObject({ kind: "reply", activity: { markdown: "已经看过当前工程。\n\n接下来会检查冒泡排序。" } });
  });

  it("renders assistant narration as Markdown outside the grouped activity timeline", () => {
    const html = renderToStaticMarkup(<AgentRunBody activities={[
      { id: "tool-1", kind: "tool", status: "done", title: "读取当前工程", toolName: "get_context" },
      { id: "message-1", kind: "message", channel: "message", status: "done", title: "检查结果", markdown: "已读取。\n\n**冒泡排序**存在边界问题。" },
    ]} onRevealCodeChange={() => undefined} onRevealProblem={() => undefined}/>);

    expect(html).toContain('class="ai-agent-worklog"');
    expect(html).toContain('<strong>冒泡排序</strong>存在边界问题。');
    expect(html).not.toContain("其它 2 项");
  });

  it("keeps an empty running reply mounted so tokens can stream in", () => {
    const html = renderToStaticMarkup(<StreamingRichText id="message-1" text="" live/>);
    expect(html).toContain("ai-markdown-stream");
  });

  it("keeps the task activity stream separate from the final answer", () => {
    const html = renderToStaticMarkup(<AgentActivityRow
      activity={{ id: "tool-1", kind: "tool", status: "running", title: "读取当前工程", toolName: "get_context" }}
      onRevealCodeChange={() => undefined}
      onRevealProblem={() => undefined}
    />);

    expect(html).toContain('class="ai-agent-tool-line running"');
    expect(html).not.toContain("任务完成");
  });

  it("explains provider cache usage without adding permanent footer text", () => {
    expect(agentTokenUsageTitle({
      prompt: 10_000, completion: 500, total: 10_500, requests: 2, rounds: 2,
      inputCharacters: 0, toolSchemaCharacters: 0, toolResultCharacters: 0,
      cached: 8_000, uncachedPrompt: 2_000, cacheCreation: 0, cacheReportedRequests: 2, cacheHitRate: 0.8,
    })).toBe("输入 10,000 Token · 缓存命中 8,000 Token（80%） · 未缓存 2,000 Token · 输出 500 Token · 2 次请求");
    expect(agentTokenUsageTitle({
      prompt: 100, completion: 20, total: 120, requests: 1, rounds: 1,
      inputCharacters: 0, toolSchemaCharacters: 0, toolResultCharacters: 0,
      cached: 0, uncachedPrompt: 0, cacheCreation: 0, cacheReportedRequests: 0,
    })).toContain("供应商未提供缓存统计");
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

  it("shows structured failure details and process output instead of a generic failure", () => {
    const result = formatAgentToolResult({
      id: "sort-failure",
      kind: "tool",
      status: "error",
      title: "运行项目",
      toolName: "run_project",
      result: JSON.stringify({
        ok: false,
        error: { message: "执行失败", details: "第 8 行存在错误", issues: [{ message: "列表长度为 0 时访问了首项" }] },
        stderr: "IndexError: list index out of range",
        stdout: "开始测试冒泡排序",
      }),
    });

    expect(result).toContain("执行失败");
    expect(result).toContain("第 8 行存在错误");
    expect(result).toContain("列表长度为 0 时访问了首项");
    expect(result).toContain("IndexError: list index out of range");
    expect(result).toContain("开始测试冒泡排序");
    expect(result).not.toBe("执行失败");
  });

  it("extracts nested issue arrays and traceback diagnostics", () => {
    expect(formatAgentToolResult({
      id: "nested-failure",
      kind: "tool",
      status: "error",
      title: "运行项目",
      toolName: "run_project",
      result: JSON.stringify({ ok: false, error: { issues: [{ message: "输入数据为空" }] }, traceback: "Traceback (most recent call last):\n  File \"main.py\", line 4\nIndexError: list index out of range" }),
    })).toContain("输入数据为空\nIndexError: list index out of range");
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

  it("keeps malformed tool protocol hidden but recovers a concrete truncated error", () => {
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
    })).toBe("SyntaxError: invalid syntax");
  });

  it("does not show a format error for a truncated successful plugin draft result", () => {
    expect(formatAgentToolResult({
      id: "plugin-draft-update",
      kind: "tool",
      status: "done",
      title: "修改插件草稿",
      toolName: "update_plugin_draft",
      result: '{"updated":true,"files":{"index.js":"export default { activate() {\n[结果已截断]',
    })).toBeNull();
  });

  it("summarizes plugin authoring stages without exposing tool JSON", () => {
    const cases: Array<[AiAgentActivity["toolName"], Record<string, unknown>, string]> = [
      ["create_plugin_plan", { planned: true, plan: { id: "plan-1" } }, "插件计划已建立"],
      ["create_plugin_draft", { created: true, phase: "drafted" }, "插件草稿已创建"],
      ["validate_plugin_draft", { validation: { valid: true } }, "插件静态检查通过"],
      ["run_plugin_draft_checks", { valid: true, phase: "ready" }, "插件运行检查通过"],
      ["install_plugin_draft", { installed: true, phase: "installed" }, "插件已安装并启用"],
    ];
    for (const [toolName, result, expected] of cases) {
      expect(formatAgentToolResult({ id: String(toolName), kind: "tool", status: "done", title: "plugin", toolName, result: JSON.stringify(result) })).toBe(expected);
    }
    expect(formatAgentToolResult({
      id: "plugin-check-failed",
      kind: "tool",
      status: "done",
      title: "plugin",
      toolName: "run_plugin_draft_checks",
      result: JSON.stringify({ valid: false, issues: ["activate failed"] }),
    })).toBe("activate failed");
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

  it("puts the full tool failure on the hover title when the row is truncated", () => {
    const html = renderToStaticMarkup(<AgentActivityRow
      activity={{
        id: "fail-1",
        kind: "tool",
        status: "error",
        title: "从 Python 生成积木",
        toolName: "apply_block_plan",
        detail: "积木连接检查未通过：场景中的配音积木只能放在 Manim 场景内部。",
      }}
      onRevealCodeChange={() => undefined}
      onRevealProblem={() => undefined}
    />);
    expect(html).toContain("title=\"从 Python 生成积木\n积木连接检查未通过：场景中的配音积木只能放在 Manim 场景内部。\"");
    expect(html).toContain("从 Python 生成积木");
    expect(html).toContain("积木连接检查未通过");
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

  it("renders streaming replies as Markdown instead of waiting until the turn finishes", () => {
    const markdown = "Hyperbola $\frac{x^2}{a^2} = 1$.\n\n```python\nprint(1)\n```";
    const live = renderToStaticMarkup(<AgentActivityRow
      activity={{ id: "message-live", kind: "message", status: "running", title: markdown }}
      onRevealCodeChange={() => undefined}
      onRevealProblem={() => undefined}
    />);
    const done = renderToStaticMarkup(<AgentActivityRow
      activity={{ id: "message-done", kind: "message", status: "done", title: markdown }}
      onRevealCodeChange={() => undefined}
      onRevealProblem={() => undefined}
    />);

    expect(live).toContain("ai-markdown-live");
    expect(live).toContain("katex");
    expect(live).toContain("hljs-keyword");
    expect(done).toContain("katex");
    expect(done).toContain("hljs-keyword");
    expect(done).not.toContain("ai-markdown-live");
  });

  it("shows thinking markdown instead of the placeholder title", () => {
    expect(activityDisplayText({ title: "思考过程", markdown: "先读取当前场景。" })).toBe("先读取当前场景。");
    const html = renderToStaticMarkup(<StreamingRichText text={"先读取当前场景。"} live/>);
    expect(html).toContain("ai-markdown-live");
    expect(html).toContain("先读取当前场景。");
  });

  it("skips highlighting oversized unlabeled code blocks", () => {
    expect(highlightAssistantCode("print('ok')\n".repeat(3000), "")).toBeNull();
    expect(highlightAssistantCode("from manim import Scene\n", "python")).toContain("hljs-keyword");
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

  it("removes only the last matching streamed answer and compares Markdown as well", () => {
    const first: AiAgentActivity = { id: "message-1", kind: "message", channel: "message", status: "done", title: "阶段说明" };
    const intermediate: AiAgentActivity = { id: "message-2", kind: "message", channel: "message", status: "done", title: "最终结果", markdown: "最终结果" };
    const final: AiAgentActivity = { id: "message-3", kind: "message", channel: "message", status: "done", title: "占位标题", markdown: "最终结果" };
    expect(removeFinalMessageActivity([first, intermediate, final], "最终结果")).toEqual([first, intermediate]);
  });

  it("dedupes the streamed reply even when it keeps the hidden follow-up metadata", () => {
    const reply = "你好！我是 Visual Python 内置的编程智能体。";
    const raw = `${reply}\n\n<!-- visual-python-followups: [{"label":"示例","prompt":"做个示例"}] -->`;
    const activities: AiAgentActivity[] = [
      { id: "message-1", kind: "message", channel: "message", status: "done", title: raw, markdown: raw },
      { id: "thinking-1", kind: "message", channel: "thinking", status: "done", title: "思考过程" },
    ];
    expect(removeFinalMessageActivity(activities, reply)).toEqual([activities[1]]);
  });

  it("ignores collapsed blank lines when matching the final response", () => {
    const activities: AiAgentActivity[] = [
      { id: "message-1", kind: "message", channel: "message", status: "done", title: "第一段。\n\n\n第二段。", markdown: "第一段。\n\n\n第二段。" },
    ];
    expect(removeFinalMessageActivity(activities, "第一段。\n\n第二段。")).toEqual([]);
  });

  it("removes the trailing replies that together compose the summary", () => {
    const first: AiAgentActivity = { id: "message-1", kind: "message", channel: "message", status: "done", title: "先说明操作。", markdown: "先说明操作。" };
    const tool: AiAgentActivity = { id: "tool-1", kind: "tool", status: "done", title: "读取场景", toolName: "get_scene" };
    const second: AiAgentActivity = { id: "message-2", kind: "message", channel: "message", status: "done", title: "操作完成。", markdown: "操作完成。" };
    expect(removeFinalMessageActivity([first, tool, second], "先说明操作。\n\n操作完成。")).toEqual([tool]);
  });

  it("keeps earlier narration when only the final reply matches the summary", () => {
    const first: AiAgentActivity = { id: "message-1", kind: "message", channel: "message", status: "done", title: "先看看当前代码。", markdown: "先看看当前代码。" };
    const second: AiAgentActivity = { id: "message-2", kind: "message", channel: "message", status: "done", title: "修改完成。", markdown: "修改完成。" };
    expect(removeFinalMessageActivity([first, second], "修改完成。")).toEqual([first]);
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

  it("keeps reasoning from each Agent round in its own thinking panel", () => {
    const activities: AiAgentActivity[] = [
      { id: "message-1", kind: "message", channel: "message", status: "done", title: "先读取工程" },
      { id: "thinking-1", kind: "message", channel: "thinking", status: "done", title: "先检查当前代码。" },
      { id: "message-2", kind: "message", channel: "message", status: "running", title: "准备修改" },
      { id: "thinking-2", kind: "message", channel: "thinking", status: "running", title: "根据检查结果进行修改。" },
    ];

    const grouped = groupAgentActivities(activities);
    const thinking = grouped.filter((entry) => entry.kind === "activity" && entry.activity.channel === "thinking");

    expect(thinking).toHaveLength(2);
    expect(thinking.map((entry) => entry.kind === "activity" ? entry.activity.id : entry.id))
      .toEqual(["thinking-1", "thinking-2"]);
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

  it("does not run a queued auto-scroll after the user leaves the latest message", () => {
    const thread = { scrollTop: 180, scrollHeight: 900 };
    expect(scrollThreadToLatest(thread, false)).toBe(false);
    expect(thread.scrollTop).toBe(180);
  });

  it("keeps following new content while the user remains at the latest message", () => {
    const thread = { scrollTop: 650, scrollHeight: 900 };
    expect(scrollThreadToLatest(thread, true)).toBe(true);
    expect(thread.scrollTop).toBe(900);
  });

  it("uses a non-passive wheel listener before preventing native scrolling", () => {
    let listener: ((event: WheelEvent) => void) | undefined;
    const thread = {
      scrollTop: 100,
      scrollHeight: 600,
      clientHeight: 200,
      addEventListener: vi.fn((_type: string, callback: (event: WheelEvent) => void) => { listener = callback; }),
      removeEventListener: vi.fn(),
    };
    const onLeaveLatest = vi.fn();
    const cleanup = attachAiThreadWheelHandler(thread, onLeaveLatest);
    const event = { deltaY: 50, deltaMode: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as WheelEvent;

    expect(thread.addEventListener).toHaveBeenCalledWith("wheel", expect.any(Function), { passive: false });
    listener?.(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(thread.scrollTop).toBe(150);
    expect(onLeaveLatest).toHaveBeenCalledOnce();
    cleanup();
    expect(thread.removeEventListener).toHaveBeenCalledWith("wheel", expect.any(Function));
  });

  it("keeps wheel input at the bottom instead of escaping to the outer page", () => {
    let listener: ((event: WheelEvent) => void) | undefined;
    const thread = {
      scrollTop: 400,
      scrollHeight: 600,
      clientHeight: 200,
      addEventListener: vi.fn((_type: string, callback: (event: WheelEvent) => void) => { listener = callback; }),
      removeEventListener: vi.fn(),
    };
    const onLeaveLatest = vi.fn();
    attachAiThreadWheelHandler(thread, onLeaveLatest);
    const event = { deltaY: 80, deltaMode: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as WheelEvent;

    listener?.(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(thread.scrollTop).toBe(400);
    expect(onLeaveLatest).not.toHaveBeenCalled();
  });

  it("scrolls the expanded thinking content before the outer AI thread", () => {
    let listener: ((event: WheelEvent) => void) | undefined;
    const thread = {
      scrollTop: 100,
      scrollHeight: 600,
      clientHeight: 200,
      addEventListener: vi.fn((_type: string, callback: (event: WheelEvent) => void) => { listener = callback; }),
      removeEventListener: vi.fn(),
    };
    const thinkingContent = { scrollTop: 30, scrollHeight: 500, clientHeight: 120 };
    const eventTarget = { closest: vi.fn(() => thinkingContent) };
    const event = { deltaY: 50, deltaMode: 0, target: eventTarget, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as WheelEvent;

    attachAiThreadWheelHandler(thread, vi.fn());
    listener?.(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(thinkingContent.scrollTop).toBe(80);
    expect(thread.scrollTop).toBe(100);
  });

  it("lets the outer AI thread take over when thinking content reaches its edge", () => {
    let listener: ((event: WheelEvent) => void) | undefined;
    const thread = {
      scrollTop: 100,
      scrollHeight: 600,
      clientHeight: 200,
      addEventListener: vi.fn((_type: string, callback: (event: WheelEvent) => void) => { listener = callback; }),
      removeEventListener: vi.fn(),
    };
    const thinkingContent = { scrollTop: 380, scrollHeight: 500, clientHeight: 120 };
    const eventTarget = { closest: vi.fn(() => thinkingContent) };
    const event = { deltaY: 50, deltaMode: 0, target: eventTarget, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as WheelEvent;

    attachAiThreadWheelHandler(thread, vi.fn());
    listener?.(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(thinkingContent.scrollTop).toBe(380);
    expect(thread.scrollTop).toBe(100);
  });
});

describe("AI assistant conversation persistence", () => {
  it("merges legacy mode conversations into one project conversation space", () => {
    const merged = mergeAiConversationStates(
      { activeId: "project", conversations: [{ id: "project", title: "新对话", createdAt: 3, updatedAt: 3, runs: [] }] },
      [
        { activeId: "code", conversations: [{ id: "code", title: "纯代码", createdAt: 1, updatedAt: 1, runs: [{ id: 1, prompt: "检查代码", mode: "agent", status: "done", activities: [] }] }] },
        { activeId: "visual", conversations: [{ id: "visual", title: "图形化", createdAt: 2, updatedAt: 2, runs: [{ id: 2, prompt: "创建积木", mode: "agent", status: "done", activities: [] }] }] },
      ],
    );

    expect(merged.conversations.map((conversation) => conversation.id)).toEqual(["code", "visual"]);
    expect(merged.activeId).toBe("visual");
  });

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

  it("persists completed and queued runs but skips rapidly changing running runs", () => {
    expect(shouldPersistConversationRuns([{ status: "done" }, { status: "queued" }])).toBe(true);
    expect(shouldPersistConversationRuns([{ status: "done" }, { status: "running" }])).toBe(false);
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

  it("heals stored runs whose streamed reply duplicates the final response", () => {
    const reply = "你好！我是 Visual Python 内置的编程智能体。";
    const raw = `${reply}\n\n<!-- visual-python-followups: [{"label":"示例","prompt":"做个示例"}] -->`;
    const runs = parseStoredRuns([{
      id: 1,
      prompt: "你好",
      mode: "agent",
      status: "done",
      activities: [{ id: "message-1", kind: "message", channel: "message", status: "done", title: raw, markdown: raw }],
      result: { summary: reply },
    }]);

    expect(runs).toHaveLength(1);
    expect(runs[0].activities).toEqual([]);
  });

  it("tolerates malformed stored activities while healing duplicates", () => {
    const runs = parseStoredRuns([{
      id: 1,
      prompt: "你好",
      status: "done",
      activities: [null, "损坏数据"],
      result: { summary: "你好" },
    }]);

    expect(runs).toHaveLength(1);
    expect(runs[0].activities).toHaveLength(2);
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
