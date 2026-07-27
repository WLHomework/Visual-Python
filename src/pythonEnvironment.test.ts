import { describe, expect, it } from "vitest";
import { isSupportedPythonVersion, readStoredPythonEnvironment } from "./pythonEnvironment";

describe("Python environment compatibility", () => {
  it("accepts only the Python versions supported by current Manim", () => {
    expect(isSupportedPythonVersion("3.11.9")).toBe(true);
    expect(isSupportedPythonVersion("3.14.0")).toBe(true);
    expect(isSupportedPythonVersion("3.10.14")).toBe(false);
    expect(isSupportedPythonVersion("3.15.0a1")).toBe(false);
    expect(isSupportedPythonVersion("2.7.18")).toBe(false);
  });

  it("rejects stale or malformed stored environments", () => {
    expect(readStoredPythonEnvironment(JSON.stringify({ path: "C:/Python311/python.exe", version: "3.11.9", implementation: "cpython", virtual_env: false }))).not.toBeNull();
    expect(readStoredPythonEnvironment(JSON.stringify({ path: "C:/Python310/python.exe", version: "3.10.14", implementation: "cpython", virtual_env: false }))).toBeNull();
    expect(readStoredPythonEnvironment("not json")).toBeNull();
  });
});

