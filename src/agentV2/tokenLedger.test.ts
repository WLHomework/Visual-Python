import { describe, expect, it } from "vitest";
import { createAgentTokenUsage, mergeProviderTokenUsage } from "./tokenLedger";

describe("Agent token ledger", () => {
  it("tracks provider cache reads and derives uncached prompt tokens", () => {
    const usage = createAgentTokenUsage();

    mergeProviderTokenUsage(usage, {
      promptTokens: 1000,
      completionTokens: 80,
      totalTokens: 1080,
      cachedTokens: 760,
      cacheCreationTokens: 120,
    });
    mergeProviderTokenUsage(usage, {
      promptTokens: 2000,
      completionTokens: 100,
      totalTokens: 2100,
      cachedTokens: 1900,
    });

    expect(usage).toEqual(expect.objectContaining({
      prompt: 3000,
      completion: 180,
      total: 3180,
      cached: 2660,
      uncachedPrompt: 340,
      cacheCreation: 120,
      requests: 2,
    }));
    expect(usage.cacheHitRate).toBeCloseTo(2660 / 3000);
  });

  it("never reports more cached tokens than prompt tokens", () => {
    const usage = createAgentTokenUsage();
    mergeProviderTokenUsage(usage, { promptTokens: 10, cachedTokens: 30 });
    expect(usage.cached).toBe(10);
    expect(usage.uncachedPrompt).toBe(0);
    expect(usage.cacheHitRate).toBe(1);
  });

  it("includes requests without cache details in the overall hit-rate denominator", () => {
    const usage = createAgentTokenUsage();
    mergeProviderTokenUsage(usage, { promptTokens: 1000, completionTokens: 10 });
    mergeProviderTokenUsage(usage, { promptTokens: 2000, completionTokens: 10, cachedTokens: 1800 });

    expect(usage.cached).toBe(1800);
    expect(usage.uncachedPrompt).toBe(1200);
    expect(usage.cacheReportedRequests).toBe(1);
    expect(usage.cacheHitRate).toBe(0.6);
  });
});
