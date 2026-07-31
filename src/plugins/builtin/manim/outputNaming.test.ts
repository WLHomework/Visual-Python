import { describe, expect, it } from "vitest";
import { buildManimOutputFilename, sanitizeManimOutputBaseName } from "./outputNaming";

describe("Manim output naming", () => {
  it("builds a readable automatic filename", () => {
    expect(buildManimOutputFilename("geometry.vpy", "MainScene", "", new Date(2026, 6, 17, 9, 8, 7)))
      .toBe("geometry-MainScene-20260717-090807.mp4");
  });

  it("sanitizes custom names and avoids reserved Windows names", () => {
    expect(buildManimOutputFilename("demo.vpy", "MainScene", "lesson: 01?.mp4"))
      .toBe("lesson_ 01_.mp4");
    expect(sanitizeManimOutputBaseName("CON.mp4")).toBe("_CON");
  });

  it("uses PNG names for still image output", () => {
    expect(buildManimOutputFilename("geometry.vpy", "MainScene", "cover.mp4", new Date(2026, 6, 17, 9, 8, 7), "image"))
      .toBe("cover.png");
    expect(buildManimOutputFilename("geometry.vpy", "MainScene", "", new Date(2026, 6, 17, 9, 8, 7), "image"))
      .toBe("geometry-MainScene-20260717-090807.png");
  });
});
