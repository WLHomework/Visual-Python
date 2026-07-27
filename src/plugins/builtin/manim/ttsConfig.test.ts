import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultTtsConfig, getBailianVoiceOptions, getTtsConfig, normalizeTtsConfig } from "./ttsConfig";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
});

afterEach(() => storage.clear());

describe("Manim TTS configuration", () => {
  it("uses Bailian defaults", () => {
    expect(getTtsConfig()).toEqual(defaultTtsConfig);
  });

  it("migrates former OpenAI-compatible settings to Bailian defaults", () => {
    localStorage.setItem("visual-python:manim-tts-config", JSON.stringify({ provider: "openai-compatible", baseUrl: "https://example.com/v1", model: "tts", voice: "narrator", speed: 3, audioFormat: "mp3" }));
    expect(getTtsConfig()).toEqual(defaultTtsConfig);
    expect(normalizeTtsConfig({ provider: "aliyun-bailian", speed: 0 })).toMatchObject({ speed: 0.5 });
  });

  it("migrates the former invalid Plus voice id", () => {
    expect(normalizeTtsConfig({ provider: "aliyun-bailian", model: "qwen-audio-3.0-tts-plus", voice: "longanlingxi" }).voice).toBe("longanlingxin");
  });

  it("loads only voices supported by the selected Bailian model", () => {
    expect(getBailianVoiceOptions("qwen-audio-3.0-tts-plus").map((voice) => voice.id)).toEqual(["longanlingxin", "longanlufeng"]);
    expect(getBailianVoiceOptions("qwen-audio-3.0-tts-flash")).toHaveLength(12);
    expect(normalizeTtsConfig({ provider: "aliyun-bailian", model: "qwen-audio-3.0-tts-flash", voice: "longanlingxin" })).toMatchObject({ model: "qwen-audio-3.0-tts-flash", voice: "longanfengyue" });
  });

  it("migrates truncated Flash v3 voice ids to the official v3.6 ids", () => {
    expect(normalizeTtsConfig({ provider: "aliyun-bailian", model: "qwen-audio-3.0-tts-flash", voice: "longanhuan_v3" }).voice).toBe("longanhuan_v3.6");
    expect(getBailianVoiceOptions("qwen-audio-3.0-tts-flash").map((voice) => voice.id)).toContain("loongeva_v3.6");
  });
});
