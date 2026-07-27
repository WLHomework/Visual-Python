import { describe, expect, it, vi } from "vitest";
import { createLocalAudioBeginMarker, createLocalAudioCueMarker, createLocalAudioEndMarker } from "./localAudioMarkers";
import { ManimLocalAudioError, prepareManimLocalAudio } from "./localAudioPreprocessor";

describe("Manim local audio preprocessing", () => {
  it("replaces a standalone cue marker with add_sound", async () => {
    const cue = createLocalAudioCueMarker({ version: 1, pathExpression: "'resource://audio-1'", path: "resource://audio-1", timeOffset: 0.5, gain: -2 });
    const prepared = await prepareManimLocalAudio(cue, async () => ({ path: "C:\\demo\\audio.wav", durationSeconds: 3 }));
    expect(prepared.code).toContain('self.add_sound("C:\\\\demo\\\\audio.wav", time_offset=0.5, gain=-2)');
    expect(prepared.synchronizedSegmentCount).toBe(0);
  });

  it("adds local audio and waits for the duration remaining after the offset", async () => {
    const begin = createLocalAudioBeginMarker({ version: 1, pathExpression: "'music.wav'", path: "C:\\audio\\music.wav", timeOffset: 1.25, gain: -4, blockId: "audio-block" });
    const resolveAudio = vi.fn(async () => ({ path: "C:\\audio\\music.wav", durationSeconds: 5 }));
    const prepared = await prepareManimLocalAudio(`${begin}\nself.play(Create(circle))\n${createLocalAudioEndMarker()}`, resolveAudio);
    expect(resolveAudio).toHaveBeenCalledWith({ path: "C:\\audio\\music.wav", timeOffset: 1.25, gain: -4, blockId: "audio-block" });
    expect(prepared.synchronizedSegmentCount).toBe(1);
    expect(prepared.code).toContain('self.add_sound("C:\\\\audio\\\\music.wav", time_offset=1.25, gain=-4)');
    expect(prepared.code).toContain("_visual_python_local_audio_start_1_remaining = 3.750 -");
    expect(prepared.code).toContain("self.wait(_visual_python_local_audio_start_1_remaining) if _visual_python_local_audio_start_1_remaining > 0 else None");
    expect(prepared.code).not.toContain("self.wait(max(0,");
  });

  it("rejects dynamic paths before rendering", async () => {
    const begin = createLocalAudioBeginMarker({ version: 1, pathExpression: "audio_path" });
    await expect(prepareManimLocalAudio(`${begin}\n${createLocalAudioEndMarker()}`, async () => ({ path: "unused", durationSeconds: 1 })))
      .rejects.toBeInstanceOf(ManimLocalAudioError);
  });
});
