import { describe, expect, it } from "vitest";
import { projectResourceReference, resolveProjectResourceReference, type ProjectResource } from "./projectResources";

const resource: ProjectResource = {
  id: "audio-1",
  type: "audio",
  path: "audio/music.wav",
  originalName: "music.wav",
  size: 42,
};

describe("project resources", () => {
  it("creates and resolves a stable resource reference", () => {
    const reference = projectResourceReference(resource.id);
    expect(reference).toBe("resource://audio-1");
    expect(resolveProjectResourceReference(reference, [resource], "C:\\demo\\lesson.vpy"))
      .toBe("C:\\demo\\lesson.assets\\audio\\music.wav");
  });

  it("keeps ordinary paths unchanged and rejects unresolved resources", () => {
    expect(resolveProjectResourceReference("C:\\audio\\music.wav", [], null)).toBe("C:\\audio\\music.wav");
    expect(resolveProjectResourceReference("resource://missing", [resource], "C:\\demo\\lesson.vpy")).toBeNull();
  });
});
