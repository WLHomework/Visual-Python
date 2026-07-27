import { describe, expect, it } from "vitest";
import { ManimRenderAttempt, ManimRenderCancelledError } from "./manimRenderCancellation";

describe("Manim render cancellation", () => {
  it("prevents delayed preparation from continuing after cancellation", async () => {
    const attempt = new ManimRenderAttempt(1);
    let current: ManimRenderAttempt | null = attempt;
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    const preparation = (async () => {
      await delayed;
      attempt.assertActive(current);
      return "start-render";
    })();

    attempt.cancel();
    current = null;
    release();

    await expect(preparation).rejects.toBeInstanceOf(ManimRenderCancelledError);
  });

  it("rejects stale attempts after a newer render starts", () => {
    const oldAttempt = new ManimRenderAttempt(1);
    const current = new ManimRenderAttempt(2);
    expect(() => oldAttempt.assertActive(current)).toThrow(ManimRenderCancelledError);
    expect(() => current.assertActive(current)).not.toThrow();
  });
});
