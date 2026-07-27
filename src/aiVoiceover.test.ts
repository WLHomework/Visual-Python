import { describe, expect, it } from "vitest";
import { countFakeVoiceoverApis, inspectVoiceovers, insertStandaloneVoiceover, insertSynchronizedVoiceover } from "./aiVoiceover";
import { createVoiceoverEndMarker, createVoiceoverMarker } from "./plugins/builtin/manim/voiceoverMarkers";

const source = `from manim import *

class Demo(Scene):
    def construct(self):
        self.play(Write(Text("Hello")))
`;

describe("AI voiceover tools", () => {
  it("inserts a standalone marker at an exact anchor", () => {
    const code = insertStandaloneVoiceover(source, '        self.play(Write(Text("Hello")))', "欢迎", "default", "before");
    expect(code).toContain("visual-python-tts:cue:");
    expect(inspectVoiceovers(code, [])).toMatchObject({ valid: true, cueCount: 1, synchronizedCount: 0 });
  });

  it("wraps animation code in synchronized markers", () => {
    const code = insertSynchronizedVoiceover(source, '        self.play(Write(Text("Hello")))', "动画开始", "teacher");
    expect(code).toContain("visual-python-tts:begin:");
    expect(code).toContain("visual-python-tts:end");
    expect(inspectVoiceovers(code, ["teacher"])).toMatchObject({ valid: true, cueCount: 0, synchronizedCount: 1 });
  });

  it("rejects ambiguous anchors and reports missing roles", () => {
    expect(() => insertStandaloneVoiceover("        self.wait(1)\n        self.wait(1)", "        self.wait(1)", "旁白")).toThrow("匹配到 2 处");
    const code = insertStandaloneVoiceover(source, '        self.play(Write(Text("Hello")))', "欢迎", "missing");
    expect(inspectVoiceovers(code, [])).toMatchObject({ valid: false });
  });

  it("rejects hallucinated Scene voiceover methods", () => {
    const code = source.replace('        self.play(Write(Text("Hello")))', '        self.add_synchronized_voiceover(text="旁白")\n        self.play(Write(Text("Hello")))');
    expect(countFakeVoiceoverApis(code)).toBe(1);
    expect(inspectVoiceovers(code, []).issues[0]).toContain("不存在的配音 Python 方法");
  });

  it("rejects nested synchronized voiceover ranges", () => {
    const begin = createVoiceoverMarker("begin", JSON.stringify("旁白"), "旁白");
    const code = `${begin}\n${begin}\nself.wait(1)\n${createVoiceoverEndMarker()}\n${createVoiceoverEndMarker()}`;
    const inspection = inspectVoiceovers(code, []);
    expect(inspection.valid).toBe(false);
    expect(inspection.issues).toContain("第 2 行的同步配音嵌套在另一个同步区间内；请拆分为不重叠的区间");
  });
});
