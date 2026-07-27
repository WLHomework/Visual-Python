export type VoiceoverMarkerKind = "cue" | "begin" | "end";

export type VoiceoverMarkerPayload = {
  version: 1;
  textExpression: string;
  text?: string;
  roleId?: string;
  blockId?: string;
};

const markerPrefix = "# visual-python-tts:";

const readableSummary = (text: string | undefined) => {
  if (text === undefined) return "动态文本";
  const singleLine = text.replace(/[\r\n]+/g, " ").trim();
  const shortened = singleLine.length > 36 ? `${singleLine.slice(0, 36)}…` : singleLine;
  return `“${shortened || "空文本"}”`;
};

const encodeBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const decodeBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export function createVoiceoverMarker(kind: Exclude<VoiceoverMarkerKind, "end">, textExpression: string, text?: string, roleId?: string, blockId?: string): string {
  const payload: VoiceoverMarkerPayload = { version: 1, textExpression, ...(text === undefined ? {} : { text }), ...(roleId && roleId !== "default" ? { roleId } : {}), ...(blockId ? { blockId } : {}) };
  const description = kind === "begin" ? "播放配音并同步动画" : "播放配音（渲染时生成）";
  const placeholder = 'self.add_sound("visual-python-voiceover.wav")';
  return `${placeholder}  # ${description}：${readableSummary(text)} | visual-python-tts:${kind}:${encodeBase64(JSON.stringify(payload))}`;
}

export function createVoiceoverEndMarker(): string {
  return "self.wait(0)  # 配音同步结束，渲染时自动补足等待 | visual-python-tts:end";
}

export function parseVoiceoverMarker(line: string): { kind: VoiceoverMarkerKind; payload?: VoiceoverMarkerPayload } | null {
  const marker = line.trim();
  if (/visual-python-tts:end$/.test(marker) || marker === `${markerPrefix}end`) return { kind: "end" };
  const match = marker.match(/visual-python-tts:(cue|begin):([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  try {
    const payload = JSON.parse(decodeBase64(match[2])) as Partial<VoiceoverMarkerPayload>;
    if (payload.version !== 1 || typeof payload.textExpression !== "string") return null;
    return { kind: match[1] as "cue" | "begin", payload: payload as VoiceoverMarkerPayload };
  } catch {
    return null;
  }
}
