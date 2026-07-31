import { describe, expect, it } from "vitest";
import { findManagedAudioMetadataRanges, stripManagedAudioMetadataForDisplay } from "./managedAudioMetadata";

const hiddenText = (source: string) => findManagedAudioMetadataRanges(source).map((range) => {
  const line = source.split("\n")[range.lineNumber - 1];
  return line.slice(range.startColumn - 1, range.endColumn - 1);
});

describe("managed audio metadata visibility", () => {
  it("hides only the machine suffix after a readable voiceover description", () => {
    const source = 'self.add_sound("voice.wav")  # 播放配音（渲染时生成）：“你好” | visual-python-tts:cue:YWJj';
    expect(hiddenText(source)).toEqual([" | visual-python-tts:cue:YWJj"]);
  });

  it("hides the entire metadata comment on local audio calls", () => {
    const source = "self.add_sound('audio.wav')  # visual-python-local-audio:cue:YWJj";
    expect(hiddenText(source)).toEqual(["  # visual-python-local-audio:cue:YWJj"]);
  });

  it("supports legacy marker-only lines without hiding ordinary comments", () => {
    const source = "# visual-python-tts:cue:YWJj\nprint('ok')  # 用户注释";
    expect(hiddenText(source)).toEqual(["# visual-python-tts:cue:YWJj"]);
    expect(stripManagedAudioMetadataForDisplay(source)).toBe("\nprint('ok')  # 用户注释");
  });

  it("removes metadata from displayed code diffs without changing their markers", () => {
    const source = "+ self.add_sound('audio.wav')  # visual-python-local-audio:cue:YWJj";
    expect(stripManagedAudioMetadataForDisplay(source)).toBe("+ self.add_sound('audio.wav')");
  });
});
