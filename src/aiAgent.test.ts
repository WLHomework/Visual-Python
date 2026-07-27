import { describe, expect, it } from "vitest";
import {
  aiAgentFunctionTools,
  applyExactCodeEdits,
  createCodeChangePreview,
  createAiAgentMessages,
  createConversationMemory,
  extractStreamingAgentMessage,
  extractStreamingJsonString,
  extractVisibleAgentContent,
  hasDsmlToolMarkup,
  isFunctionCallingUnsupportedError,
  parseAiAgentDecision,
  parseNativeToolCall,
  restoreMissingBaseIndent,
  userExplicitlyForbidsRender,
  userExplicitlyRequestedRun,
  userExplicitlyRequestedWholeFileRewrite,
} from "./aiAgent";

describe("AI code agent protocol", () => {
  it("only exposes tools for autonomous Python project work", () => {
    const names = aiAgentFunctionTools.map((tool) => tool.function.name);
    expect(names).toContain("get_context");
    expect(names).toEqual(expect.arrayContaining(["list_scenes", "get_scene", "switch_scene", "create_scene", "rename_scene", "delete_scene"]));
    expect(names).toContain("replace_code");
    expect(names).toContain("edit_code");
    expect(names).toContain("check_code");
    expect(names).toEqual(expect.arrayContaining(["validate_scene", "list_resources", "get_resource", "check_resources", "check_dependencies", "install_dependencies", "inspect_rendered_video"]));
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
    expect(messages[1]).toEqual({ role: "user", content: "创建一个 Manim 场景" });
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

  it("lets the agent render autonomously unless the user forbids it", () => {
    expect(userExplicitlyForbidsRender("帮我制作一个圆形移动动画")).toBe(false);
    expect(userExplicitlyForbidsRender("帮我渲染这个动画并生成视频")).toBe(false);
    expect(userExplicitlyForbidsRender("不要渲染，只修改代码")).toBe(true);
    expect(userExplicitlyForbidsRender("modify it without rendering")).toBe(true);
    expect(createAiAgentMessages("制作一个动画", "fallback")[0].content).toContain('"name":"render_manim"');
    expect(createAiAgentMessages("制作并渲染动画", "fallback")[0].content).toContain('"name":"render_manim"');
    expect(createAiAgentMessages("不要渲染，只修改代码", "fallback")[0].content).not.toContain('"name":"render_manim"');
  });

  it("only enables project execution for explicit user requests", () => {
    expect(userExplicitlyRequestedRun("修改代码并检查语法")).toBe(false);
    expect(userExplicitlyRequestedRun("修改后运行项目")).toBe(true);
    expect(userExplicitlyRequestedRun("不要运行，只修改代码")).toBe(false);
    expect(userExplicitlyRequestedRun("do not run the project")).toBe(false);
    expect(createAiAgentMessages("制作一个动画", "fallback")[0].content).not.toContain('"name":"run_project"');
    expect(createAiAgentMessages("制作并运行这个动画", "fallback")[0].content).toContain('"name":"run_project"');
  });

  it("reserves whole-file replacement for empty or explicitly rewritten files", () => {
    expect(userExplicitlyRequestedWholeFileRewrite("把圆改成红色")).toBe(false);
    expect(userExplicitlyRequestedWholeFileRewrite("完全重写整个代码文件")).toBe(true);
    expect(userExplicitlyRequestedWholeFileRewrite("rewrite the entire file")).toBe(true);
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

  it("recognizes providers that reject function calling", () => {
    expect(isFunctionCallingUnsupportedError("HTTP 400: unknown parameter tools")).toBe(true);
    expect(isFunctionCallingUnsupportedError("network timeout")).toBe(false);
  });
});
