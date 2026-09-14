import { describe, expect, it } from "vitest";
import { nextStreamRevealLength } from "./liveStream";

describe("live stream reveal", () => {
  it("releases a few characters per frame and catches up when the backlog grows", () => {
    expect(nextStreamRevealLength(0, 3)).toBe(3);
    expect(nextStreamRevealLength(0, 20)).toBe(5);
    expect(nextStreamRevealLength(0, 100)).toBe(12);
    expect(nextStreamRevealLength(0, 400)).toBe(50);
  });
});
