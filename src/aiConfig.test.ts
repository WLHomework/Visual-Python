import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));

import { defaultAiModelConfig, getAiAgentPermissionMode, getAiModelCapabilities, getAiModelConfig, getAiReasoningEffort, normalizeAiModelConfig, saveAiAgentPermissionMode, saveAiModelConfig, saveAiReasoningEffort, streamAiChat, updateAiModelCapabilities } from "./aiConfig";

describe("AI model configuration", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.listen.mockReset();
    mocks.listen.mockResolvedValue(() => undefined);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
  });

  it("uses the Bailian OpenAI-compatible defaults", () => {
    expect(normalizeAiModelConfig(null)).toEqual(defaultAiModelConfig);
    expect(defaultAiModelConfig.model).toBe("qwen3.7-flash");
  });

  it("trims the endpoint and model before saving", () => {
    const config = saveAiModelConfig({ baseUrl: " https://example.com/v1/// ", model: " demo-model " });
    expect(config).toEqual({ baseUrl: "https://example.com/v1", model: "demo-model" });
    expect(localStorage.setItem).toHaveBeenCalledWith("visual-python:ai-model-config", JSON.stringify(config));
  });

  it("recovers from malformed stored configuration", () => {
    vi.mocked(localStorage.getItem).mockReturnValue("not-json");
    expect(getAiModelConfig()).toEqual(defaultAiModelConfig);
  });

  it("persists the Agent permission mode with autonomous execution as the default", () => {
    expect(getAiAgentPermissionMode()).toBe("auto");
    expect(saveAiAgentPermissionMode("confirm")).toBe("confirm");
    expect(localStorage.setItem).toHaveBeenCalledWith("visual-python:ai-agent-permission-mode", "confirm");
    vi.mocked(localStorage.getItem).mockReturnValue("confirm");
    expect(getAiAgentPermissionMode()).toBe("confirm");
  });

  it("persists high as the default reasoning effort", () => {
    expect(getAiReasoningEffort()).toBe("high");
    expect(saveAiReasoningEffort("xhigh")).toBe("xhigh");
    expect(localStorage.setItem).toHaveBeenCalledWith("visual-python:ai-reasoning-effort", "xhigh");
    vi.mocked(localStorage.getItem).mockReturnValue("medium");
    expect(getAiReasoningEffort()).toBe("medium");
    vi.mocked(localStorage.getItem).mockReturnValue("unsupported");
    expect(getAiReasoningEffort()).toBe("high");
  });

  it("passes standard tool choice controls to the native OpenAI-compatible request", async () => {
    mocks.invoke.mockResolvedValue({ content: "", toolCalls: [], model: "test" });
    const tools = [{
      type: "function" as const,
      function: { name: "edit_code", description: "edit", parameters: { type: "object" } },
    }];

    await streamAiChat([{ role: "user", content: "修改代码" }], vi.fn(), { tools, toolChoice: "required", reasoningEffort: "xhigh" });

    expect(mocks.invoke).toHaveBeenCalledWith("ai_chat_completion_stream", expect.objectContaining({
      tools,
      toolChoice: "required",
      omitToolChoice: false,
      reasoningEffort: "xhigh",
    }));
  });

  it("persists capability results independently for each model endpoint", () => {
    const values = new Map<string, string>();
    vi.mocked(localStorage.getItem).mockImplementation((key: string) => values.get(key) ?? null);
    vi.mocked(localStorage.setItem).mockImplementation((key: string, value: string) => values.set(key, value));
    const first = { baseUrl: "https://one.example/v1", model: "model-a" };
    const second = { baseUrl: "https://two.example/v1", model: "model-a" };

    updateAiModelCapabilities({ functionCalling: "supported", toolChoice: "unsupported" }, first);

    expect(getAiModelCapabilities(first)).toEqual({ functionCalling: "supported", toolChoice: "unsupported" });
    expect(getAiModelCapabilities(second)).toEqual({ functionCalling: "unknown", toolChoice: "unknown" });
  });
});
