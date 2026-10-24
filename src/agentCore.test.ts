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
