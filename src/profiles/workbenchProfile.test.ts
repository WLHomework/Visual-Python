import { describe, expect, it } from "vitest";
import {
  getWorkbenchProfile,
  isHardwareWorkbench,
  isWorkbenchProfileId,
  listWorkbenchProfiles,
  normalizeWorkbenchProfileId,
  readStoredWorkbenchProfileId,
  storeWorkbenchProfileId,
  workbenchProfileStorageKey,
} from "./workbenchProfile";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
};

describe("workbench profiles", () => {
  it("lists python first and one profile per supported board", () => {
    expect(listWorkbenchProfiles().map((profile) => profile.id)).toEqual(["python", "esp32-wroom", "esp8266-esp12e", "esp32-s3"]);
    expect(getWorkbenchProfile("esp8266-esp12e").label).toBe("ESP8266 ESP-12E（NodeMCU）");
    expect(getWorkbenchProfile("python").label).toBe("Python");
  });

  it("keeps the python and hardware interfaces independent through feature flags", () => {
    const python = getWorkbenchProfile("python");
    expect(python.features).toMatchObject({ manim: true, pythonEnvironment: true, renderPreview: true, devicePanel: false, stdin: true, projectResources: true, multipleDocuments: true });
    expect(isHardwareWorkbench(python)).toBe(false);

    const hardware = getWorkbenchProfile("esp32-wroom");
    expect(hardware.features).toMatchObject({ manim: false, pythonEnvironment: false, renderPreview: false, devicePanel: true, stdin: false, projectResources: false, multipleDocuments: false });
    expect(isHardwareWorkbench(hardware)).toBe(true);
    expect(hardware.boardId).toBe("esp32-wroom");
  });

  it("describes every profile for the new project dialog", () => {
    for (const profile of listWorkbenchProfiles()) {
      expect(profile.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("normalizes unknown ids to python", () => {
    expect(isWorkbenchProfileId("esp32-wroom")).toBe(true);
    expect(isWorkbenchProfileId("esp32-s3")).toBe(true);
    expect(isWorkbenchProfileId(undefined)).toBe(false);
    expect(normalizeWorkbenchProfileId("esp32-s3")).toBe("esp32-s3");
    expect(normalizeWorkbenchProfileId(42, "esp32-wroom")).toBe("esp32-wroom");
    expect(getWorkbenchProfile("esp32-s3").id).toBe("esp32-s3");
  });

  it("round-trips the stored profile and survives broken storage", () => {
    const storage = memoryStorage();
    expect(readStoredWorkbenchProfileId(storage)).toBe("python");

    storeWorkbenchProfileId(storage, "esp8266-esp12e");
    expect(storage.getItem(workbenchProfileStorageKey)).toBe("esp8266-esp12e");
    expect(readStoredWorkbenchProfileId(storage)).toBe("esp8266-esp12e");

    storage.setItem(workbenchProfileStorageKey, "unknown-board");
    expect(readStoredWorkbenchProfileId(storage)).toBe("python");

    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(readStoredWorkbenchProfileId(broken)).toBe("python");
    expect(() => storeWorkbenchProfileId(broken, "esp32-wroom")).not.toThrow();
  });
});
