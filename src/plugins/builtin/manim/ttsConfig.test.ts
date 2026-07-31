import { afterEach, describe, expect, it, vi } from "vitest";
import { bailianTtsModels, bailianVoiceCloneModel, defaultTtsConfig, getBailianVoiceOptions, getTtsConfig, isBailianClonedVoice, normalizeTtsConfig, ttsExpressionSummary } from "./ttsConfig";

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
    expect(bailianTtsModels).toHaveLength(1);
    expect(normalizeTtsConfig({ provider: "aliyun-bailian", model: "qwen-audio-3.0-tts-flash", voice: "loongmary" })).toMatchObject({ model: "qwen-audio-3.0-tts-plus", voice: "longanlingxin" });
  });

  it("recognizes only valid Qwen-Audio Plus cloned voice ids", () => {
    expect(isBailianClonedVoice(bailianVoiceCloneModel, "qwen-audio-3.0-tts-plus-vpvoice-a1b2c3")).toBe(true);
    expect(isBailianClonedVoice(bailianVoiceCloneModel, "含空格的音色")).toBe(false);
    expect(isBailianClonedVoice(bailianVoiceCloneModel, "loongmary")).toBe(false);
    expect(isBailianClonedVoice("qwen-audio-3.0-tts-flash", "qwen-audio-3.0-tts-plus-vpvoice-a1b2c3")).toBe(false);
  });

  it("normalizes and summarizes native expression controls", () => {
    const config = normalizeTtsConfig({
      provider: "aliyun-bailian",
      emotion: "happy",
      tone: "professional",
      intonation: "expressive",
      readingStyle: "teaching",
      customInstruction: "  公式处稍作停顿  ",
    });
    expect(config).toMatchObject({ emotion: "happy", tone: "professional", intonation: "expressive", readingStyle: "teaching", customInstruction: "公式处稍作停顿" });
    expect(ttsExpressionSummary(config)).toBe("愉快 · 专业 · 抑扬丰富 · 课程讲解 · 自定义");
    expect(normalizeTtsConfig({ provider: "aliyun-bailian", emotion: "unknown" }).emotion).toBe("auto");
  });
});
