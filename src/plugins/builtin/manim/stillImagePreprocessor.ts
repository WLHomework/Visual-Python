import { parseLocalAudioMarker } from "./localAudioMarkers";
import { parseVoiceoverMarker } from "./voiceoverMarkers";

export function prepareManimStillImage(source: string): { code: string; omittedAudioSegments: number } {
  let omittedAudioSegments = 0;
  const lines = source.split("\n").map((line) => {
    const voiceover = parseVoiceoverMarker(line);
    const localAudio = parseLocalAudioMarker(line);
    if (!voiceover && !localAudio) return line;
    if ((voiceover && voiceover.kind !== "end") || (localAudio && localAudio.kind !== "end")) omittedAudioSegments += 1;
    const indent = line.match(/^\s*/)?.[0] ?? "";
    return `${indent}pass  # 图片输出忽略音频`;
  });
  return { code: lines.join("\n"), omittedAudioSegments };
}
