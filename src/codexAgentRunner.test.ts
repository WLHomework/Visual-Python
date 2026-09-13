import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRunResult, RunVisualPythonAgentArgs } from "./agentV2/types";
import { CodexAgentUnavailableError } from "./codexAgent";
import { runAgentWithProtocolFallback } from "./codexAgentRunner";

const protocolMocks = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("./aiConfig", async () => {
  const actual = await vi.importActual<typeof import("./aiConfig")>("./aiConfig");
  return {
    ...actual,
    getAiModelConfig: () => ({ baseUrl: "https://custom.example/v1", model: "test-model" }),
  };
});

vi.mock("./aiProtocol", async () => {
  const actual = await vi.importActual<typeof import("./aiProtocol")>("./aiProtocol");
  return { ...actual, selectAiProviderProtocol: protocolMocks.select };
});

const result: AgentRunResult = {
  summary: "完成",
  toolCallCount: 0,
  tokenUsage: {
    prompt: 0,
    completion: 0,
    total: 0,
    requests: 0,
    rounds: 0,
    inputCharacters: 0,
    toolSchemaCharacters: 0,
    toolResultCharacters: 0,
    cached: 0,
    uncachedPrompt: 0,
    cacheCreation: 0,
    cacheReportedRequests: 0,
  },
};

const args = { signal: new AbortController().signal } as RunVisualPythonAgentArgs;

describe("runAgentWithProtocolFallback", () => {
  beforeEach(() => {
    protocolMocks.select.mockReturnValue({ protocol: "unknown", source: "probe" });
  });

  it("uses the Codex Agent as the default entry for an unknown provider", async () => {
    const codex = vi.fn().mockResolvedValue(result);
    const chatCompletions = vi.fn().mockResolvedValue(result);

    await expect(runAgentWithProtocolFallback(args, { codex, chatCompletions })).resolves.toBe(result);

    expect(codex).toHaveBeenCalledWith(args);
    expect(chatCompletions).not.toHaveBeenCalled();
  });

  it("routes a cached Chat Completions provider directly to the Chat Completions Agent", async () => {
    protocolMocks.select.mockReturnValue({ protocol: "chat-completions", source: "cache" });
    const codex = vi.fn().mockResolvedValue(result);
    const chatCompletions = vi.fn().mockResolvedValue(result);

    await expect(runAgentWithProtocolFallback(args, { codex, chatCompletions })).resolves.toBe(result);

    expect(codex).not.toHaveBeenCalled();
    expect(chatCompletions).toHaveBeenCalledWith(args);
  });

  it("falls back when Responses cannot keep always-on thinking enabled", async () => {
    const codex = vi.fn().mockRejectedValue(new CodexAgentUnavailableError("AI 请求失败（HTTP 400）：该模型始终思考，不支持关闭思考；请使用 low、high 或 max。"));
    const chatCompletions = vi.fn().mockResolvedValue(result);
    const onFallback = vi.fn();

    await expect(runAgentWithProtocolFallback(args, { codex, chatCompletions, onFallback })).resolves.toBe(result);

    expect(codex).toHaveBeenCalledWith(args);
    expect(chatCompletions).toHaveBeenCalledWith(args);
    expect(onFallback).toHaveBeenCalledWith(expect.any(CodexAgentUnavailableError));
  });

  it("falls back when the Responses endpoint is unsupported", async () => {
    const codex = vi.fn().mockRejectedValue(new CodexAgentUnavailableError("AI 请求失败（HTTP 404）：Not support"));
    const chatCompletions = vi.fn().mockResolvedValue(result);
    const onFallback = vi.fn();

    await expect(runAgentWithProtocolFallback(args, { codex, chatCompletions, onFallback })).resolves.toBe(result);

    expect(codex).toHaveBeenCalledWith(args);
    expect(chatCompletions).toHaveBeenCalledWith(args);
    expect(onFallback).toHaveBeenCalledWith(expect.any(CodexAgentUnavailableError));
  });

  it("falls back when the current workspace requires the Chat Completions Agent", async () => {
    const codex = vi.fn().mockRejectedValue(new CodexAgentUnavailableError("当前工作区使用 Chat Completions Agent", undefined, true));
    const chatCompletions = vi.fn().mockResolvedValue(result);

    await expect(runAgentWithProtocolFallback(args, { codex, chatCompletions })).resolves.toBe(result);

    expect(chatCompletions).toHaveBeenCalledWith(args);
  });

  it("preserves a Responses parameter error instead of masking it with a legacy stream error", async () => {
    const failure = new CodexAgentUnavailableError("AI 请求失败（HTTP 400）：Unsupported parameter reasoning.effort");
    const codex = vi.fn().mockRejectedValue(failure);
    const chatCompletions = vi.fn().mockResolvedValue(result);

    await expect(runAgentWithProtocolFallback(args, { codex, chatCompletions })).rejects.toBe(failure);

    expect(chatCompletions).not.toHaveBeenCalled();
  });

  it("preserves an App Server execution error instead of trying an incompatible protocol", async () => {
    const failure = new CodexAgentUnavailableError("Codex Agent 执行失败：响应事件格式无效");
    const codex = vi.fn().mockRejectedValue(failure);
    const chatCompletions = vi.fn().mockResolvedValue(result);

    await expect(runAgentWithProtocolFallback(args, { codex, chatCompletions })).rejects.toBe(failure);

    expect(chatCompletions).not.toHaveBeenCalled();
  });

  it("does not fall back after a real execution failure", async () => {
    const failure = new Error("编辑后验证失败");
    const codex = vi.fn().mockRejectedValue(failure);
    const chatCompletions = vi.fn().mockResolvedValue(result);

    await expect(runAgentWithProtocolFallback(args, { codex, chatCompletions })).rejects.toBe(failure);
    expect(chatCompletions).not.toHaveBeenCalled();
  });

  it("does not fall back when the user interrupts the turn", async () => {
    const controller = new AbortController();
    controller.abort();
    const interrupted = new CodexAgentUnavailableError("任务已停止");
    const codex = vi.fn().mockRejectedValue(interrupted);
    const chatCompletions = vi.fn().mockResolvedValue(result);

    await expect(runAgentWithProtocolFallback({ ...args, signal: controller.signal }, { codex, chatCompletions })).rejects.toBe(interrupted);
    expect(chatCompletions).not.toHaveBeenCalled();
  });
});
