import { describe, expect, it, vi } from "vitest";
import { runAgentCore } from "./agentCore";
import type { AgentModelTransport } from "./agentTransport";

const systemPromptFor = async (snapshot: Record<string, unknown>): Promise<string> => {
  const runTurn = vi.fn().mockResolvedValue({ content: "完成", toolCalls: [], model: "test-model", totalTokens: 4 });
  const transport: AgentModelTransport = { runTurn };

  await runAgentCore({
    prompt: "让板载灯闪烁",
    host: { getSnapshot: () => snapshot, getTools: () => [], executeTool: vi.fn() },
    onEvent: vi.fn(),
    signal: new AbortController().signal,
    transport,
  });

  const [messages] = runTurn.mock.calls[0] as unknown as [Array<{ role: string; content: string }>];
  return messages.find((message) => message.role === "system")?.content ?? "";
};

describe("update_task_plan 工具", () => {
  it("registers the checklist, streams it via progress and reports it in the result", async () => {
    const runTurn = vi.fn()
      .mockResolvedValueOnce({
        content: "",
        toolCalls: [{ id: "call-1", type: "function", function: { name: "update_task_plan", arguments: JSON.stringify({ steps: [
          { step: "读取当前代码", status: "completed" },
          { step: "写入闪烁积木", status: "in_progress" },
          { step: "验证生成代码", status: "pending" },
        ] }) } }],
        model: "test-model",
        totalTokens: 4,
      })
      .mockResolvedValueOnce({ content: "任务完成", toolCalls: [], model: "test-model", totalTokens: 4 });
    const progress: Array<{ phase: string; taskPlan?: Array<{ step: string; status: string }> }> = [];
    const result = await runAgentCore({
      prompt: "做一个复杂任务",
      host: { getSnapshot: () => ({ workspaceMode: "code" }), getTools: () => [], executeTool: vi.fn() },
      onEvent: vi.fn(),
      onProgress: (value) => progress.push(value),
      signal: new AbortController().signal,
      transport: { runTurn },
    });

    const withPlan = progress.filter((value) => value.taskPlan?.length);
    expect(withPlan.length).toBeGreaterThan(0);
    expect(withPlan[0].taskPlan).toHaveLength(3);
    expect(withPlan[0].taskPlan?.[0]).toEqual({ step: "读取当前代码", status: "completed" });
    expect(result.taskPlan).toHaveLength(3);
    // 工具结果回喂给模型，且没有走 host.executeTool（工具由核心内处理）。
    const secondCall = runTurn.mock.calls[1] as unknown as [Array<{ role: string; content: string }>];
    expect(secondCall[0].some((message) => message.role === "tool" && message.content.includes("写入闪烁积木"))).toBe(true);
  });

  it("rejects invalid steps and feeds the error back to the model", async () => {
    const runTurn = vi.fn()
      .mockResolvedValueOnce({
        content: "",
        toolCalls: [{ id: "call-1", type: "function", function: { name: "update_task_plan", arguments: JSON.stringify({ steps: [{ status: "pending" }] }) } }],
        model: "test-model",
        totalTokens: 4,
      })
      .mockResolvedValueOnce({ content: "收到", toolCalls: [], model: "test-model", totalTokens: 4 });
    const result = await runAgentCore({
      prompt: "做一个复杂任务",
      host: { getSnapshot: () => ({ workspaceMode: "code" }), getTools: () => [], executeTool: vi.fn() },
      onEvent: vi.fn(),
      signal: new AbortController().signal,
      transport: { runTurn },
    });

    expect(result.taskPlan).toBeUndefined();
    const secondCall = runTurn.mock.calls[1] as unknown as [Array<{ role: string; content: string }>];
    expect(secondCall[0].some((message) => message.role === "tool" && message.content.includes("steps 至少需要一条有效"))).toBe(true);
  });
});

describe("MicroPython 工作台提示词", () => {
  it("uses code-first graphical writing with the tree as fallback", async () => {
    const prompt = await systemPromptFor({ workspaceMode: "visual", workbench: { kind: "micropython", label: "ESP32-S3" } });

    expect(prompt).toContain("当前工具箱");
    expect(prompt).toContain("图形化写入默认代码优先");
    expect(prompt).toContain("apply_python_as_blocks");
    expect(prompt).toContain("apply_block_program");
    expect(prompt).not.toContain("apply_block_plan");
    expect(prompt).toContain("跨工作台请求必须明确拒绝");
    expect(prompt).toContain("禁止虚构结果");
  });

  it("纯 Python 工作台不附加硬件提示词", async () => {
    const prompt = await systemPromptFor({ workspaceMode: "code", workbench: { kind: "python", label: "Python" } });

    expect(prompt).not.toContain("当前是 MicroPython 硬件工作台");
  });
});
