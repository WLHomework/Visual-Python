import { parseLocalAudioMarker } from "./localAudioMarkers";

export type LocalAudioRequest = { path: string; timeOffset: number; gain: number; blockId?: string };
export type ResolvedLocalAudio = { path: string; durationSeconds: number };

export class ManimLocalAudioError extends Error {
  readonly request: Partial<LocalAudioRequest>;
  constructor(message: string, request: Partial<LocalAudioRequest>) {
    super(message);
    this.name = "ManimLocalAudioError";
    this.request = request;
  }
}

export async function prepareManimLocalAudio(
  source: string,
  resolveAudio: (request: LocalAudioRequest) => Promise<ResolvedLocalAudio>,
): Promise<{ code: string; synchronizedSegmentCount: number }> {
  const lines = source.split("\n");
  const stack: Array<{ variable: string; duration: number }> = [];
  let synchronizedSegmentCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const marker = parseLocalAudioMarker(lines[index]);
    if (!marker) continue;
    const indent = lines[index].match(/^\s*/)?.[0] ?? "";
    if (marker.kind === "end") {
      const active = stack.pop();
      if (!active) throw new Error("本地音频时间轴缺少开始积木");
      lines[index] = indent + "self.wait(max(0, " + active.duration.toFixed(3) + " - (self.renderer.time - " + active.variable + ")))";
      continue;
    }

    const payload = marker.payload;
    const request = { path: payload.path ?? "", timeOffset: Number(payload.timeOffset ?? 0), gain: Number(payload.gain ?? 0), blockId: payload.blockId };
    if (payload.path === undefined) throw new ManimLocalAudioError("本地音频路径需要直接连接 Python 文本积木", request);
    if (!payload.path.trim()) throw new ManimLocalAudioError("本地音频路径不能为空", request);
    if (!Number.isFinite(request.timeOffset) || request.timeOffset < 0) throw new ManimLocalAudioError("本地音频开始偏移必须是大于等于零的数字", request);
    if (!Number.isFinite(request.gain)) throw new ManimLocalAudioError("本地音频音量增益必须是数字", request);
    const resolved = await resolveAudio(request);
    if (marker.kind === "cue") {
      lines[index] = indent + "self.add_sound(" + JSON.stringify(resolved.path) + ", time_offset=" + request.timeOffset + ", gain=" + request.gain + ")";
      continue;
    }
    if (!Number.isFinite(resolved.durationSeconds) || resolved.durationSeconds <= 0) throw new ManimLocalAudioError("无法读取本地音频时长", request);
    const remainingDuration = Math.max(0, resolved.durationSeconds - request.timeOffset);
    const variable = "_visual_python_local_audio_start_" + (index + 1);
    stack.push({ variable, duration: remainingDuration });
    synchronizedSegmentCount += 1;
    lines[index] = indent + variable + " = self.renderer.time; self.add_sound(" + JSON.stringify(resolved.path) + ", time_offset=" + request.timeOffset + ", gain=" + request.gain + ")";
  }
  if (stack.length) throw new Error("本地音频时间轴缺少结束积木");
  return { code: lines.join("\n"), synchronizedSegmentCount };
}
