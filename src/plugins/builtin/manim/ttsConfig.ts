export type TtsProvider = "openai-compatible" | "aliyun-bailian";
export type TtsAudioFormat = "wav" | "mp3";

export const ttsEmotionOptions = [
  { id: "auto", label: "自动" },
  { id: "neutral", label: "中性" },
  { id: "calm", label: "平静" },
  { id: "happy", label: "愉快" },
  { id: "sad", label: "悲伤" },
  { id: "excited", label: "激动" },
  { id: "serious", label: "严肃" },
  { id: "warm", label: "温暖" },
] as const;

export const ttsToneOptions = [
  { id: "natural", label: "自然" },
  { id: "friendly", label: "亲切" },
  { id: "professional", label: "专业" },
  { id: "firm", label: "坚定" },
  { id: "gentle", label: "温柔" },
  { id: "lively", label: "活泼" },
] as const;

export const ttsIntonationOptions = [
  { id: "natural", label: "自然" },
  { id: "flat", label: "平缓" },
  { id: "expressive", label: "抑扬丰富" },
  { id: "emphatic", label: "强调重点" },
] as const;

export const ttsReadingStyleOptions = [
  { id: "natural", label: "自然朗读" },
  { id: "narration", label: "旁白解说" },
  { id: "teaching", label: "课程讲解" },
  { id: "news", label: "新闻播报" },
  { id: "storytelling", label: "故事讲述" },
  { id: "dialogue", label: "角色对白" },
  { id: "promotional", label: "宣传介绍" },
] as const;

export type TtsEmotion = typeof ttsEmotionOptions[number]["id"];
export type TtsTone = typeof ttsToneOptions[number]["id"];
export type TtsIntonation = typeof ttsIntonationOptions[number]["id"];
export type TtsReadingStyle = typeof ttsReadingStyleOptions[number]["id"];

export type TtsExpressionConfig = {
  emotion: TtsEmotion;
  tone: TtsTone;
  intonation: TtsIntonation;
  readingStyle: TtsReadingStyle;
  customInstruction: string;
};

export const defaultTtsExpression: TtsExpressionConfig = {
  emotion: "auto",
  tone: "natural",
  intonation: "natural",
  readingStyle: "natural",
  customInstruction: "",
};

const normalizeOption = <T extends string>(value: unknown, options: readonly { id: T }[], fallback: T): T =>
  typeof value === "string" && options.some((option) => option.id === value) ? value as T : fallback;

export function normalizeTtsExpression(value: Partial<TtsExpressionConfig> | null | undefined): TtsExpressionConfig {
  return {
    emotion: normalizeOption(value?.emotion, ttsEmotionOptions, defaultTtsExpression.emotion),
    tone: normalizeOption(value?.tone, ttsToneOptions, defaultTtsExpression.tone),
    intonation: normalizeOption(value?.intonation, ttsIntonationOptions, defaultTtsExpression.intonation),
    readingStyle: normalizeOption(value?.readingStyle, ttsReadingStyleOptions, defaultTtsExpression.readingStyle),
    customInstruction: typeof value?.customInstruction === "string" ? value.customInstruction.trim().slice(0, 200) : "",
  };
}

export function ttsExpressionSummary(value: TtsExpressionConfig): string {
  const labels = [
    value.emotion === "auto" ? "" : ttsEmotionOptions.find((option) => option.id === value.emotion)?.label,
    value.tone === "natural" ? "" : ttsToneOptions.find((option) => option.id === value.tone)?.label,
    value.intonation === "natural" ? "" : ttsIntonationOptions.find((option) => option.id === value.intonation)?.label,
    value.readingStyle === "natural" ? "" : ttsReadingStyleOptions.find((option) => option.id === value.readingStyle)?.label,
    value.customInstruction ? "自定义" : "",
  ].filter(Boolean);
  return labels.length ? labels.join(" · ") : "自然表达";
}

export const bailianVoiceCloneModel = "qwen-audio-3.0-tts-plus";
const bailianPlusBuiltinVoices = new Set(["longanlingxin", "longanlufeng"]);
const ttsIdPattern = /^[A-Za-z0-9._-]{1,160}$/;
const ttsVoiceCatalogStorageKey = "visual-python:manim-tts-voice-catalog";

export function isValidTtsId(value: string): boolean {
  return ttsIdPattern.test(value);
}

export function isBailianClonedVoice(model: string, voice: string): boolean {
  return model === bailianVoiceCloneModel
    && voice.startsWith("qwen-audio-3.0-tts-plus-")
    && isValidTtsId(voice)
    && !bailianPlusBuiltinVoices.has(voice);
}

export type TtsConfig = TtsExpressionConfig & {
  provider: TtsProvider;
  baseUrl: string;
  model: string;
  voice: string;
  speed: number;
  audioFormat: TtsAudioFormat;
};

export type TtsVoiceOption = { id: string; label: string };

const plusSystemVoices: TtsVoiceOption[] = [
  { id: "longanlingxin", label: "龙安灵心" },
  { id: "longanlufeng", label: "龙安鲁风" },
];

const flashSystemVoices: TtsVoiceOption[] = [
  { id: "longanfengyue", label: "龙安风悦" },
  { id: "longanyuanfei", label: "龙安元妃" },
  { id: "longanlingxi", label: "龙安灵希" },
  { id: "longanxiaoxin", label: "龙安小昕" },
  { id: "longanhuan_v3.6", label: "龙安欢" },
  { id: "longjielidou_v3.6", label: "龙杰力豆" },
  { id: "longpaopao_v3.6", label: "龙泡泡" },
  { id: "longhuohuo_v3.6", label: "龙火火" },
  { id: "longchuanshu_v3.6", label: "龙川叔" },
  { id: "loongmary", label: "loongmary" },
  { id: "loongeva_v3.6", label: "loongeva" },
  { id: "loongjohn", label: "loongJohn" },
];

export const bailianTtsModels = [
  { id: "qwen-audio-3.0-tts-flash", label: "Qwen-Audio 3.0 Flash", voices: flashSystemVoices },
  { id: "qwen-audio-3.0-tts-plus", label: "Qwen-Audio 3.0 Plus", voices: plusSystemVoices },
] as const;

export function getBailianVoiceOptions(model: string): TtsVoiceOption[] {
  return [...(bailianTtsModels.find((option) => option.id === model)?.voices ?? flashSystemVoices)];
}

export function mergeTtsVoiceOptions(...groups: Array<Iterable<TtsVoiceOption> | undefined>): TtsVoiceOption[] {
  const seen = new Set<string>();
  const voices: TtsVoiceOption[] = [];
  for (const group of groups) {
    if (!group) continue;
    for (const voice of group) {
      const id = voice.id.trim();
      if (!isValidTtsId(id) || seen.has(id)) continue;
      seen.add(id);
      voices.push({ id, label: voice.label.trim() || id });
    }
  }
  return voices;
}

const readVoiceCatalogStore = (): Record<string, TtsVoiceOption[]> => {
  try {
    const value = JSON.parse(localStorage.getItem(ttsVoiceCatalogStorageKey) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([model, voices]) => {
      if (!isValidTtsId(model) || !Array.isArray(voices)) return [];
      return [[model, mergeTtsVoiceOptions(voices.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const voice = item as Partial<TtsVoiceOption>;
        return typeof voice.id === "string" ? [{ id: voice.id, label: typeof voice.label === "string" ? voice.label : voice.id }] : [];
      }))]];
    }));
  } catch {
    return {};
  }
};

export function getStoredTtsVoices(model: string): TtsVoiceOption[] {
  return readVoiceCatalogStore()[model] ?? [];
}

export function saveStoredTtsVoices(model: string, voices: TtsVoiceOption[]): TtsVoiceOption[] {
  const normalized = mergeTtsVoiceOptions(voices);
  const store = readVoiceCatalogStore();
  if (normalized.length) store[model] = normalized;
  else delete store[model];
  const entries = Object.entries(store).slice(-20);
  localStorage.setItem(ttsVoiceCatalogStorageKey, JSON.stringify(Object.fromEntries(entries)));
  return normalized;
}

export function ttsVoiceChoices(model: string, currentVoice = ""): TtsVoiceOption[] {
  return mergeTtsVoiceOptions(
    getBailianVoiceOptions(model),
    getStoredTtsVoices(model),
    currentVoice && isValidTtsId(currentVoice) ? [{ id: currentVoice, label: currentVoice }] : [],
  );
}

export const defaultTtsConfig: TtsConfig = {
  provider: "aliyun-bailian",
  baseUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
  model: "qwen-audio-3.0-tts-flash",
  voice: "longanhuan_v3.6",
  speed: 1,
  audioFormat: "mp3",
  ...defaultTtsExpression,
};

const storageKey = "visual-python:manim-tts-config";

export function normalizeTtsConfig(value: unknown): TtsConfig {
  const candidate = value as Partial<TtsConfig> | null;
  const provider = "aliyun-bailian" as const;
  const isBailianConfig = candidate?.provider === "aliyun-bailian";
  const defaults = defaultTtsConfig;
  let model = isBailianConfig && typeof candidate?.model === "string" && candidate.model.trim() ? candidate.model.trim().slice(0, 160) : defaults.model;
  let voice = isBailianConfig && typeof candidate?.voice === "string" && candidate.voice.trim() ? candidate.voice.trim().slice(0, 160) : defaults.voice;
  if (model === "qwen-audio-3.0-tts-plus" && voice === "longanlingxi") voice = "longanlingxin";
  if (!bailianTtsModels.some((option) => option.id === model)) model = defaults.model;
  const cloned = isBailianClonedVoice(model, voice);
  const voices = getBailianVoiceOptions(model);
  if (!cloned && !voices.some((option) => option.id === voice)) voice = voices[0]?.id || defaults.voice;
  const speed = Number(isBailianConfig ? candidate?.speed : defaults.speed);
  const expression = normalizeTtsExpression(isBailianConfig ? candidate : defaults);
  return {
    provider,
    baseUrl: isBailianConfig && typeof candidate?.baseUrl === "string" ? candidate.baseUrl.trim().slice(0, 500) : defaults.baseUrl,
    model,
    voice,
    speed: Number.isFinite(speed) ? Math.min(2, Math.max(0.5, Math.round(speed * 20) / 20)) : 1,
    audioFormat: isBailianConfig && candidate?.audioFormat === "mp3" ? "mp3" : "wav",
    ...expression,
  };
}

export function getTtsConfig(): TtsConfig {
  try {
    return normalizeTtsConfig(JSON.parse(localStorage.getItem(storageKey) || "null"));
  } catch {
    return { ...defaultTtsConfig };
  }
}

export function saveTtsConfig(config: TtsConfig): TtsConfig {
  const normalized = normalizeTtsConfig(config);
  localStorage.setItem(storageKey, JSON.stringify(normalized));
  return normalized;
}
