import appSource from "./App.tsx?raw";
import { describe, expect, it } from "vitest";

// Blockly 13 loads the workspace sounds (delete / connect / drop feedback) and
// its UI sprites (trashcan, zoom controls, cursors) from the media directory.
// They must ship with the app so the dev server and the packaged desktop build
// work offline instead of falling back to https://static.blockly.com/media/.
const mediaAssets = import.meta.glob("../public/blockly-media/*");

describe("blockly workspace media assets", () => {
  it("ships the sounds and sprites Blockly loads from the media path", () => {
    const names = Object.keys(mediaAssets).map((path) => path.split("/").pop() ?? path);
    expect(names).toEqual(
      expect.arrayContaining(["click.mp3", "disconnect.mp3", "delete.mp3", "drop.mp3", "sprites.svg"]),
    );
  });

  it("keeps workspace sounds enabled with the local media path", () => {
    expect(appSource).not.toContain("sounds: false");
    expect(appSource).toContain('media: "blockly-media/"');
  });
});
