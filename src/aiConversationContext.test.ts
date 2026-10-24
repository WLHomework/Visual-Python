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

  it("keeps stopped runs with their partial work so the next turn can continue safely", () => {
    const history = buildAiConversationHistory([{
      id: 6,
      prompt: "做一个呼吸灯",
      status: "stopped",
      activities: [
        { id: "write", kind: "tool", status: "done", title: "应用积木程序", toolName: "apply_python_as_blocks", result: "{\"ok\":true,\"changed\":true,\"blockCount\":12}" },
        { id: "interrupted", kind: "tool", status: "stopped", title: "检查代码", toolName: "check_code" },
      ],
    }]);

    expect(history).toHaveLength(1);
    expect(history[0].assistant).toContain("任务被用户停止");
    expect(history[0].assistant).toContain("已写入：应用积木程序");
    expect(history[0].assistant).toContain("积木 12 块");
  });

  it("records successful graphical writes as evidence for cross-turn edits", () => {
    const history = buildAiConversationHistory([{
      id: 7,
      prompt: "生成动画积木",
      status: "done",
      result: { summary: "已生成" },
      activities: [
        { id: "tree", kind: "tool", status: "done", title: "应用积木程序", toolName: "apply_block_program", result: "{\"ok\":true,\"changed\":true,\"blockCount\":45,\"fallbackCount\":2}" },
        { id: "read", kind: "tool", status: "done", title: "读取工作区", toolName: "get_workspace", result: "{\"blockCount\":45}" },
      ],
    }]);

    expect(history[0].assistant).toContain("已写入：应用积木程序");
    expect(history[0].assistant).toContain("积木 45 块");
    expect(history[0].assistant).toContain("原始语句回退 2 条");
    // 只读工具不进入证据，避免噪音。
    expect(history[0].assistant).not.toContain("读取工作区");
  });

  it("keeps same-session image payloads but only describes restored images", () => {
    const sendable = {
      id: "live",
      name: "live.png",
      mimeType: "image/png" as const,
      width: 100,
      height: 80,
      sourceBytes: 20,
      dataUrl: "data:image/jpeg;base64,private",
      sendable: true,
    };
    const restored = { ...sendable, id: "restored", name: "restored.png", dataUrl: undefined, sendable: false };
    const history = buildAiConversationHistory([
      { id: 4, prompt: "修改图片中的布局", status: "done", result: { summary: "完成" }, activities: [{ id: "done", kind: "message", status: "done", title: "完成" }], attachments: [sendable] },
      { id: 5, prompt: "继续处理", status: "done", result: { summary: "完成" }, activities: [{ id: "done", kind: "message", status: "done", title: "完成" }], attachments: [restored] },
    ]);

    expect(history[0].attachments?.[0].dataUrl).toBe("data:image/jpeg;base64,private");
    expect(history[1].attachments).toBeUndefined();
    expect(history[1].user).toContain("restored.png");
    expect(JSON.stringify(history[1])).not.toContain("private");
  });
});
