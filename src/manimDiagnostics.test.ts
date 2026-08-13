import { describe, expect, it } from "vitest";
import { diagnoseManimError, diagnoseManimStartupError, localAudioErrorSuggestion } from "./manimDiagnostics";

describe("Manim error diagnostics", () => {
  it("uses code-oriented guidance for Scene.play type errors in code mode", () => {
    const diagnosis = diagnoseManimError(
      "TypeError: Unexpected argument Circle passed to Scene.play().",
      { mode: "code" },
    );

    expect(diagnosis.suggestion).toContain("Scene.play()");
    expect(diagnosis.suggestion).toContain("Create(circle)");
    expect(diagnosis.suggestion).not.toMatch(/积木|输入槽|高亮/);
  });

  it("keeps block-oriented guidance in block mode", () => {
    const diagnosis = diagnoseManimError(
      "TypeError: Unexpected argument Circle passed to Scene.play().",
      { mode: "blocks" },
    );

    expect(diagnosis.suggestion).toContain("积木");
  });

  it("uses mode-specific local audio guidance", () => {
    expect(localAudioErrorSuggestion("code")).not.toMatch(/积木|输入槽|高亮/);
    expect(localAudioErrorSuggestion("code")).toContain("文件路径");
    expect(localAudioErrorSuggestion("blocks")).toContain("积木");
  });

  it("identifies a missing Manim module in the selected Python environment", () => {
    const diagnosis = diagnoseManimError(
      "ModuleNotFoundError: No module named 'manim'",
      { mode: "code" },
    );

    expect(diagnosis.suggestion).toContain("未安装 Manim");
    expect(diagnosis.suggestion).not.toMatch(/积木|输入槽|高亮/);
  });

  it("classifies Manim startup and output directory failures", () => {
    const environment = diagnoseManimStartupError("cannot start Manim: No such file or directory (os error 2)");
    const output = diagnoseManimStartupError("cannot create Manim work directory: Access is denied");

    expect(environment.message).toContain("无法启动 Manim");
    expect(environment.suggestion).toContain("Python");
    expect(output.message).toContain("无法准备 Manim 工作目录");
    expect(output.suggestion).toContain("权限");
  });
});
