import { describe, expect, it } from "vitest";
import type * as Blockly from "blockly/core";
import {
  applyHardwareRunTarget,
  buildTargetToolbox,
  defaultHardwareBoardId,
  hardwareBoardId,
  hardwareBoardLabel,
  hardwareBoardOptions,
  hardwareTargetFromProject,
  hardwareTargetStorageKey,
  hardwareTargetToProject,
  normalizeHardwareRunTarget,
  readStoredHardwareRunTarget,
  storeHardwareRunTarget,
  type HardwareRunTarget,
} from "./hardwareTarget";
import { getActiveHardwareBoard } from "./hardwareBlocks";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
};

const fakeToolbox = {
  kind: "categoryToolbox",
  contents: [
    { kind: "category", name: "输入输出", colour: "#2f9e8f", contents: [] },
    { kind: "category", name: "循环", colour: "#4b9b62", contents: [] },
    { kind: "category", name: "Manim 动画", colour: "#123456", contents: [] },
    { kind: "sep", gap: 20 },
  ],
} as unknown as Blockly.utils.toolbox.ToolboxDefinition;

const categoryNames = (toolbox: Blockly.utils.toolbox.ToolboxDefinition) =>
  ((toolbox as unknown as { contents: Array<{ kind?: string; name?: string }> }).contents)
    .filter((item) => item.kind === "category")
    .map((item) => item.name);

describe("hardware run target", () => {
  it("normalizes stored and project values into a host or device target", () => {
    expect(normalizeHardwareRunTarget(null)).toEqual({ target: "host" });
    expect(normalizeHardwareRunTarget({ target: "device", boardId: "esp8266-esp12e" })).toEqual({ target: "device", boardId: "esp8266-esp12e" });
    expect(normalizeHardwareRunTarget({ target: "device", boardId: "esp32-s3" })).toEqual({ target: "device", boardId: defaultHardwareBoardId });
    expect(normalizeHardwareRunTarget({ target: "host", boardId: "esp32-wroom" })).toEqual({ target: "host" });
    expect(normalizeHardwareRunTarget("device")).toEqual({ target: "host" });
    expect(normalizeHardwareRunTarget({}, { target: "device", boardId: "esp32-wroom" })).toEqual({ target: "device", boardId: "esp32-wroom" });
  });

  it("maps between project files and run targets without inventing boards", () => {
    expect(hardwareTargetFromProject(undefined)).toEqual({ target: "host" });
    expect(hardwareTargetFromProject({ target: "host" })).toEqual({ target: "host" });
    expect(hardwareTargetFromProject({ target: "device", boardId: "esp32-wroom" })).toEqual({ target: "device", boardId: "esp32-wroom" });
    expect(hardwareTargetFromProject({ target: "device" })).toEqual({ target: "host" });
    expect(hardwareTargetToProject({ target: "host" })).toEqual({ target: "host" });
    expect(hardwareTargetToProject({ target: "device", boardId: "esp8266-esp12e" })).toEqual({ target: "device", boardId: "esp8266-esp12e" });
    expect(hardwareTargetToProject({ target: "device" })).toEqual({ target: "host" });
  });

  it("round-trips the stored target and survives broken storage", () => {
    const storage = memoryStorage();
    expect(readStoredHardwareRunTarget(storage)).toEqual({ target: "host" });

    storeHardwareRunTarget(storage, { target: "device", boardId: "esp8266-esp12e" });
    expect(storage.getItem(hardwareTargetStorageKey)).toBe(JSON.stringify({ target: "device", boardId: "esp8266-esp12e" }));
    expect(readStoredHardwareRunTarget(storage)).toEqual({ target: "device", boardId: "esp8266-esp12e" });

    storage.setItem(hardwareTargetStorageKey, "{not json");
    expect(readStoredHardwareRunTarget(storage)).toEqual({ target: "host" });
  });

  it("activates the board profile only in device mode", () => {
    applyHardwareRunTarget({ target: "device", boardId: "esp8266-esp12e" });
    expect(getActiveHardwareBoard()?.boardId).toBe("esp8266-esp12e");
    expect(hardwareBoardId({ target: "device", boardId: "esp8266-esp12e" })).toBe("esp8266-esp12e");

    applyHardwareRunTarget({ target: "host" });
    expect(getActiveHardwareBoard()).toBeUndefined();
    expect(hardwareBoardId({ target: "host" })).toBeUndefined();
  });

  it("lists every supported board with its display name", () => {
    expect(hardwareBoardOptions()).toEqual([
      { id: "esp32-wroom", label: "ESP32 WROOM" },
      { id: "esp8266-esp12e", label: "ESP8266 ESP-12E（NodeMCU）" },
    ]);
    expect(hardwareBoardLabel({ target: "device", boardId: "esp8266-esp12e" })).toBe("ESP8266 ESP-12E（NodeMCU）");
    expect(hardwareBoardLabel({ target: "host" })).toBeUndefined();
  });
});

describe("target toolbox", () => {
  it("keeps the host toolbox untouched", () => {
    const host: HardwareRunTarget = { target: "host" };
    expect(buildTargetToolbox(fakeToolbox, host)).toBe(fakeToolbox);
    expect(categoryNames(buildTargetToolbox(fakeToolbox, host))).toEqual(["输入输出", "循环", "Manim 动画"]);
  });

  it("puts the hardware category first and hides plugin categories on device", () => {
    const device: HardwareRunTarget = { target: "device", boardId: "esp8266-esp12e" };
    const toolbox = buildTargetToolbox(fakeToolbox, device);
    expect(categoryNames(toolbox)).toEqual(["硬件", "输入输出", "循环"]);
    const contents = (toolbox as unknown as { contents: Array<{ kind?: string; flat?: string; text?: string }> }).contents;
    expect(contents.some((item) => item.kind === "sep")).toBe(true);
    const hardware = contents[0] as { contents: Array<{ kind?: string; text?: string; fields?: Record<string, string> }> };
    expect(hardware.contents[0].text).toContain("NodeMCU");
    expect(hardware.contents.find((item) => item.fields && "PIN" in item.fields && item.text === undefined)).toBeTruthy();
  });

  it("replaces a previously injected hardware category instead of duplicating it", () => {
    const device: HardwareRunTarget = { target: "device", boardId: "esp32-wroom" };
    const once = buildTargetToolbox(fakeToolbox, device);
    const twice = buildTargetToolbox(once, device);
    expect(categoryNames(twice)).toEqual(["硬件", "输入输出", "循环"]);
  });
});
