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
    expect(getManimRenderConfig()).toEqual({ quality: "high", fps: 60, renderer: "opengl", disableCaching: true, selectedScene: "" });
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
      registerProjectSerializer: (value) => { serializer = value; },
      registerCommand: () => undefined,
      reportProblem: () => undefined,
    });
    setManimRenderConfig({ quality: "four_k", fps: 60, renderer: "opengl", disableCaching: true, selectedScene: "SecondScene" });
    const saved = serializer?.save();
    serializer?.clear?.();
    expect(getManimRenderConfig()).toEqual(defaultManimRenderConfig);
    serializer?.load(saved);
    expect(getManimRenderConfig()).toEqual({ quality: "four_k", fps: 60, renderer: "opengl", disableCaching: true, selectedScene: "SecondScene" });
  });
});
