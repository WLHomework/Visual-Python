import { describe, expect, it } from "vitest";
import { formatRenderElapsed, initialManimRenderProgress, parseManimRenderProgress } from "./renderProgress";

describe("Manim render progress", () => {
  it("starts in the preparing phase", () => {
    expect(initialManimRenderProgress("MainScene")).toEqual({
      scene: "MainScene",
      phase: "preparing",
      label: "正在准备渲染",
    });
  });

  it("reads the current animation progress", () => {
    const initial = initialManimRenderProgress("MainScene");
    expect(parseManimRenderProgress("Animation 2: Create(Circle):  45%|####", initial)).toMatchObject({
      phase: "rendering",
      label: "正在渲染动画 3",
      animation: 3,
      percent: 45,
    });
  });

  it("recognizes combining and finalizing output", () => {
    const initial = initialManimRenderProgress("MainScene");
    const combining = parseManimRenderProgress("INFO Combining to Movie file.", initial);
    expect(combining).toMatchObject({ phase: "combining", label: "正在合成视频", percent: undefined });
    expect(parseManimRenderProgress("INFO Rendered MainScene", combining)).toMatchObject({
      phase: "finalizing",
      label: "正在整理输出",
    });
  });

  it("formats elapsed render time", () => {
    expect(formatRenderElapsed(7)).toBe("00:07");
    expect(formatRenderElapsed(125)).toBe("02:05");
  });
});
