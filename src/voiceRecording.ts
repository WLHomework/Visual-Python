export function mergeAudioChunks(chunks: Float32Array[]): Float32Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export function resampleMonoPcm(input: Float32Array, inputRate: number, targetRate = 24_000): { samples: Float32Array; sampleRate: number } {
  if (!Number.isFinite(inputRate) || inputRate <= 0) throw new Error("录音采样率无效");
  if (inputRate <= targetRate) return { samples: input, sampleRate: Math.round(inputRate) };
  const ratio = inputRate / targetRate;
  const output = new Float32Array(Math.max(1, Math.round(input.length / ratio)));
  for (let index = 0; index < output.length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((index + 1) * ratio)));
    let sum = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) sum += input[sourceIndex];
    output[index] = sum / (end - start);
  }
  return { samples: output, sampleRate: targetRate };
}

export function encodeMonoPcmWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function createWaveformPeaks(samples: Float32Array, count = 96): number[] {
  const bucketCount = Math.max(1, Math.floor(count));
  if (!samples.length) return Array.from({ length: bucketCount }, () => 0);
  const peaks = Array.from({ length: bucketCount }, (_, bucket) => {
    const start = Math.floor(bucket * samples.length / bucketCount);
    const end = Math.max(start + 1, Math.floor((bucket + 1) * samples.length / bucketCount));
    let peak = 0;
    for (let index = start; index < Math.min(samples.length, end); index += 1) {
      peak = Math.max(peak, Math.abs(samples[index]));
    }
    return peak;
  });
  const maximum = Math.max(...peaks);
  return maximum > 0 ? peaks.map((peak) => peak / maximum) : peaks;
}

export function trimMonoPcm(samples: Float32Array, sampleRate: number, startSeconds: number, endSeconds: number): Float32Array {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error("录音采样率无效");
  const duration = samples.length / sampleRate;
  const start = Math.max(0, Math.min(duration, Number.isFinite(startSeconds) ? startSeconds : 0));
  const end = Math.max(start, Math.min(duration, Number.isFinite(endSeconds) ? endSeconds : duration));
  return samples.slice(Math.floor(start * sampleRate), Math.ceil(end * sampleRate));
}

export type VoiceSampleQuality = {
  severity: "good" | "warning" | "error";
  durationSeconds: number;
  activeSeconds: number;
  levelDb: number;
  peakDb: number;
  clippedRatio: number;
  activeRatio: number;
  issues: string[];
};

const amplitudeToDb = (value: number) => value > 0 ? 20 * Math.log10(value) : -120;

export function pcmSignalLevel(samples: Float32Array): number {
  if (!samples.length) return 0;
  let squareSum = 0;
  for (const sample of samples) squareSum += sample * sample;
  const db = amplitudeToDb(Math.sqrt(squareSum / samples.length));
  return Math.min(1, Math.max(0, (db + 50) / 45));
}

export function analyzeVoiceSample(samples: Float32Array, sampleRate: number): VoiceSampleQuality {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error("录音采样率无效");
  let squareSum = 0;
  let peak = 0;
  let clipped = 0;
  for (const sample of samples) {
    const absolute = Math.abs(sample);
    squareSum += sample * sample;
    peak = Math.max(peak, absolute);
    if (absolute >= 0.98) clipped += 1;
  }
  const levelDb = amplitudeToDb(samples.length ? Math.sqrt(squareSum / samples.length) : 0);
  const peakDb = amplitudeToDb(peak);
  const frameSize = Math.max(1, Math.round(sampleRate * 0.05));
  let frames = 0;
  let activeFrames = 0;
  let activeSeconds = 0;
  for (let offset = 0; offset < samples.length; offset += frameSize) {
    const end = Math.min(samples.length, offset + frameSize);
    let frameSquares = 0;
    for (let index = offset; index < end; index += 1) frameSquares += samples[index] * samples[index];
    if (amplitudeToDb(Math.sqrt(frameSquares / (end - offset))) >= -40) {
      activeFrames += 1;
      activeSeconds += (end - offset) / sampleRate;
    }
    frames += 1;
  }
  const durationSeconds = samples.length / sampleRate;
  const clippedRatio = samples.length ? clipped / samples.length : 0;
  const activeRatio = frames ? activeFrames / frames : 0;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (durationSeconds < 10) errors.push("声音样本不足 10 秒");
  if (durationSeconds > 20.5) errors.push("声音样本不能超过 20 秒");
  if (peakDb < -45) errors.push("录音接近静音");
  if (activeSeconds < 10) errors.push("检测到的有效人声不足 10 秒，请减少停顿并持续清晰说话");
  if (levelDb < -30 && peakDb >= -45) warnings.push("录音音量偏低");
  if (levelDb > -8) warnings.push("录音音量过高");
  if (clippedRatio > 0.005) warnings.push("录音存在明显削波失真");
  if (activeRatio >= 0.15 && activeRatio < 0.5) warnings.push("样本中的有效人声偏少");
  return {
    severity: errors.length ? "error" : warnings.length ? "warning" : "good",
    durationSeconds,
    activeSeconds,
    levelDb,
    peakDb,
    clippedRatio,
    activeRatio,
    issues: [...errors, ...warnings],
  };
}
