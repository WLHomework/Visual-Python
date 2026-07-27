import { describe, expect, it, vi } from "vitest";
import { createVoiceoverEndMarker, createVoiceoverMarker } from "./voiceoverMarkers";
import { fitSynchronizedVoiceoverTiming, prepareManimVoiceovers } from "./voiceoverPreprocessor";

describe("Manim voiceover preprocessing", () => {
  it("replaces cue markers without changing line numbers", async () => {
    const source = `    ${createVoiceoverMarker("cue", "'你好'", "你好")}\n    self.wait(1)`;
    const prepared = await prepareManimVoiceovers(source, async () => ({ path: "C:\\voice.wav", durationSeconds: 2.25 }));
    expect(prepared.code.split("\n")).toHaveLength(source.split("\n").length);
    expect(prepared.code).toContain('self.add_sound("C:\\\\voice.wav"); self.wait(2.250)');
    expect(prepared).toMatchObject({ clipCount: 1, segmentCount: 1, synchronizedSegmentCount: 0, totalDurationSeconds: 2.25 });
  });

  it("wraps animation statements and reuses duplicate clips", async () => {
    const marker = createVoiceoverMarker("begin", "'旁白'", "旁白");
    const synthesize = vi.fn(async () => ({ path: "voice.wav", durationSeconds: 3 }));
    const source = `${marker}\n    self.play(Create(circle))\n${createVoiceoverEndMarker()}\n${createVoiceoverMarker("cue", "'旁白'", "旁白")}`;
    const prepared = await prepareManimVoiceovers(source, synthesize);
    expect(prepared.clipCount).toBe(1);
    expect(prepared.segmentCount).toBe(2);
    expect(prepared.synchronizedSegmentCount).toBe(1);
    expect(prepared.totalDurationSeconds).toBe(6);
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(prepared.code).toContain("self.renderer.time");
    expect(prepared.code).toContain("self.play(Create(circle), run_time=3.000)");
    expect(prepared.code).toContain("self.wait(max(0, 3.000 -");
  });

  it("distributes narration time according to original play and wait durations", () => {
    const source = [
      "class Demo(Scene):",
      "    def construct(self):",
      "        self.play(Create(circle), run_time=2)",
      "        self.wait(1)",
    ].join("\n");
    const fitted = fitSynchronizedVoiceoverTiming(source, 3, 4, 6);
    expect(fitted).toContain("self.play(Create(circle), run_time=3.933)");
    expect(fitted).toContain("self.wait(2.067)");
  });

  it("supports multiline play calls and overrides only the outer run_time", () => {
    const source = [
      "        self.play(",
      "            Create(circle, run_time=4),",
      "            run_time=2,",
      "        )",
    ].join("\n");
    const fitted = fitSynchronizedVoiceoverTiming(source, 1, 4, 5);
    expect(fitted).toContain("Create(circle, run_time=4)");
    expect(fitted).toContain("run_time=5.000");
  });

  it("keeps a readable minimum duration when narration is too short", () => {
    const source = "self.play(Create(a))\nself.play(Create(b))";
    const fitted = fitSynchronizedVoiceoverTiming(source, 1, 2, 0.1);
    expect(fitted).toBe("self.play(Create(a), run_time=0.200)\nself.play(Create(b), run_time=0.200)");
  });

  it("rejects dynamic expressions that cannot be synthesized before rendering", async () => {
    await expect(prepareManimVoiceovers(createVoiceoverMarker("cue", "answer"), async () => ({ path: "voice.wav", durationSeconds: 1 }))).rejects.toThrow("Python 文本积木");
  });

  it("keeps identical text separate when voiceover roles differ", async () => {
    const synthesize = vi.fn(async () => ({ path: "voice.wav", durationSeconds: 1 }));
    const source = `${createVoiceoverMarker("cue", "'你好'", "你好", "teacher")}\n${createVoiceoverMarker("cue", "'你好'", "你好", "student")}`;
    const prepared = await prepareManimVoiceovers(source, synthesize);
    expect(prepared.clipCount).toBe(2);
    expect(synthesize).toHaveBeenNthCalledWith(1, { text: "你好", roleId: "teacher" });
    expect(synthesize).toHaveBeenNthCalledWith(2, { text: "你好", roleId: "student" });
  });
});
