export type ManimQuality = "preview" | "low" | "medium" | "high" | "four_k";
export type ManimRenderer = "cairo" | "opengl";

export type ManimRenderConfig = {
  quality: ManimQuality;
  fps: 15 | 30 | 60;
  renderer: ManimRenderer;
  disableCaching: boolean;
  selectedScene: string;
};

export const defaultManimRenderConfig: ManimRenderConfig = {
  quality: "low",
  fps: 15,
  renderer: "cairo",
  disableCaching: false,
  selectedScene: "",
};

let currentConfig = { ...defaultManimRenderConfig };
const listeners = new Set<(config: ManimRenderConfig) => void>();

const normalizeConfig = (value: unknown): ManimRenderConfig => {
  const candidate = value as Partial<ManimRenderConfig> | null;
  const quality = ["preview", "low", "medium", "high", "four_k"].includes(String(candidate?.quality)) ? candidate!.quality! : defaultManimRenderConfig.quality;
  const fps = [15, 30, 60].includes(Number(candidate?.fps)) ? Number(candidate!.fps) as ManimRenderConfig["fps"] : defaultManimRenderConfig.fps;
  const renderer = candidate?.renderer === "opengl" ? "opengl" : "cairo";
  const selectedScene = typeof candidate?.selectedScene === "string" ? candidate.selectedScene : "";
  return { quality, fps, renderer, disableCaching: candidate?.disableCaching === true, selectedScene };
};

const emit = () => listeners.forEach((listener) => listener({ ...currentConfig }));

export const getManimRenderConfig = () => ({ ...currentConfig });

export const setManimRenderConfig = (patch: Partial<ManimRenderConfig>) => {
  currentConfig = normalizeConfig({ ...currentConfig, ...patch });
  emit();
};

export const resetManimRenderConfig = () => {
  currentConfig = { ...defaultManimRenderConfig };
  emit();
};

export const loadManimRenderConfig = (value: unknown) => {
  currentConfig = normalizeConfig(value);
  emit();
};

export const subscribeManimRenderConfig = (listener: (config: ManimRenderConfig) => void) => {
  listeners.add(listener);
  listener({ ...currentConfig });
  return () => { listeners.delete(listener); };
};

export const isDefaultManimRenderConfig = () => JSON.stringify(currentConfig) === JSON.stringify(defaultManimRenderConfig);
