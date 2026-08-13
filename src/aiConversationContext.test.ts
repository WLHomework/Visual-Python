import { describe, expect, it } from "vitest";
import { buildAiConversationHistory, createAiConversationScope } from "./aiConversationContext";

describe("AI conversation context", () => {
  it("isolates the same scene id between different projects", () => {
    expect(createAiConversationScope("project-a", "scene-main")).not.toBe(
      createAiConversationScope("project-b", "scene-main"),
    );
  });

  it("keeps useful evidence from completed agent runs", () => {
    const history = buildAiConversationHistory([{
      id: 1,
      prompt: "画一个圆",
      status: "done",
      result: { summary: "已修改代码" },
      activities: [
        { id: "edit", kind: "tool", status: "done", title: "修改代码", toolName: "edit_code", codeChange: { before: "a", after: "b" } },
        { id: "check", kind: "tool", status: "error", title: "检查代码", toolName: "check_code", detail: "第 4 行缩进错误", result: "{\"valid\":false}" },
      ],
    }]);

    expect(history).toHaveLength(1);
    expect(history[0].assistant).toContain("已修改代码");
    expect(history[0].assistant).toContain("检查代码");
    expect(history[0].assistant).toContain("第 4 行缩进错误");
  });

  it("preserves clarification turns for semantic routing", () => {
    const history = buildAiConversationHistory([{
      id: 2,
      prompt: "做一个动画",
      status: "done",
      result: { summary: "需要选择动画风格", clarification: { question: "选择风格", options: ["简洁", "详细"] } },
      activities: [],
    }]);

    expect(history[0].clarification).toBe(true);
  });

  it("keeps failed runs so the next turn can repair the reported problem", () => {
    const history = buildAiConversationHistory([{
      id: 3,
      prompt: "渲染当前动画",
      status: "error",
      error: "Manim 渲染失败：没有找到场景类",
      activities: [{
        id: "render-error",
        kind: "tool",
        status: "error",
        title: "渲染动画",
        toolName: "render_manim",
        detail: "没有找到场景类",
      }],
    }]);

    expect(history).toHaveLength(1);
    expect(history[0].assistant).toContain("没有找到场景类");
  });
});
