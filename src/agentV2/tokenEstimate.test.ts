import { describe, expect, it } from "vitest";
import { estimateTokens, truncateToTokens } from "./tokenEstimate";

describe("token estimation", () => {
  it("counts CJK characters as roughly one token each", () => {
    expect(estimateTokens("你好世界")).toBe(4);
    expect(estimateTokens("")).toBe(0);
  });

  it("counts non-CJK text as roughly four characters per token", () => {
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("abcd")).toBe(1);
  });

  it("blends CJK and ASCII densities", () => {
    // 4 个汉字（4 token）+ 8 个 ASCII 字符（2 token）。
    expect(estimateTokens("你好世界abcdefgh")).toBe(6);
  });

  it("truncates oversized text into the token budget", () => {
    const text = "x".repeat(400);
    const truncated = truncateToTokens(text, 10);
    expect(estimateTokens(truncated)).toBeLessThanOrEqual(11);
    expect(truncated).toContain("[内容已截断]");
  });

  it("keeps short text untouched", () => {
    expect(truncateToTokens("你好", 10)).toBe("你好");
  });
});
