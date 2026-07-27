import { describe, expect, it } from "vitest";
import { readVoiceoverBlockMetadata, writeVoiceoverBlockMetadata } from "./voiceoverBlockMetadata";

describe("Manim voiceover block metadata", () => {
  it("persists duration metadata without discarding other block data", () => {
    const block = { data: '{"other":true}' };
    writeVoiceoverBlockMetadata(block, { signature: "teacher:text", durationSeconds: 2.5 });
    expect(JSON.parse(block.data).other).toBe(true);
    expect(readVoiceoverBlockMetadata(block)).toEqual({ signature: "teacher:text", durationSeconds: 2.5 });
  });
});
