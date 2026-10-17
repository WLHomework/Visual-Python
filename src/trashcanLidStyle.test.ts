import { describe, expect, it } from "vitest";
import { trashcanLidOverrideCss } from "./blocklyStyleOverrides";

// Blockly 13 rotates the trashcan lid only while the trashcan already holds
// deleted blocks. The override opens it for every drag-over so the drop target
// reads consistently, including an empty trashcan.
describe("blockly trashcan lid styling", () => {
  it("opens the lid for every drag-over, including an empty trashcan", () => {
    expect(trashcanLidOverrideCss).toMatch(/\.blocklyTrash\.blocklyTrashOpen \.blocklyTrashLid\s*\{\s*rotate:\s*45deg/);
    expect(trashcanLidOverrideCss).toMatch(/\.blocklyRTL \.blocklyTrash\.blocklyTrashOpen \.blocklyTrashLid\s*\{\s*rotate:\s*-45deg/);
  });
});
