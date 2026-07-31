import { describe, expect, it } from "vitest";
import { createLocalAudioBeginMarker, createLocalAudioEndMarker } from "./localAudioMarkers";
import { prepareManimStillImage } from "./stillImagePreprocessor";
import { createVoiceoverEndMarker, createVoiceoverMarker } from "./voiceoverMarkers";

describe("Manim still image preprocessing", () => {
  it("removes voiceover and local audio operations while preserving animation bodies", () => {
    const source = [
      "class MainScene(Scene):",
      "    def construct(self):",
      `        ${createVoiceoverMarker("begin", "'旁白'", "旁白")}`,
      "        self.play(Create(Circle()))",
      `        ${createVoiceoverEndMarker()}`,
      `        ${createLocalAudioBeginMarker({ version: 1, pathExpression: "'music.wav'", path: "music.wav" })}`,
      "        self.play(Create(Square()))",
      `        ${createLocalAudioEndMarker()}`,
    ].join("\n");

    const result = prepareManimStillImage(source);

    expect(result.omittedAudioSegments).toBe(2);
    expect(result.code).toContain("self.play(Create(Circle()))");
    expect(result.code).toContain("self.play(Create(Square()))");
    expect(result.code).not.toContain("visual-python-tts");
    expect(result.code).not.toContain("visual-python-local-audio");
    expect(result.code.match(/图片输出忽略音频/g)).toHaveLength(4);
  });
});
