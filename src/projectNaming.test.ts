import { describe, expect, it } from "vitest";
import { normalizeProjectFileName, projectFileBaseName } from "./projectNaming";

describe("project file naming", () => {
  it("adds the project extension and preserves readable names", () => {
    expect(projectFileBaseName("demo.VPY")).toBe("demo");
    expect(normalizeProjectFileName("线性函数演示")).toBe("线性函数演示.vpy");
    expect(normalizeProjectFileName("demo.VPY")).toBe("demo.vpy");
  });

  it("rejects invalid and reserved Windows names", () => {
    expect(normalizeProjectFileName("lesson:01")).toBeNull();
    expect(normalizeProjectFileName("CON.vpy")).toBeNull();
    expect(normalizeProjectFileName("  ")).toBeNull();
  });
});
