import { describe, expect, it } from "vitest";
import { analyzeVoiceSample, bytesToBase64, createWaveformPeaks, encodeMonoPcmWav, mergeAudioChunks, pcmSignalLevel, resampleMonoPcm, trimMonoPcm } from "./voiceRecording";

describe("voice recording helpers", () => {
  it("merges and downsamples mono PCM", () => {
    const merged = mergeAudioChunks([new Float32Array([0, 1]), new Float32Array([-1, 0.5])]);
    expect(Array.from(merged)).toEqual([0, 1, -1, 0.5]);
    const resampled = resampleMonoPcm(new Float32Array(48_000).fill(0.25), 48_000);
    expect(resampled.sampleRate).toBe(24_000);
    expect(resampled.samples).toHaveLength(24_000);
    expect(resampled.samples[0]).toBeCloseTo(0.25);
  });

  it("encodes a valid 16-bit mono WAV", () => {
    const wav = encodeMonoPcmWav(new Float32Array([0, 1, -1]), 24_000);
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(wav.subarray(8, 12))).toBe("WAVE");
    expect(new DataView(wav.buffer).getUint32(24, true)).toBe(24_000);
    expect(bytesToBase64(wav)).toBe(btoa(String.fromCharCode(...wav)));
  });

  it("rejects silent samples and accepts clear speech-level audio", () => {
    expect(analyzeVoiceSample(new Float32Array(24_000 * 5), 24_000).severity).toBe("error");
    const speech = new Float32Array(24_000 * 12);
    for (let index = 0; index < speech.length; index += 1) speech[index] = Math.sin(index / 8) * 0.1;
    const quality = analyzeVoiceSample(speech, 24_000);
    expect(quality.severity).toBe("good");
    expect(quality.durationSeconds).toBe(12);
    expect(quality.activeSeconds).toBeCloseTo(12);
    expect(pcmSignalLevel(speech)).toBeGreaterThan(0);
  });

  it("rejects samples without ten seconds of active speech", () => {
    const shortSpeech = new Float32Array(24_000 * 9);
    for (let index = 0; index < shortSpeech.length; index += 1) shortSpeech[index] = Math.sin(index / 8) * 0.1;
    expect(analyzeVoiceSample(shortSpeech, 24_000).issues.join(" ")).toContain("不足 10 秒");

    const sparseSpeech = new Float32Array(24_000 * 15);
    for (let index = 0; index < 24_000 * 7; index += 1) sparseSpeech[index] = Math.sin(index / 8) * 0.1;
    expect(analyzeVoiceSample(sparseSpeech, 24_000).issues.join(" ")).toContain("有效人声不足 10 秒");
  });

  it("warns about clipped audio", () => {
    const quality = analyzeVoiceSample(new Float32Array(24_000 * 12).fill(1), 24_000);
    expect(quality.severity).toBe("warning");
    expect(quality.issues.join(" ")).toContain("削波");
  });

  it("builds normalized waveform peaks and trims by time", () => {
    const samples = new Float32Array([0, 0.25, -0.5, 1, 0.5, 0, -0.25, 0]);
    expect(createWaveformPeaks(samples, 4)).toEqual([0.25, 1, 0.5, 0.25]);
    expect(Array.from(trimMonoPcm(samples, 4, 0.5, 1.5))).toEqual([-0.5, 1, 0.5, 0]);
  });

  it("marks samples longer than the service limit as invalid", () => {
    const samples = new Float32Array(24_000 * 21);
    for (let index = 0; index < samples.length; index += 1) samples[index] = Math.sin(index / 8) * 0.1;
    const quality = analyzeVoiceSample(samples, 24_000);
    expect(quality.severity).toBe("error");
    expect(quality.issues.join(" ")).toContain("20 秒");
  });
});
