import { describe, expect, it } from "vitest";
import { consoleStickThreshold, nextConsoleStickToLatest } from "./consoleAutoScroll";

describe("nextConsoleStickToLatest", () => {
  it("stays stuck when the scroll position is at (or near) the bottom", () => {
    expect(nextConsoleStickToLatest({ stick: false, previousTop: 0, top: 0, distanceToBottom: 0 })).toBe(true);
    expect(nextConsoleStickToLatest({ stick: false, previousTop: 40, top: 60, distanceToBottom: consoleStickThreshold })).toBe(true);
  });

  it("stops following when the user scrolls up", () => {
    expect(nextConsoleStickToLatest({ stick: true, previousTop: 600, top: 400, distanceToBottom: 200 })).toBe(false);
  });

  it("keeps following when new output only grows the content", () => {
    // scrollTop 没变、内容变长：这是输出灌进来的结果，不是用户想离开底部。
    expect(nextConsoleStickToLatest({ stick: true, previousTop: 600, top: 600, distanceToBottom: 300 })).toBe(true);
  });

  it("does not resume following when the user scrolls down without reaching the bottom", () => {
    expect(nextConsoleStickToLatest({ stick: false, previousTop: 200, top: 260, distanceToBottom: 300 })).toBe(false);
  });
});
