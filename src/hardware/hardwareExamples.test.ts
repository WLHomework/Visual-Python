import { describe, expect, it } from "vitest";
import { supportedHardwareBoards } from "./firmwareCatalog";
import { hardwareExampleGroups, hardwareExamples, hardwareExamplesForBoard } from "./hardwareExamples";

const serialized = (example: { workspace: object }) => JSON.stringify(example.workspace);

describe("hardware examples", () => {
  it("provides categorized examples for every supported board", () => {
    for (const boardId of supportedHardwareBoards) {
      const examples = hardwareExamplesForBoard(boardId);
      expect(examples.length).toBeGreaterThanOrEqual(4);
      expect(examples.every((example) => example.boardId === boardId)).toBe(true);
      expect(hardwareExampleGroups(boardId).length).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(hardwareExamples.map((example) => example.id)).size).toBe(hardwareExamples.length);
  });

  it("stores Blockly workspaces instead of plain code", () => {
    for (const example of hardwareExamples) {
      const state = example.workspace as { blocks?: { blocks?: unknown[] } };
      expect(Array.isArray(state.blocks?.blocks)).toBe(true);
      expect(serialized(example)).toContain("hardware_forever");
    }
  });

  it("uses board-specific blocks and pins", () => {
    expect(hardwareExamplesForBoard("esp32-s3").map(serialized).join("\n")).toContain("hardware_onboard_rgb");
    expect(hardwareExamplesForBoard("esp32-s3").map(serialized).join("\n")).toContain('"COLOR":"red"');
    expect(hardwareExamplesForBoard("esp32-wroom").map(serialized).join("\n")).toContain("hardware_builtin_led");
    expect(hardwareExamplesForBoard("esp8266-esp12e").map(serialized).join("\n")).toContain("hardware_analog_read");
    expect(hardwareExamplesForBoard("esp8266-esp12e").map(serialized).join("\n")).toContain('"A0"');
  });
});
