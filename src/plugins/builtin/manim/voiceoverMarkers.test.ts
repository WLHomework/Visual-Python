import { describe, expect, it } from "vitest";
import { createVoiceoverEndMarker, createVoiceoverMarker, parseVoiceoverMarker } from "./voiceoverMarkers";

describe("Manim voiceover markers", () => {
  it("round-trips Unicode Python text expressions", () => {
    const marker = createVoiceoverMarker("cue", "'欢迎学习一次函数'");
    expect(marker.startsWith('self.add_sound("visual-python-voiceover.wav")')).toBe(true);
    expect(marker).toContain("播放配音（渲染时生成）");
    expect(marker).toContain("visual-python-tts:cue:");
    expect(parseVoiceoverMarker(marker)).toEqual({ kind: "cue", payload: { version: 1, textExpression: "'欢迎学习一次函数'" } });
  });

  it("uses distinct valid placeholders for standalone and synchronized voiceovers", () => {
    expect(createVoiceoverMarker("cue", "'旁白'", "旁白")).toMatch(/^self\.add_sound\("visual-python-voiceover\.wav"\)/);
    expect(createVoiceoverMarker("begin", "'讲解'", "讲解")).toMatch(/^self\.add_sound\("visual-python-voiceover\.wav"\)/);
    expect(createVoiceoverEndMarker()).toContain("self.wait(0)");
  });

  it("recognizes container boundaries and rejects invalid payloads", () => {
    expect(parseVoiceoverMarker(createVoiceoverEndMarker())).toEqual({ kind: "end" });
    expect(parseVoiceoverMarker("pass  # visual-python-tts:end")).toEqual({ kind: "end" });
    expect(parseVoiceoverMarker("# visual-python-tts:cue:not-base64" )).toBeNull();
  });

  it("keeps readable summaries on one line and parses legacy markers", () => {
    const marker = createVoiceoverMarker("cue", "'hello'", "第一行\n第二行");
    expect(marker).not.toContain("\n");
    expect(marker).toContain("第一行 第二行");
    const payload = marker.slice(marker.lastIndexOf(":") + 1);
    expect(parseVoiceoverMarker(`pass  # visual-python-tts:cue:${payload}`)?.kind).toBe("cue");
  });
});
