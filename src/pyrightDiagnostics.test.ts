import { describe, expect, it } from "vitest";
import { formatPyrightDiagnostic } from "./pyrightDiagnostics";

const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } };

describe("Pyright diagnostics", () => {
  it("turns common semantic errors into actionable Chinese guidance", () => {
    expect(formatPyrightDiagnostic({
      range,
      severity: 1,
      code: "reportUndefinedVariable",
      message: '"circle" is not defined',
    })).toMatchObject({ message: expect.stringContaining("circle") });

    expect(formatPyrightDiagnostic({
      range,
      severity: 1,
      code: "reportArgumentType",
      message: 'Argument of type "str" cannot be assigned to parameter "radius" of type "float"',
    })).toMatchObject({ message: expect.stringContaining("radius") });

    expect(formatPyrightDiagnostic({
      range,
      severity: 1,
      code: "reportMissingImports",
      message: 'Import "manim" could not be resolved',
    })).toMatchObject({ message: expect.stringContaining("manim") });
  });
});
