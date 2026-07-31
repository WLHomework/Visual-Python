import { describe, expect, it } from "vitest";
import {
  aiAgentFunctionTools,
  applyExactCodeEdits,
  compactStaleAiAgentContext,
  createCodeChangePreview,
  createAiAgentMessages,
  createAiAgentRouterMessages,
  createAiExecutionSnapshot,
  createConversationMemory,
  estimateAiAgentMessageCharacters,
  extractStreamingAgentMessage,
  extractStreamingJsonString,
  extractVisibleAgentContent,
  formatAiClarification,
  getAiAgentFunctionTools,
  hasDsmlToolMarkup,
  hasUnexecutedAiToolIntent,
  isFunctionCallingUnsupportedError,
  mergeAiAgentTokenUsage,
  normalizeAiAgentRouteDecision,
  normalizeAiAgentTaskPlan,
  normalizeAiClarification,
  parseAiAgentDecision,
  parseNativeToolCall,
  restoreMissingBaseIndent,
  requiresAiAgentPermission,
} from "./aiAgent";

describe("AI code agent protocol", () => {
  it("only exposes tools for autonomous Python project work", () => {
    const names = aiAgentFunctionTools.map((tool) => tool.function.name);
    expect(names).toContain("ask_user");
    expect(names).toContain("get_context");
    expect(names).toContain("update_task_plan");
    expect(names).toEqual(expect.arrayContaining(["list_scenes", "get_scene", "switch_scene", "create_scene", "rename_scene", "delete_scene"]));
    expect(names).toContain("replace_code");
    expect(names).toContain("edit_code");
    expect(names).toContain("check_code");
    expect(names).toEqual(expect.arrayContaining(["validate_scene", "list_resources", "get_resource", "check_resources", "check_dependencies", "install_dependencies", "inspect_rendered_output"]));
    expect(names).toContain("run_project");
    expect(names).toContain("inspect_python_structure");
    expect(names).toContain("insert_statements");
    expect(names).toContain("replace_function_body");
    expect(names).toContain("add_import");
    expect(names).toContain("get_voiceover_context");
    expect(names).toContain("add_voiceover");
    expect(names).toContain("add_synchronized_voiceover");
    expect(names).toContain("check_voiceover");
    expect(names).not.toContain("modify_workspace");
    expect(names).not.toContain("explore_blocks");
    const renderTool = aiAgentFunctionTools.find((tool) => tool.function.name === "render_manim");
    expect(renderTool?.function.parameters).toMatchObject({ properties: { outputType: { enum: ["video", "image"] }, transparentBackground: { type: "boolean" }, imageWidth: { minimum: 64, maximum: 8192 }, imageHeight: { minimum: 64, maximum: 8192 }, imageCaptureMode: { enum: ["final", "animation"] }, imageAnimationStep: { minimum: 1, maximum: 10_000 } } });
  });

  it("does not require presentation summaries for code and voiceover edits", () => {
    for (const name of ["replace_code", "edit_code", "insert_statements", "replace_function_body", "add_import", "add_voiceover", "add_synchronized_voiceover"]) {
      const tool = aiAgentFunctionTools.find((item) => item.function.name === name);
      const required = (tool?.function.parameters as { required?: string[] }).required ?? [];
      expect(required).not.toContain("summary");
    }
  });

  it("instructs the model to read, edit and validate real Python code", () => {
    const messages = createAiAgentMessages("创建一个 Manim 场景");
    expect(messages[0].content).toContain("纯代码模式");
    expect(messages[0].content).toContain("get_context");
    expect(messages[0].content).toContain("check_code");
    expect(messages[0].content).toContain("list_scenes");
    expect(messages[0].content).toContain("sceneId");
    expect(messages[0].content).toContain("每个原始任务最多询问一次");
    expect(messages[1]).toEqual({ role: "user", content: "创建一个 Manim 场景" });
  });

  it("asks the model for a semantic route with bounded conversation context", () => {
    const messages = createAiAgentRouterMessages("继续", [{ user: "把圆改成蓝色", assistant: "要现在修改吗？", clarification: true }]);
    expect(messages[0].content).toContain("不根据固定关键词做机械匹配");
    expect(messages[0].content).toContain("route_request");
    expect(messages).toEqual(expect.arrayContaining([
      { role: "user", content: "把圆改成蓝色" },
      { role: "assistant", content: "要现在修改吗？" },
    ]));
    expect(messages.at(-1)).toEqual({ role: "user", content: "继续" });
  });

  it("normalizes model routes into strict capability boundaries", () => {
    expect(normalizeAiAgentRouteDecision({
      intent: "execute", requiredActions: ["mutation"], allowRun: false, renderPolicy: "auto",
      allowWholeFileRewrite: false, allowClarification: true, response: "ignored",
    })).toEqual({
      intent: "execute", requiredActions: ["mutation"], allowRun: false, renderPolicy: "auto",
      allowWholeFileRewrite: false, allowClarification: true, response: "",
    });
    expect(normalizeAiAgentRouteDecision({
      intent: "inspect", requiredActions: ["mutation", "run"], allowRun: true, renderPolicy: "auto",
      allowWholeFileRewrite: true, allowClarification: true, response: "ignored",
    })).toEqual({
      intent: "inspect", requiredActions: [], allowRun: false, renderPolicy: "forbid",
      allowWholeFileRewrite: false, allowClarification: false, response: "",
    });
    expect(() => normalizeAiAgentRouteDecision({
      intent: "chat", requiredActions: [], allowRun: false, renderPolicy: "forbid",
      allowWholeFileRewrite: false, allowClarification: false, response: "",
    })).toThrow("完整回复");
    expect(() => normalizeAiAgentRouteDecision({
      intent: "execute", requiredActions: [], allowRun: false, renderPolicy: "auto",
      allowWholeFileRewrite: false, allowClarification: false, response: "",
    })).toThrow("requiredActions");
  });

  it("does not expose project tools during ordinary conversation", () => {
    expect(getAiAgentFunctionTools("agent", true, true, true, true, "chat")).toEqual([]);
    const inspectTools = getAiAgentFunctionTools("agent", true, true, true, true, "inspect").map((tool) => tool.function.name);
    expect(inspectTools).toContain("get_context");
    expect(inspectTools).toContain("check_code");
    expect(inspectTools).not.toContain("edit_code");
    expect(inspectTools).not.toContain("render_manim");
    const chatSystem = createAiAgentMessages("你好", "fallback", false, false, [], false, false, "agent", "chat")[0].content;
    expect(chatSystem).toContain("当前请求是普通对话");
    expect(chatSystem).toContain("可用工具：[]");
  });

  it("limits Plan mode to project inspection tools", () => {
    const names = getAiAgentFunctionTools("plan").map((tool) => tool.function.name);
    expect(names).toEqual(expect.arrayContaining(["get_context", "list_scenes", "get_scene", "inspect_python_structure", "check_code", "validate_scene"]));
    for (const name of ["update_task_plan", "edit_code", "replace_code", "create_scene", "switch_scene", "run_project", "render_manim", "install_dependencies", "save_project"]) {
      expect(names).not.toContain(name);
    }

    const system = createAiAgentMessages("重构当前动画", "fallback", true, true, [], true, true, "plan")[0].content;
    expect(system).toContain("当前处于 Plan 模式");
    expect(system).toContain("禁止修改、创建、删除、重命名或切换场景");
    expect(system).toContain('"name":"get_context"');
    expect(system).not.toContain('"name":"edit_code"');
    expect(system).not.toContain('"name":"render_manim"');
  });

  it("formats clarification choices as a numbered list", () => {
    const clarification = normalizeAiClarification({
      question: "这段动画主要讲解什么？",
      options: ["斜率与截距", "函数图像变化"],
    });
    expect(clarification).toEqual({
      question: "这段动画主要讲解什么？",
      options: ["斜率与截距", "函数图像变化", "由 AI 决定"],
    });
    expect(formatAiClarification(clarification)).toBe([
      "这段动画主要讲解什么？",
      "",
      "1. 斜率与截距",
      "2. 函数图像变化",
      "3. 由 AI 决定",
      "",
      "请回复序号，也可以直接补充要求。",
    ].join("\n"));
  });

  it("validates compact task plan progress", () => {
    expect(normalizeAiAgentTaskPlan([
      { step: "读取代码结构", status: "completed" },
      { step: "修改动画", status: "in_progress" },
      { step: "验证场景", status: "pending" },
    ])).toEqual([
      { step: "读取代码结构", status: "completed" },
      { step: "修改动画", status: "in_progress" },
      { step: "验证场景", status: "pending" },
    ]);
    expect(() => normalizeAiAgentTaskPlan([
      { step: "修改动画", status: "pending" },
      { step: "验证场景", status: "pending" },
    ])).toThrow("只能有一个进行中步骤");
    expect(() => normalizeAiAgentTaskPlan([
      { step: "修改动画", status: "in_progress" },
      { step: "修改动画", status: "pending" },
    ])).toThrow("不能包含重复步骤");
  });

  it("uses the semantic route to control clarification availability", () => {
    expect(createAiAgentMessages("制作一个教学动画", "fallback")[0].content).toContain('"name":"ask_user"');
    expect(createAiAgentMessages("你决定直接做", "fallback", true, false, [], true, false)[0].content).not.toContain('"name":"ask_user"');
  });

  it("includes bounded conversation history before the current request", () => {
    const history = Array.from({ length: 14 }, (_, index) => ({
      user: `用户指令 ${index}`,
      assistant: `完成结果 ${index}`,
    }));
    const messages = createAiAgentMessages("把刚才的圆改成红色", "native", true, false, history);
    expect(messages[1].role).toBe("system");
    expect(messages[1].content).toContain("用户指令 0");
    expect(messages[2]).toEqual({ role: "user", content: "用户指令 6" });
    expect(messages.at(-3)).toEqual({ role: "user", content: "用户指令 13" });
    expect(messages.at(-2)).toEqual({ role: "assistant", content: "完成结果 13" });
    expect(messages.at(-1)).toEqual({ role: "user", content: "把刚才的圆改成红色" });
  });

  it("compresses older conversation turns into bounded scene memory", () => {
    const history = Array.from({ length: 30 }, (_, index) => ({ user: `需求 ${index}`, assistant: `结果 ${index}` }));
    const memory = createConversationMemory(history);
    expect(memory).not.toContain("需求 0");
    expect(memory).toContain("需求 6");
    expect(memory).toContain("结果 29");
    expect(memory.length).toBeLessThan(25_000);
  });

  it("removes stale source and completed mutation payloads without breaking native tool pairs", () => {
    const source = "from manim import *\nclass Demo(Scene):\n    pass\n";
    const messages = compactStaleAiAgentContext([
      { role: "assistant", content: "", toolCalls: [{ id: "context-1", type: "function", function: { name: "get_context", arguments: "{}" } }] },
      { role: "tool", toolCallId: "context-1", content: JSON.stringify({ ok: true, project: { name: "Demo" }, code: source }) },
      { role: "assistant", content: "修改场景", toolCalls: [{ id: "edit-1", type: "function", function: { name: "edit_code", arguments: JSON.stringify({ summary: "添加圆形", edits: [{ oldText: source, newText: `${source}# changed` }] }) } }] },
      { role: "tool", toolCallId: "edit-1", content: JSON.stringify({ ok: true, changed: true }) },
    ], { project: { name: "Demo" }, code: `${source}# changed` }, 1);

    expect(messages[1].role).toBe("tool");
    expect(messages[1].toolCallId).toBe("context-1");
    expect(messages[1].content).toContain('"stale":true');
    expect(messages[1].content).not.toContain("from manim");
    expect(messages[2].toolCalls?.[0].function.arguments).toContain('"historyCompacted":true');
    expect(messages[2].toolCalls?.[0].function.arguments).not.toContain("from manim");
  });

  it("compacts stale source and mutation payloads in compatibility mode", () => {
    const messages = compactStaleAiAgentContext([
      { role: "user", content: `工具 get_context 执行结果：\n${JSON.stringify({ ok: true, code: "x".repeat(20_000) })}\n请根据结果继续完成原始任务。` },
      { role: "assistant", content: JSON.stringify({ message: "重写场景", tool: { name: "replace_code", arguments: { summary: "创建场景", code: "y".repeat(20_000) } } }) },
    ], { code: "z".repeat(10_000) }, 1);

    expect(messages[0].content.length).toBeLessThan(1000);
    expect(messages[0].content).toContain("重新调用 get_context");
    expect(messages[1].content.length).toBeLessThan(1000);
    expect(messages[1].content).toContain("historyCompacted");
  });

  it("accumulates provider-reported usage across requests", () => {
    const first = mergeAiAgentTokenUsage({ prompt: 0, completion: 0, total: 0, requests: 0 }, { promptTokens: 1000, completionTokens: 200, totalTokens: 1200 });
    const second = mergeAiAgentTokenUsage(first, { promptTokens: 1500, completionTokens: 300 });
    expect(second).toEqual({ prompt: 2500, completion: 500, total: 3000, requests: 2 });
    expect(estimateAiAgentMessageCharacters([{ role: "user", content: "12345" }])).toBeGreaterThanOrEqual(5);
  });

  it("lets the semantic route control autonomous rendering", () => {
    expect(createAiAgentMessages("制作一个动画", "fallback")[0].content).toContain('"name":"render_manim"');
    expect(createAiAgentMessages("不要渲染，只修改代码", "fallback", false)[0].content).not.toContain('"name":"render_manim"');
  });

  it("lets the semantic route control Python execution", () => {
    expect(createAiAgentMessages("制作一个动画", "fallback")[0].content).not.toContain('"name":"run_project"');
    expect(createAiAgentMessages("制作并运行这个动画", "fallback", true, true)[0].content).toContain('"name":"run_project"');
  });

  it("lets the semantic route reserve whole-file replacement", () => {
    expect(createAiAgentMessages("把圆改成红色", "fallback", true, false, [], false)[0].content).not.toContain('"name":"replace_code"');
    expect(createAiAgentMessages("完全重写整个代码文件", "fallback", true, false, [], true)[0].content).toContain('"name":"replace_code"');
  });

  it("parses compatibility decisions and rejects unknown tools", () => {
    expect(parseAiAgentDecision('{"message":"修改标题","tool":{"name":"edit_code","arguments":{"summary":"标题","edits":[]}}}')).toEqual({
      message: "修改标题",
      tool: { name: "edit_code", arguments: { summary: "标题", edits: [] } },
    });
    expect(() => parseAiAgentDecision('{"tool":{"name":"modify_workspace","arguments":{}}}')).toThrow("未知工具");
  });

  it("requires complete JSON for native tool arguments", () => {
    expect(parseNativeToolCall({ id: "call-1", type: "function", function: { name: "check_code", arguments: "{}" } })).toEqual({ name: "check_code", arguments: {} });
    expect(() => parseNativeToolCall({ id: "call-2", type: "function", function: { name: "replace_code", arguments: '{"code":"x"' } })).toThrow("不是完整 JSON");
  });

  it("applies exact edits sequentially and rejects ambiguous matches", () => {
    expect(applyExactCodeEdits("name = 'old'\nprint(name)\n", [
      { oldText: "'old'", newText: "'new'" },
      { oldText: "print(name)", newText: "print(name.upper())" },
    ])).toBe("name = 'new'\nprint(name.upper())\n");
    expect(() => applyExactCodeEdits("x = 1\nx = 1\n", [{ oldText: "x = 1", newText: "x = 2" }])).toThrow("匹配到 2 处");
    expect(applyExactCodeEdits("x = 1\nx = 1\n", [{ oldText: "x = 1", newText: "x = 2", replaceAll: true }])).toBe("x = 2\nx = 2\n");
  });

  it("restores an omitted base indent without changing explicit indentation", () => {
    expect(restoreMissingBaseIndent("        self.wait(1)", "self.play(FadeIn(dot))\nself.wait(2)"))
      .toBe("        self.play(FadeIn(dot))\n        self.wait(2)");
    expect(restoreMissingBaseIndent("        self.wait(1)", "        self.wait(2)"))
      .toBe("        self.wait(2)");
  });

  it("extracts streamed code and creates a readable change preview", () => {
    expect(extractStreamingJsonString('{"tool":{"arguments":{"code":"from manim import *\\nclass Demo(Scene):\\n    def construct(self):\\n        self.', "code"))
      .toBe("from manim import *\nclass Demo(Scene):\n    def construct(self):\n        self.");
    expect(createCodeChangePreview("x = 1\nprint(x)", "x = 2\nprint(x)")).toContain("- x = 1\n+ x = 2");
  });

  it("extracts concise streamed narration and hides DSML markup", () => {
    expect(extractStreamingAgentMessage('{"message":"正在检查\\n代码","tool":')).toBe("正在检查\n代码");
    expect(extractVisibleAgentContent('正在修改<｜DSML｜tool_calls>')).toBe("正在修改");
    expect(hasDsmlToolMarkup('<｜DSML｜tool_calls>')).toBe(true);
  });

  it("detects tool markup emitted as reply text for protocol compatibility", () => {
    const interruptedReply = '好的，我来为你创建二维直角坐标系。\n\n首先获取当前状态：\n```json\n{"action":"get_context"}\n```';
    expect(hasUnexecutedAiToolIntent(interruptedReply)).toBe(true);
    expect(hasUnexecutedAiToolIntent('{"tool":{"name":"edit_code","arguments":{}}}')).toBe(true);
    expect(hasUnexecutedAiToolIntent('这里仅介绍 get_context 的概念。')).toBe(false);
  });

  it("recognizes providers that reject function calling", () => {
    expect(isFunctionCallingUnsupportedError("HTTP 400: unknown parameter tools")).toBe(true);
    expect(isFunctionCallingUnsupportedError("network timeout")).toBe(false);
  });

  it("only confirms high-impact tools in confirmation mode", () => {
    for (const name of ["run_project", "render_manim", "install_dependencies", "delete_scene", "save_project"] as const) {
      expect(requiresAiAgentPermission("confirm", name)).toBe(true);
      expect(requiresAiAgentPermission("auto", name)).toBe(false);
    }
    expect(requiresAiAgentPermission("confirm", "get_context")).toBe(false);
    expect(requiresAiAgentPermission("confirm", "edit_code")).toBe(false);
    expect(requiresAiAgentPermission("confirm", "check_code")).toBe(false);
  });

  it("builds a compact live Manim execution snapshot", () => {
    const snapshot = createAiExecutionSnapshot("manim", {
      rendering: true,
      renderElapsedSeconds: 12,
      renderProgress: { scene: "Demo", label: "正在渲染动画 3", percent: 42 },
      output: [{ stream: "stderr", data: "\u001b[32mAnimation 2 42%\u001b[0m\n" }],
      problems: [],
      video: null,
    });
    expect(snapshot).toMatchObject({ kind: "manim", state: "running", label: "正在渲染动画 3", scene: "Demo", percent: 42, elapsedSeconds: 12 });
    expect(snapshot.output).toEqual([{ stream: "stderr", data: "Animation 2 42%" }]);
  });

  it("preserves a rendered image in the Manim execution snapshot", () => {
    const snapshot = createAiExecutionSnapshot("manim", {
      rendering: false,
      renderElapsedSeconds: 2,
      output: [],
      problems: [],
      renderOutput: { type: "image", scene: "Poster", path: "poster.png", transparentBackground: true },
    });
    expect(snapshot).toMatchObject({
      state: "completed",
      renderOutput: { type: "image", scene: "Poster", path: "poster.png", transparentBackground: true },
    });
  });

  it("preserves locatable execution problems without raw state JSON", () => {
    const snapshot = createAiExecutionSnapshot("python", {
      running: false,
      pythonElapsedSeconds: 3,
      output: [{ stream: "stderr", data: "Traceback\nValueError: bad value\n" }],
      problems: [{ kind: "runtime", line: 18, message: "bad value", suggestion: "检查输入" }],
    });
    expect(snapshot.state).toBe("failed");
    expect(snapshot.label).toBe("Python 运行失败");
    expect(snapshot.problems).toEqual([{ kind: "runtime", line: 18, message: "bad value", suggestion: "检查输入" }]);
  });
});
