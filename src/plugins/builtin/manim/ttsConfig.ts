export type TtsProvider = "openai-compatible" | "aliyun-bailian";
export type TtsAudioFormat = "wav" | "mp3";

export type TtsConfig = {
  provider: TtsProvider;
  baseUrl: string;
  model: string;
  voice: string;
  speed: number;
  audioFormat: TtsAudioFormat;
};

export const bailianTtsModels = [
  {
    id: "qwen-audio-3.0-tts-plus",
    label: "Qwen-Audio 3.0 Plus",
    voices: [
      { id: "longanlingxin", label: "龙安灵心" },
      { id: "longanlufeng", label: "龙安鲁风" },
    ],
  },
  {
    id: "qwen-audio-3.0-tts-flash",
    label: "Qwen-Audio 3.0 Flash",
    voices: [
      { id: "longanfengyue", label: "龙安风悦" },
      { id: "longanyuanfei", label: "龙安元妃" },
      { id: "longanlingxi", label: "龙安灵希" },
      { id: "longanxiaoxin", label: "龙安小昕" },
      { id: "longanhuan_v3.6", label: "龙安欢" },
      { id: "longjielidou_v3.6", label: "龙杰力豆" },
      { id: "longpaopao_v3.6", label: "龙泡泡" },
      { id: "longhuohuo_v3.6", label: "龙火火" },
      { id: "longchuanshu_v3.6", label: "龙川叔" },
      { id: "loongmary", label: "Loong Mary" },
      { id: "loongeva_v3.6", label: "Loong Eva" },
      { id: "loongjohn", label: "Loong John" },
    ],
  },
] as const;

export function getBailianVoiceOptions(model: string) {
  return bailianTtsModels.find((option) => option.id === model)?.voices ?? bailianTtsModels[0].voices;
}

export const defaultTtsConfig: TtsConfig = {
  provider: "aliyun-bailian",
  baseUrl: "",
  model: "qwen-audio-3.0-tts-plus",
  voice: "longanlingxin",
  speed: 1,
  audioFormat: "wav",
};

const storageKey = "visual-python:manim-tts-config";

export function normalizeTtsConfig(value: unknown): TtsConfig {
  const candidate = value as Partial<TtsConfig> | null;
  const provider = "aliyun-bailian" as const;
  const isBailianConfig = candidate?.provider === "aliyun-bailian";
  const defaults = defaultTtsConfig;
  let model = isBailianConfig && typeof candidate?.model === "string" && candidate.model.trim() ? candidate.model.trim().slice(0, 160) : defaults.model;
  let voice = isBailianConfig && typeof candidate?.voice === "string" && candidate.voice.trim() ? candidate.voice.trim().slice(0, 160) : defaults.voice;
  if (provider === "aliyun-bailian" && model === "qwen-audio-3.0-tts-plus" && voice === "longanlingxi") voice = "longanlingxin";
  if (provider === "aliyun-bailian") voice = ({
    longanhuan_v3: "longanhuan_v3.6",
    longjielidou_v3: "longjielidou_v3.6",
    longpaopao_v3: "longpaopao_v3.6",
    longhuohuo_v3: "longhuohuo_v3.6",
    longchuanshu_v3: "longchuanshu_v3.6",
    loongeva_v3: "loongeva_v3.6",
  } as Record<string, string>)[voice] ?? voice;
  if (provider === "aliyun-bailian") {
    if (!bailianTtsModels.some((option) => option.id === model)) model = bailianTtsModels[0].id;
    const voices = getBailianVoiceOptions(model);
    if (!voices.some((option) => option.id === voice)) voice = voices[0].id;
  }
  const speed = Number(isBailianConfig ? candidate?.speed : defaults.speed);
  return {
    provider,
    baseUrl: isBailianConfig && typeof candidate?.baseUrl === "string" ? candidate.baseUrl.trim().slice(0, 500) : defaults.baseUrl,
    model,
    voice,
    speed: Number.isFinite(speed) ? Math.min(2, Math.max(0.5, Math.round(speed * 20) / 20)) : 1,
    audioFormat: isBailianConfig && candidate?.audioFormat === "mp3" ? "mp3" : "wav",
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
