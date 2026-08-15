import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultManimRenderConfig, getManimRenderConfig, isDefaultManimRenderConfig, loadManimRenderConfig, resetManimRenderConfig, setManimRenderConfig, subscribeManimRenderConfig } from "./renderConfig";
import { manimPlugin } from "./index";
import type { PluginProjectSerializer } from "../../api/types";

afterEach(resetManimRenderConfig);

describe("Manim render configuration", () => {
  it("uses stable defaults and applies valid project settings", () => {
    expect(getManimRenderConfig()).toEqual(defaultManimRenderConfig);
    expect(isDefaultManimRenderConfig()).toBe(true);
    setManimRenderConfig({ quality: "high", fps: 60, renderer: "opengl", disableCaching: true });
    expect(getManimRenderConfig()).toEqual({ outputType: "video", transparentBackground: false, imageSizeMode: "preset", imageWidth: 1920, imageHeight: 1080, lockImageAspectRatio: true, imageCaptureMode: "final", imageAnimationStep: 1, quality: "high", fps: 60, renderer: "opengl", disableCaching: true, selectedScene: "", outputFileName: "" });
    expect(isDefaultManimRenderConfig()).toBe(false);
  });

  it("normalizes invalid serialized settings and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeManimRenderConfig(listener);
    loadManimRenderConfig({ quality: "invalid", fps: 24, renderer: "invalid", disableCaching: "yes" });
    expect(getManimRenderConfig()).toEqual(defaultManimRenderConfig);
    expect(listener).toHaveBeenCalledWith(defaultManimRenderConfig);
    unsubscribe();
  });

  it("round-trips non-default settings through the Manim project serializer", async () => {
    let serializer: PluginProjectSerializer | undefined;
    await manimPlugin.activate({
      pluginId: manimPlugin.manifest.id,
      registerBlock: () => undefined,
      registerToolboxCategory: () => undefined,
      registerSetting: () => undefined,
      registerProjectSerializer: (value) => { if (value.id === "visual-python.manim.render-config") serializer = value; },
      registerCodeDocumentHandler: () => undefined,
      registerCommand: () => undefined,
      registerAgentTool: () => undefined,
      reportProblem: () => undefined,
    });
    setManimRenderConfig({ outputType: "image", transparentBackground: true, imageSizeMode: "custom", imageWidth: 1600, imageHeight: 1200, lockImageAspectRatio: false, imageCaptureMode: "animation", imageAnimationStep: 3, quality: "four_k", fps: 60, renderer: "opengl", disableCaching: true, selectedScene: "SecondScene", outputFileName: "lesson-one" });
    const saved = serializer?.save();
    serializer?.clear?.();
    expect(getManimRenderConfig()).toEqual(defaultManimRenderConfig);
    serializer?.load(saved);
    expect(getManimRenderConfig()).toEqual({ outputType: "image", transparentBackground: true, imageSizeMode: "custom", imageWidth: 1600, imageHeight: 1200, lockImageAspectRatio: false, imageCaptureMode: "animation", imageAnimationStep: 3, quality: "four_k", fps: 60, renderer: "opengl", disableCaching: true, selectedScene: "SecondScene", outputFileName: "lesson-one" });
  });
});
