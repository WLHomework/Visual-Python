import { describe, expect, it } from "vitest";
import { extractManimSceneNames, nextUniqueManimSceneName } from "./sceneNames";

describe("Manim scene discovery", () => {
  it("finds supported scene classes in source order", () => {
    const code = `
class Intro(Scene): pass
class Camera(MovingCameraScene): pass
class Space(ThreeDScene): pass
class Special(SpecialThreeDScene): pass
class Helper(object): pass
`;
    expect(extractManimSceneNames(code)).toEqual(["Intro", "Camera", "Space", "Special"]);
  });

  it("ignores duplicate matches", () => {
    expect(extractManimSceneNames("class Demo(Scene): pass\nclass Demo(Scene): pass")).toEqual(["Demo"]);
  });

  it("finds Chinese scene class names", () => {
    expect(extractManimSceneNames("class 圆形动画(Scene): pass")).toEqual(["圆形动画"]);
  });

  it("adds the next available numeric suffix to copied scenes", () => {
    expect(nextUniqueManimSceneName("MainScene", ["MainScene"])).toBe("MainScene2");
    expect(nextUniqueManimSceneName("MainScene", ["MainScene", "MainScene2", "MainScene3"])).toBe("MainScene4");
    expect(nextUniqueManimSceneName("MainScene2", ["MainScene", "MainScene2"])).toBe("MainScene3");
    expect(nextUniqueManimSceneName("MainScene2", ["MainScene", "MainScene2", "MainScene3"])).toBe("MainScene4");
    expect(nextUniqueManimSceneName("Intro", ["MainScene"])).toBe("Intro");
  });
});
