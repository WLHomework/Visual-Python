import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAiModelConfig, getAiModelConfig, normalizeAiModelConfig, saveAiModelConfig } from "./aiConfig";

describe("AI model configuration", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
  });

  it("uses the Bailian OpenAI-compatible defaults", () => {
    expect(normalizeAiModelConfig(null)).toEqual(defaultAiModelConfig);
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
});
