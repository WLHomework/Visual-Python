export type VoiceoverBlockMetadata = { signature: string; durationSeconds: number };

type DataBlock = { data: string | null };
const key = "visualPythonManimVoiceover";

export function readVoiceoverBlockMetadata(block: DataBlock): VoiceoverBlockMetadata | null {
  if (!block.data) return null;
  try {
    const value = JSON.parse(block.data)?.[key] as Partial<VoiceoverBlockMetadata> | undefined;
    return value && typeof value.signature === "string" && Number.isFinite(value.durationSeconds) && Number(value.durationSeconds) > 0
      ? { signature: value.signature, durationSeconds: Number(value.durationSeconds) }
      : null;
  } catch {
    return null;
  }
}

export function writeVoiceoverBlockMetadata(block: DataBlock, metadata: VoiceoverBlockMetadata): void {
  let data: Record<string, unknown> = {};
  try {
    const parsed = block.data ? JSON.parse(block.data) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed;
  } catch {
    if (block.data) data.legacyData = block.data;
  }
  data[key] = metadata;
  block.data = JSON.stringify(data);
}
