export type LocalAudioMarkerPayload = {
  version: 1;
  pathExpression: string;
  path?: string;
  timeOffset?: number;
  gain?: number;
  blockId?: string;
};

export type LocalAudioCuePayload = LocalAudioMarkerPayload;

const encodeBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const decodeBase64 = (value: string) => {
  const binary = atob(value);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
};

export function createLocalAudioBeginMarker(payload: LocalAudioMarkerPayload): string {
  return "self.renderer.time  # 播放本地音频并同步执行 | visual-python-local-audio:begin:" + encodeBase64(JSON.stringify(payload));
}

export function createLocalAudioEndMarker(): string {
  return "self.wait(0)  # 本地音频同步结束，渲染时自动补足等待 | visual-python-local-audio:end";
}

export function createLocalAudioCueMarker(payload: LocalAudioCuePayload): string {
  const timeOffset = Number(payload.timeOffset ?? 0);
  const gain = Number(payload.gain ?? 0);
  return `self.add_sound(${payload.pathExpression}, time_offset=${timeOffset}, gain=${gain},)  # visual-python-local-audio:cue:${encodeBase64(JSON.stringify(payload))}`;
}

export function parseLocalAudioMarker(line: string): { kind: "begin" | "cue"; payload: LocalAudioMarkerPayload } | { kind: "end" } | null {
  const marker = line.trim();
  if (/visual-python-local-audio:end$/.test(marker)) return { kind: "end" };
  const match = marker.match(/visual-python-local-audio:begin:([A-Za-z0-9+/=]+)$/);
  const cueMatch = marker.match(/visual-python-local-audio:cue:([A-Za-z0-9+/=]+)$/);
  const encoded = match?.[1] ?? cueMatch?.[1];
  if (!encoded) return null;
  try {
    const payload = JSON.parse(decodeBase64(encoded)) as Partial<LocalAudioMarkerPayload>;
    if (payload.version !== 1 || typeof payload.pathExpression !== "string") return null;
    return { kind: cueMatch ? "cue" : "begin", payload: payload as LocalAudioMarkerPayload };
  } catch {
    return null;
  }
}
