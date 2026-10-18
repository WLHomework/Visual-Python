import { describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import "blockly/blocks";
import { pythonGenerator } from "blockly/python";
import {
  collectHardwareBlockIssues,
  countIncompatiblePins,
  hardwareToolboxCategory,
  hardwareToolboxContents,
  refreshHardwareBlocks,
  registerHardwareBlocks,
  setActiveHardwareBoard,
} from "./hardwareBlocks";
import type { HardwareBoardId } from "./firmwareCatalog";

registerHardwareBlocks();

const number = (value: number) => ({ shadow: { type: "math_number", fields: { NUM: value } } });

const chain = (...blocks: Array<Record<string, unknown>>): Record<string, unknown> => {
  for (let index = 0; index < blocks.length - 1; index += 1) blocks[index].next = { block: blocks[index + 1] };
  return blocks[0];
};

const loadWorkspace = (blocks: unknown[], boardId?: HardwareBoardId): Blockly.Workspace => {
  setActiveHardwareBoard(boardId);
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks } }, workspace);
  return workspace;
};

const generate = (blocks: unknown[], boardId?: HardwareBoardId): string => {
  const workspace = loadWorkspace(blocks, boardId);
  const code = pythonGenerator.workspaceToCode(workspace);
  workspace.dispose();
  return code;
};

describe("hardware code generation", () => {
  it("generates ESP32 LED, pin write, forever loop and delay code", () => {
    const code = generate([chain(
      { type: "hardware_builtin_led", fields: { STATE: "on" } },
      { type: "hardware_pin_write", fields: { PIN: "2", LEVEL: "1" } },
      {
        type: "hardware_forever",
        inputs: {
          BODY: {
            block: chain(
              { type: "hardware_sleep_ms", inputs: { MS: number(500) } },
              { type: "hardware_pin_write", fields: { PIN: "2", LEVEL: "0" } },
            ),
          },
        },
      },
    )], "esp32-wroom");

    expect(code).toBe([
      "import machine",
      "import time",
      "",
      "",
      "machine.Pin(2, machine.Pin.OUT).value(1)",
      "machine.Pin(2, machine.Pin.OUT).value(1)",
      "while True:",
      "  time.sleep_ms(500)",
      "  machine.Pin(2, machine.Pin.OUT).value(0)",
      "",
    ].join("\n"));
    expect(code).toContain("import time");
  });

  it("uses the dedicated ADC channel and active-low LED on ESP8266", () => {
    const code = generate([chain(
      { type: "hardware_builtin_led", fields: { STATE: "on" } },
      {
        type: "hardware_pwm_write",
        fields: { PIN: "14" },
        inputs: { FREQ: number(1000), DUTY: { block: { type: "hardware_analog_read", fields: { PIN: "A0" } } } },
      },
    )], "esp8266-esp12e");

    expect(code).toContain("machine.Pin(2, machine.Pin.OUT).value(0)");
    expect(code).toContain("hardware_set_pwm(14, 1000, machine.ADC(0).read())");

    const esp32Analog = generate([{ type: "hardware_analog_read", fields: { PIN: "34" } }], "esp32-wroom");
    expect(esp32Analog).toContain("machine.ADC(machine.Pin(34)).read()");
  });

  it("explains hardware blocks that cannot generate code", () => {
    const noBoard = generate([{ type: "hardware_pin_write", fields: { PIN: "2", LEVEL: "1" } }]);
    expect(noBoard).toContain("请先选择硬件板卡");

    const valueWithoutBoard = generate([{ type: "hardware_analog_read" }]);
    expect(valueWithoutBoard).toContain("None");
    expect(valueWithoutBoard).not.toContain("# 硬件积木未生成代码");
  });

  it("keeps a single PWM helper and channel store for repeated blocks", () => {
    const code = generate([chain(
      { type: "hardware_pwm_write", fields: { PIN: "2" }, inputs: { FREQ: number(1000), DUTY: number(100) } },
      { type: "hardware_pwm_write", fields: { PIN: "2" }, inputs: { DUTY: number(600) } },
    )], "esp32-wroom");

    expect(code.match(/def hardware_set_pwm\(/g)?.length).toBe(1);
    expect(code.match(/_pwm_channels = \{\}/g)?.length).toBe(1);
    expect(code.match(/hardware_set_pwm\(2, /g)?.length).toBe(2);
  });

  it("lights and clears the builtin LED for both polarities", () => {
    const on = generate([{ type: "hardware_builtin_led", fields: { STATE: "on" } }], "esp8266-esp12e");
    const off = generate([{ type: "hardware_builtin_led", fields: { STATE: "off" } }], "esp8266-esp12e");
    expect(on).toContain("machine.Pin(2, machine.Pin.OUT).value(0)");
    expect(off).toContain("machine.Pin(2, machine.Pin.OUT).value(1)");

    const esp32Off = generate([{ type: "hardware_builtin_led", fields: { STATE: "off" } }], "esp32-wroom");
    expect(esp32Off).toContain("machine.Pin(2, machine.Pin.OUT).value(0)");
  });
});

describe("hardware pin dropdowns", () => {
  it("offers board pins and repairs invalid selections after a board switch", () => {
    const workspace = loadWorkspace([{ type: "hardware_pin_write", fields: { PIN: "32", LEVEL: "1" } }], "esp32-wroom");
    const block = workspace.getBlocksByType("hardware_pin_write")[0];
    const field = block.getField("PIN") as Blockly.FieldDropdown;
    const esp32Options = field.getOptions(false).map((option) => option[1]);
    expect(esp32Options).toContain("32");
    expect(esp32Options).not.toContain("34");

    setActiveHardwareBoard("esp8266-esp12e");
    expect(refreshHardwareBlocks(workspace)).toBe(1);
    const esp8266Options = field.getOptions(false).map((option) => option[1]);
    expect(esp8266Options).not.toContain("32");
    expect(esp8266Options).toContain("14");
    expect(block.getFieldValue("PIN")).toBe("2");
    workspace.dispose();
  });
});

describe("hardware block validation", () => {
  it("flags missing boards and pins that the selected board does not have", () => {
    const withoutBoard = loadWorkspace([{ type: "hardware_pin_write", fields: { PIN: "2", LEVEL: "1" } }], undefined);
    expect(collectHardwareBlockIssues(withoutBoard, undefined).map((issue) => issue.message))
      .toEqual(["硬件积木需要先在工程中选择硬件板卡"]);
    expect(collectHardwareBlockIssues(withoutBoard, undefined)[0].blockId).toBe(withoutBoard.getBlocksByType("hardware_pin_write")[0].id);
    withoutBoard.dispose();

    const stale = loadWorkspace([{ type: "hardware_analog_read", fields: { PIN: "32" } }], "esp32-wroom");
    expect(collectHardwareBlockIssues(stale, "esp32-wroom")).toEqual([]);
    expect(collectHardwareBlockIssues(stale, "esp8266-esp12e").map((issue) => issue.message)).toEqual([
      "「读取模拟输入」积木：ESP8266 ESP-12E（NodeMCU） 上没有引脚 32",
    ]);
    stale.dispose();

    const valid = loadWorkspace([chain(
      { type: "hardware_pin_write", fields: { PIN: "2", LEVEL: "1" } },
      {
        type: "hardware_pwm_write",
        fields: { PIN: "25" },
        inputs: { FREQ: number(1000), DUTY: { block: { type: "hardware_analog_read", fields: { PIN: "34" } } } },
      },
      { type: "hardware_sleep_ms" },
      { type: "hardware_forever" },
    )], "esp32-wroom");
    expect(collectHardwareBlockIssues(valid, "esp32-wroom")).toEqual([]);
    valid.dispose();
  });
});

describe("hardware pin compatibility count", () => {
  it("counts only the hardware blocks whose pin the target board does not offer", () => {
    const workspace = loadWorkspace([chain(
      { type: "hardware_pin_write", fields: { PIN: "23", LEVEL: "1" } },
      { type: "hardware_pin_write", fields: { PIN: "2", LEVEL: "0" } },
      { type: "controls_if" },
    )], "esp32-wroom");

    expect(countIncompatiblePins(workspace, "esp8266-esp12e")).toBe(1);
    expect(countIncompatiblePins(workspace, "esp32-wroom")).toBe(0);
    workspace.dispose();
  });

  it("counts analog pins that only exist on the current board", () => {
    const analog = loadWorkspace([{ type: "hardware_analog_read", fields: { PIN: "34" } }], "esp32-wroom");
    expect(countIncompatiblePins(analog, "esp8266-esp12e")).toBe(1);
    expect(countIncompatiblePins(analog, "esp32-wroom")).toBe(0);
    analog.dispose();

    const adc0 = loadWorkspace([{ type: "hardware_analog_read", fields: { PIN: "A0" } }], "esp8266-esp12e");
    expect(countIncompatiblePins(adc0, "esp32-wroom")).toBe(1);
    adc0.dispose();
  });
});

describe("hardware toolbox category", () => {
  it("labels the flyout with the board and uses board pin defaults", () => {
    const esp32 = hardwareToolboxContents("esp32-wroom");
    const esp8266 = hardwareToolboxContents("esp8266-esp12e");
    const labels = (contents: unknown[]) => contents.filter((item) => (item as { kind?: string }).kind === "label" && typeof (item as { text?: string }).text === "string");
    const pinOf = (contents: unknown[], type: string) => contents.find((item) => (item as { type?: string }).type === type) as
      | { kind: "block"; fields?: Record<string, string> }
      | undefined;

    expect((labels(esp32)[0] as { text: string }).text).toContain("ESP32 WROOM");
    expect((labels(esp8266)[0] as { text: string }).text).toContain("NodeMCU");
    expect(pinOf(esp32, "hardware_pin_write")?.fields?.PIN).toBe("2");
    expect(pinOf(esp8266, "hardware_pin_write")?.fields?.PIN).toBe("2");
    expect(pinOf(esp8266, "hardware_analog_read")?.fields?.PIN).toBe("A0");
    expect(pinOf(esp32, "hardware_analog_read")?.fields?.PIN).toBe("32");

    const category = hardwareToolboxCategory("esp32-wroom") as { name: string; colour: string; contents: unknown[] };
    expect(category.name).toBe("硬件");
    expect(category.contents.length).toBeGreaterThan(5);
  });

  it("shows a hint instead of pin values without a board", () => {
    const contents = hardwareToolboxContents();
    const cpu = contents.find((item) => (item as { kind?: string }).kind === "label") as { text: string };
    const write = contents.find((item) => (item as { type?: string }).type === "hardware_pin_write") as { fields?: Record<string, string> };
    expect(cpu.text).toContain("请先在工程中选择硬件板卡");
    expect(write.fields?.PIN).toBe("");
  });
});
