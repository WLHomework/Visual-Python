import { afterEach, describe, expect, it, vi } from "vitest";
import { bailianTtsModels, bailianVoiceCloneModel, defaultTtsConfig, getBailianVoiceOptions, getStoredTtsVoices, getTtsConfig, isBailianClonedVoice, mergeTtsVoiceOptions, normalizeTtsConfig, saveStoredTtsVoices, ttsExpressionSummary, ttsVoiceChoices } from "./ttsConfig";

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

  it("keeps custom Bailian models and voices", () => {
    expect(getBailianVoiceOptions("qwen-audio-3.0-tts-plus").map((voice) => voice.id)).toEqual(["longanlingxin", "longanlufeng"]);
    expect(getBailianVoiceOptions("qwen-audio-3.0-tts-flash").map((voice) => voice.id)).toEqual([
      "longanfengyue", "longanyuanfei", "longanlingxi", "longanxiaoxin", "longanhuan_v3.6", "longjielidou_v3.6",
      "longpaopao_v3.6", "longhuohuo_v3.6", "longchuanshu_v3.6", "loongmary", "loongeva_v3.6", "loongjohn",
    ]);
    expect(bailianTtsModels.map((model) => model.id)).toEqual(["qwen-audio-3.0-tts-flash", "qwen-audio-3.0-tts-plus"]);
    expect(normalizeTtsConfig({ provider: "aliyun-bailian", model: "qwen-audio-3.0-tts-flash", voice: "loongmary" })).toMatchObject({ model: "qwen-audio-3.0-tts-flash", voice: "loongmary" });
    expect(normalizeTtsConfig({ provider: "aliyun-bailian", model: "qwen-audio-3.0-tts-flash", voice: "longanlingxin" }).voice).toBe("longanfengyue");
    expect(normalizeTtsConfig({ provider: "aliyun-bailian", model: "qwen3-tts-flash", voice: "loongmary" }).model).toBe(defaultTtsConfig.model);
  });

  it("stores fetched voices for a custom model", () => {
    const voices = saveStoredTtsVoices("qwen-audio-3.0-tts-flash", [{ id: "Cherry", label: "芊悦" }, { id: "Cherry", label: "重复" }]);
    expect(voices).toEqual([{ id: "Cherry", label: "芊悦" }]);
    expect(getStoredTtsVoices("qwen-audio-3.0-tts-flash")).toEqual(voices);
    expect(ttsVoiceChoices("qwen-audio-3.0-tts-flash", "Ethan").map((voice) => voice.id)).toEqual([
      ...getBailianVoiceOptions("qwen-audio-3.0-tts-flash").map((voice) => voice.id),
      "Cherry",
      "Ethan",
    ].filter((id, index, ids) => ids.indexOf(id) === index));
    expect(mergeTtsVoiceOptions([{ id: "A", label: "甲" }], [{ id: "A", label: "乙" }])).toEqual([{ id: "A", label: "甲" }]);
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
