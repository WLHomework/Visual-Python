import { describe, expect, it, vi, afterEach } from "vitest";
import { nextStreamRevealLength, publishLiveStream, subscribeLiveStream } from "./liveStream";

describe("live stream reveal", () => {
  it("releases a few characters per frame and catches up when the backlog grows", () => {
    expect(nextStreamRevealLength(0, 3)).toBe(3);
    expect(nextStreamRevealLength(0, 20)).toBe(5);
    expect(nextStreamRevealLength(0, 100)).toBe(12);
    expect(nextStreamRevealLength(0, 400)).toBe(50);
  });
});

describe("live stream flush throttling", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces bursts of publishes into one listener call per interval", () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    subscribeLiveStream("throttle", (text) => seen.push(text));
    for (let index = 1; index <= 20; index += 1) publishLiveStream("throttle", `t${index}`);
    expect(seen).toHaveLength(0); // 突发发布不会立即逐条触发监听器
    vi.advanceTimersByTime(300);
    expect(seen).toEqual(["t20"]); // 只收到合并后的最新值
  });
});
