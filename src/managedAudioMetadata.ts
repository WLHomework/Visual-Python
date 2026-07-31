export type ManagedAudioMetadataRange = {
  lineNumber: number;
  startColumn: number;
  endColumn: number;
};

const managedAudioMarkerPattern = /visual-python-(?:tts|local-audio):(?:cue|begin|end)(?::[A-Za-z0-9+/=]+)?/;

export function findManagedAudioMetadataRanges(source: string): ManagedAudioMetadataRange[] {
  const ranges: ManagedAudioMetadataRange[] = [];
  source.split("\n").forEach((line, index) => {
    const markerIndex = line.search(managedAudioMarkerPattern);
    if (markerIndex < 0) return;

    const readableSeparator = line.lastIndexOf(" | ", markerIndex);
    let start = readableSeparator >= 0 ? readableSeparator : line.lastIndexOf("#", markerIndex);
    if (start < 0) start = markerIndex;
    while (start > 0 && line[start - 1] === " ") start -= 1;
    ranges.push({ lineNumber: index + 1, startColumn: start + 1, endColumn: line.length + 1 });
  });
  return ranges;
}

export function stripManagedAudioMetadataForDisplay(source: string): string {
  const rangesByLine = new Map(findManagedAudioMetadataRanges(source).map((range) => [range.lineNumber, range]));
  return source.split("\n").map((line, index) => {
    const range = rangesByLine.get(index + 1);
    if (!range) return line;
    return `${line.slice(0, range.startColumn - 1)}${line.slice(range.endColumn - 1)}`;
  }).join("\n");
}
