export class ManimRenderCancelledError extends Error {
  constructor() {
    super("Manim render preparation was cancelled");
    this.name = "ManimRenderCancelledError";
  }
}

export class ManimRenderAttempt {
  readonly id: number;
  cancelled = false;

  constructor(id: number) {
    this.id = id;
  }

  cancel(): void {
    this.cancelled = true;
  }

  assertActive(current: ManimRenderAttempt | null): void {
    if (this.cancelled || current !== this) throw new ManimRenderCancelledError();
  }
}
