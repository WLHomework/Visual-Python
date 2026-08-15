export type ManimQuality = "preview" | "low" | "medium" | "high" | "four_k";
export type ManimRenderer = "cairo" | "opengl";
export type ManimOutputType = "video" | "image";
export type ManimImageSizeMode = "preset" | "custom";
export type ManimImageCaptureMode = "final" | "animation";

export type ManimRenderConfig = {
  outputType: ManimOutputType;
  transparentBackground: boolean;
  imageSizeMode: ManimImageSizeMode;
  imageWidth: number;
  imageHeight: number;
  lockImageAspectRatio: boolean;
  imageCaptureMode: ManimImageCaptureMode;
  imageAnimationStep: number;
  quality: ManimQuality;
  fps: 15 | 30 | 60;
  renderer: ManimRenderer;
  disableCaching: boolean;
  selectedScene: string;
  outputFileName: string;
};

export const defaultManimRenderConfig: ManimRenderConfig = {
  outputType: "video",
  transparentBackground: false,
  imageSizeMode: "preset",
  imageWidth: 1920,
  imageHeight: 1080,
  lockImageAspectRatio: true,
  imageCaptureMode: "final",
  imageAnimationStep: 1,
  quality: "low",
  fps: 15,
  renderer: "cairo",
  disableCaching: false,
  selectedScene: "",
  outputFileName: "",
};

type ManimRenderPreferences = Omit<ManimRenderConfig, "selectedScene" | "outputFileName">;

const storageKey = "visual-python:manim-render-config";
const listeners = new Set<(config: ManimRenderConfig) => void>();

const normalizeImageDimension = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 64 && numeric <= 8192 ? Math.round(numeric) : fallback;
};

const normalizeConfig = (value: unknown): ManimRenderConfig => {
  const candidate = value as Partial<ManimRenderConfig> | null;
  const quality = ["preview", "low", "medium", "high", "four_k"].includes(String(candidate?.quality)) ? candidate!.quality! : defaultManimRenderConfig.quality;
  const fps = [15, 30, 60].includes(Number(candidate?.fps)) ? Number(candidate!.fps) as ManimRenderConfig["fps"] : defaultManimRenderConfig.fps;
  const renderer = candidate?.renderer === "opengl" ? "opengl" : "cairo";
  const selectedScene = typeof candidate?.selectedScene === "string" ? candidate.selectedScene : "";
  const outputFileName = typeof candidate?.outputFileName === "string" ? candidate.outputFileName.slice(0, 160) : "";
  const outputType = candidate?.outputType === "image" ? "image" : "video";
  const imageSizeMode = candidate?.imageSizeMode === "custom" ? "custom" : "preset";
  const imageWidth = normalizeImageDimension(candidate?.imageWidth, defaultManimRenderConfig.imageWidth);
  const imageHeight = normalizeImageDimension(candidate?.imageHeight, defaultManimRenderConfig.imageHeight);
  const imageCaptureMode = candidate?.imageCaptureMode === "animation" ? "animation" : "final";
  const imageAnimationStep = Number.isInteger(Number(candidate?.imageAnimationStep)) && Number(candidate?.imageAnimationStep) >= 1 && Number(candidate?.imageAnimationStep) <= 10_000 ? Number(candidate?.imageAnimationStep) : defaultManimRenderConfig.imageAnimationStep;
  return { outputType, transparentBackground: candidate?.transparentBackground === true, imageSizeMode, imageWidth, imageHeight, lockImageAspectRatio: candidate?.lockImageAspectRatio !== false, imageCaptureMode, imageAnimationStep, quality, fps, renderer, disableCaching: candidate?.disableCaching === true, selectedScene, outputFileName };
};

const renderPreferences = (config: ManimRenderConfig): ManimRenderPreferences => ({
  outputType: config.outputType,
  transparentBackground: config.transparentBackground,
  imageSizeMode: config.imageSizeMode,
  imageWidth: config.imageWidth,
  imageHeight: config.imageHeight,
  lockImageAspectRatio: config.lockImageAspectRatio,
  imageCaptureMode: config.imageCaptureMode,
  imageAnimationStep: config.imageAnimationStep,
  quality: config.quality,
  fps: config.fps,
  renderer: config.renderer,
  disableCaching: config.disableCaching,
});

const readRenderPreferences = (): Partial<ManimRenderPreferences> => {
  if (typeof localStorage === "undefined") return {};
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "null");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};

const writeRenderPreferences = (patch: Partial<ManimRenderConfig>) => {
  if (typeof localStorage === "undefined") return;
  const preferencePatch = Object.fromEntries(Object.entries(patch).filter(([key]) => key !== "selectedScene" && key !== "outputFileName"));
  if (!Object.keys(preferencePatch).length) return;
  const preferences = renderPreferences(normalizeConfig({ ...defaultManimRenderConfig, ...readRenderPreferences(), ...preferencePatch }));
  try { localStorage.setItem(storageKey, JSON.stringify(preferences)); }
  catch { /* Persistence is optional when browser storage is unavailable. */ }
};

const configFromPreferences = () => normalizeConfig({ ...defaultManimRenderConfig, ...readRenderPreferences() });

let currentConfig = configFromPreferences();

const emit = () => listeners.forEach((listener) => listener({ ...currentConfig }));

export const getManimRenderConfig = () => ({ ...currentConfig });

export const setManimRenderConfig = (patch: Partial<ManimRenderConfig>) => {
  currentConfig = normalizeConfig({ ...currentConfig, ...patch });
  writeRenderPreferences(patch);
  emit();
};

export const resetManimRenderConfig = () => {
  currentConfig = configFromPreferences();
  emit();
};

export const loadManimRenderConfig = (value: unknown) => {
  const projectConfig = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  currentConfig = normalizeConfig({ ...defaultManimRenderConfig, ...readRenderPreferences(), ...projectConfig });
  emit();
};

export const subscribeManimRenderConfig = (listener: (config: ManimRenderConfig) => void) => {
  listeners.add(listener);
  listener({ ...currentConfig });
  return () => { listeners.delete(listener); };
};

export const isDefaultManimRenderConfig = () => JSON.stringify(currentConfig) === JSON.stringify(defaultManimRenderConfig);
