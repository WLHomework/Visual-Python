import { describe, expect, it } from "vitest";
import { isBlockWorkspaceMode, normalizeWorkspaceMode } from "./workspaceMode";

describe("workspace modes", () => {
  it("normalizes persisted modes and rejects unknown values", () => {
    expect(normalizeWorkspaceMode("visual")).toBe("visual");
    expect(normalizeWorkspaceMode("code")).toBe("code");
    expect(normalizeWorkspaceMode("unknown")).toBe("split");
  });

  it("uses blocks as the source outside code mode", () => {
    expect(isBlockWorkspaceMode("visual")).toBe(true);
    expect(isBlockWorkspaceMode("split")).toBe(true);
    expect(isBlockWorkspaceMode("code")).toBe(false);
  });
});
