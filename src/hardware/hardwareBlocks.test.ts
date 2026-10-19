import { describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import "blockly/blocks";
import { pythonGenerator } from "blockly/python";
import { createBlockSearchIndex, searchBlockIndex } from "../blockSearch";
import { buildBlockOutline, filterBlockOutline } from "../blockOutline";
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

  it("generates board-specific pull modes for digital reads", () => {
    const esp32None = generate([{ type: "hardware_pin_read", fields: { PIN: "2", PULL: "none" } }], "esp32-wroom");
    const esp32Up = generate([{ type: "hardware_pin_read", fields: { PIN: "2", PULL: "up" } }], "esp32-wroom");
    const esp32Down = generate([{ type: "hardware_pin_read", fields: { PIN: "2", PULL: "down" } }], "esp32-wroom");
    const esp8266Up = generate([{ type: "hardware_pin_read", fields: { PIN: "14", PULL: "up" } }], "esp8266-esp12e");

    expect(esp32None).toContain("machine.Pin(2, machine.Pin.IN).value()");
    expect(esp32Up).toContain("machine.Pin(2, machine.Pin.IN, machine.Pin.PULL_UP).value()");
    expect(esp32Down).toContain("machine.Pin(2, machine.Pin.IN, machine.Pin.PULL_DOWN).value()");
    expect(esp8266Up).toContain("machine.Pin(14, machine.Pin.IN, machine.Pin.PULL_UP).value()");
  });

  it("does not generate unsupported ESP8266 pull combinations", () => {
    const workspace = loadWorkspace([{ type: "hardware_pin_read", fields: { PIN: "16", PULL: "up" } }], "esp8266-esp12e");
    expect(collectHardwareBlockIssues(workspace, "esp8266-esp12e").map((issue) => issue.message)).toEqual([
      "「读取数字引脚」积木：引脚 GPIO16（D0，不支持 PWM） 不支持内部上拉",
    ]);
    workspace.dispose();

    const code = generate([{ type: "hardware_pin_read", fields: { PIN: "14", PULL: "down" } }], "esp8266-esp12e");
    expect(code).toContain("None");
    expect(code).not.toContain("machine.Pin.PULL_DOWN");
  });

  it("generates a 50 Hz servo signal with a clamped 0.5-2.5 ms pulse", () => {
    const esp32 = generate([{ type: "hardware_servo_write", fields: { PIN: "2" }, inputs: { ANGLE: number(90) } }], "esp32-wroom");
    const esp8266 = generate([{ type: "hardware_servo_write", fields: { PIN: "14" }, inputs: { ANGLE: number(180) } }], "esp8266-esp12e");

    expect(esp32).toContain("hardware_set_pwm(2, 50, int((0.5 + (max(0, min(180, 90)) / 180) * 2.0) * 1023 / 20.0))");
    expect(esp8266).toContain("hardware_set_pwm(14, 50, int((0.5 + (max(0, min(180, 180)) / 180) * 2.0) * 1023 / 20.0))");
    expect(esp32).toContain("def hardware_set_pwm(");
  });

  it("generates a tone and stops it after the requested duration", () => {
    const code = generate([{
      type: "hardware_tone",
      fields: { PIN: "2" },
      inputs: { FREQ: number(440), DURATION: number(250) },
    }], "esp32-wroom");

    expect(code).toContain("hardware_set_pwm(2, int(max(1, 440)), 512)");
    expect(code).toContain("time.sleep_ms(int(max(0, 250)))");
    expect(code.match(/hardware_set_pwm\(2, int\(max\(1, 440\)\), /g)?.length).toBe(2);
  });

  it("reports and does not generate an ESP8266 tone above 1000 Hz", () => {
    const workspace = loadWorkspace([{
      type: "hardware_tone",
      fields: { PIN: "14" },
      inputs: { FREQ: number(1200), DURATION: number(100) },
    }], "esp8266-esp12e");
    expect(collectHardwareBlockIssues(workspace, "esp8266-esp12e").map((issue) => issue.message)).toEqual([
      "「音调」积木：ESP8266 ESP-12E（NodeMCU） 音调频率不能超过 1000 Hz",
    ]);
    workspace.dispose();

    const code = generate([{
      type: "hardware_tone",
      fields: { PIN: "14" },
      inputs: { FREQ: number(1200), DURATION: number(100) },
    }], "esp8266-esp12e");
    expect(code).toContain("硬件积木未生成代码");
    expect(code).not.toContain("hardware_set_pwm");
  });

  it("generates NeoPixel initialization, color updates, clear, and refresh", () => {
    const code = generate([chain(
      { type: "hardware_neopixel_init", fields: { PIN: "4" }, inputs: { COUNT: number(8) } },
      {
        type: "hardware_neopixel_set_pixel",
        inputs: { INDEX: number(2), R: number(255), G: number(32), B: number(0) },
      },
      { type: "hardware_neopixel_clear" },
      { type: "hardware_neopixel_write" },
    )], "esp32-wroom");

    expect(code).toContain("import machine");
    expect(code).toContain("import neopixel");
    expect(code).toContain("_neopixel = neopixel.NeoPixel(machine.Pin(4), int(max(1, 8)))");
    expect(code).toContain("_neopixel[int(2)] = (int(max(0, min(255, 255))), int(max(0, min(255, 32))), int(max(0, min(255, 0))))");
    expect(code).toContain("_neopixel.fill((0, 0, 0))");
    expect(code).toContain("_neopixel.write()");

    const esp8266 = generate([{ type: "hardware_neopixel_init", fields: { PIN: "4" }, inputs: { COUNT: number(4) } }], "esp8266-esp12e");
    expect(esp8266).toContain("neopixel.NeoPixel(machine.Pin(4), int(max(1, 4)))");
  });

  it("generates one DHT helper for temperature and humidity with explicit number outputs", () => {
    const temperature = generate([{ type: "hardware_dht_temperature", fields: { PIN: "4", SENSOR: "DHT11" } }], "esp32-wroom");
    const humidity = generate([{ type: "hardware_dht_humidity", fields: { PIN: "5", SENSOR: "DHT22" } }], "esp32-wroom");
    const both = generate([
      { type: "hardware_dht_temperature", fields: { PIN: "4", SENSOR: "DHT11" } },
      { type: "hardware_dht_humidity", fields: { PIN: "5", SENSOR: "DHT22" } },
    ], "esp32-wroom");

    expect(temperature).toContain("import dht");
    expect(temperature).toContain("def hardware_dht_read(");
    expect(temperature).toContain("sensor.measure()");
    expect(temperature).toContain("except OSError:");
    expect(temperature).toContain("hardware_dht_read(4, dht.DHT11)[0]");
    expect(humidity).toContain("hardware_dht_read(5, dht.DHT22)[1]");
    expect(temperature.match(/def hardware_dht_read\(/g)?.length).toBe(1);
    expect(humidity.match(/def hardware_dht_read\(/g)?.length).toBe(1);
    expect(both.match(/def hardware_dht_read\(/g)?.length).toBe(1);

    const esp8266 = generate([{ type: "hardware_dht_temperature", fields: { PIN: "4", SENSOR: "DHT22" } }], "esp8266-esp12e");
    expect(esp8266).toContain("hardware_dht_read(4, dht.DHT22)[0]");
  });

  it("generates ultrasonic distance in centimeters and returns -1 on timeout", () => {
    const code = generate([{ type: "hardware_ultrasonic_distance", fields: { TRIGGER: "5", ECHO: "18" } }], "esp32-wroom");

    expect(code).toContain("machine.time_pulse_us(echo, 1, 30000)");
    expect(code).toContain("if duration < 0:");
    expect(code).toContain("return -1");
    expect(code).toContain("return duration / 58.0");
    expect(code).toContain("hardware_ultrasonic_distance(5, 18)");

    const esp8266 = generate([{ type: "hardware_ultrasonic_distance", fields: { TRIGGER: "4", ECHO: "5" } }], "esp8266-esp12e");
    expect(esp8266).toContain("hardware_ultrasonic_distance(4, 5)");
  });

  it("generates OLED initialization and framebuffer operations for both boards", () => {
    const code = generate([chain(
      { type: "hardware_oled_init", fields: { ADDRESS: "0x3C" }, inputs: { WIDTH: number(128), HEIGHT: number(64) } },
      { type: "hardware_oled_clear" },
      { type: "hardware_oled_text", inputs: { TEXT: { block: { type: "text", fields: { TEXT: "Hello" } } }, X: number(0), Y: number(8) } },
      { type: "hardware_oled_pixel", fields: { STATE: "on" }, inputs: { X: number(10), Y: number(12) } },
      { type: "hardware_oled_write" },
    )], "esp32-wroom");

    expect(code).toContain("import machine");
    expect(code).toContain("import ssd1306");
    expect(code).toContain("machine.I2C(0, scl=machine.Pin(22), sda=machine.Pin(21), freq=400000)");
    expect(code).toContain("ssd1306.SSD1306_I2C(int(128), int(64), _oled_i2c, addr=0x3C)");
    expect(code).toContain("_oled.fill(0)");
    expect(code).toContain("_oled.text(str('Hello'), int(0), int(8), 1)");
    expect(code).toContain("_oled.pixel(int(10), int(12), 1)");
    expect(code).toContain("_oled.show()");

    const esp8266 = generate([{ type: "hardware_oled_init", fields: { ADDRESS: "0x3D" }, inputs: { WIDTH: number(128), HEIGHT: number(32) } }], "esp8266-esp12e");
    expect(esp8266).toContain("machine.I2C(scl=machine.Pin(5), sda=machine.Pin(4), freq=100000)");
    expect(esp8266).toContain("ssd1306.SSD1306_I2C(int(128), int(32), _oled_i2c, addr=0x3D)");
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

describe("hardware block discovery", () => {
  it("exposes the current hardware toolbox to search and the block outline", () => {
    const index = createBlockSearchIndex(hardwareToolboxCategory("esp32-wroom") as unknown as Blockly.utils.toolbox.ToolboxDefinition, (type) => type);
    expect(searchBlockIndex(index, "neopixel").map((entry) => entry.type)).toEqual(expect.arrayContaining([
      "hardware_neopixel_init",
      "hardware_neopixel_set_pixel",
      "hardware_neopixel_clear",
      "hardware_neopixel_write",
    ]));
    expect(searchBlockIndex(index, "oled").map((entry) => entry.type)).toEqual(expect.arrayContaining(["hardware_oled_init", "hardware_oled_write"]));

    const workspace = new Blockly.Workspace();
    const init = workspace.newBlock("hardware_oled_init");
    const write = workspace.newBlock("hardware_oled_write");
    init.nextConnection?.connect(write.previousConnection!);
    const outline = buildBlockOutline(workspace);
    expect(filterBlockOutline(outline, "oled write")[0]?.type).toBe("hardware_oled_write");
    workspace.dispose();
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
    expect(pinOf(esp32, "hardware_servo_write")?.fields?.PIN).toBe("2");
    expect(pinOf(esp32, "hardware_tone")?.fields?.PIN).toBe("2");

    const category = hardwareToolboxCategory("esp32-wroom") as { name: string; colour: string; contents: unknown[] };
    expect(category.name).toBe("ESP32 硬件");
    expect(category.contents.length).toBeGreaterThan(5);
  });

  it("builds a named toolbox for each board and omits unsupported S3 blocks", () => {
    const esp8266 = hardwareToolboxCategory("esp8266-esp12e") as { name: string; contents: unknown[] };
    const esp32s3 = hardwareToolboxCategory("esp32-s3") as { name: string; contents: unknown[] };
    const blockTypes = (contents: unknown[]) => contents
      .map((item) => (item as { type?: string }).type)
      .filter((type): type is string => type !== undefined);

    expect(esp8266.name).toBe("ESP8266 硬件");
    expect(esp32s3.name).toBe("ESP32-S3 硬件");
    expect(blockTypes(esp8266.contents)).toContain("hardware_builtin_led");
    expect(blockTypes(esp32s3.contents)).not.toContain("hardware_builtin_led");
  });

  it("shows a hint instead of pin values without a board", () => {
    const contents = hardwareToolboxContents();
    const cpu = contents.find((item) => (item as { kind?: string }).kind === "label") as { text: string };
    const write = contents.find((item) => (item as { type?: string }).type === "hardware_pin_write") as { fields?: Record<string, string> };
    expect(cpu.text).toContain("请先在工程中选择硬件板卡");
    expect(write.fields?.PIN).toBe("");
  });

  it("offers the servo block with a safe default angle", () => {
    const contents = hardwareToolboxContents("esp32-wroom");
    const servo = contents.find((item) => (item as { type?: string }).type === "hardware_servo_write") as {
      fields?: Record<string, string>;
      inputs?: Record<string, { shadow?: { fields?: Record<string, number> } }>;
    } | undefined;
    expect(servo?.fields?.PIN).toBe("2");
    expect(servo?.inputs?.ANGLE?.shadow?.fields?.NUM).toBe(90);
  });

  it("offers the tone block with safe defaults", () => {
    const contents = hardwareToolboxContents("esp32-wroom");
    const tone = contents.find((item) => (item as { type?: string }).type === "hardware_tone") as {
      fields?: Record<string, string>;
      inputs?: Record<string, { shadow?: { fields?: Record<string, number> } }>;
    } | undefined;
    expect(tone?.fields?.PIN).toBe("2");
    expect(tone?.inputs?.FREQ?.shadow?.fields?.NUM).toBe(440);
    expect(tone?.inputs?.DURATION?.shadow?.fields?.NUM).toBe(500);
  });

  it("offers NeoPixel, DHT, and ultrasonic blocks with board pin defaults", () => {
    const contents = hardwareToolboxContents("esp32-wroom");
    const block = (type: string) => contents.find((item) => (item as { type?: string }).type === type) as {
      fields?: Record<string, string>;
      inputs?: Record<string, { shadow?: { fields?: Record<string, number> } }>;
    } | undefined;

    expect(block("hardware_neopixel_init")?.fields?.PIN).toBe("2");
    expect(block("hardware_neopixel_init")?.inputs?.COUNT?.shadow?.fields?.NUM).toBe(8);
    expect(block("hardware_dht_temperature")?.fields?.PIN).toBe("2");
    expect(block("hardware_dht_temperature")?.fields?.SENSOR).toBe("DHT11");
    expect(block("hardware_dht_humidity")?.fields?.PIN).toBe("2");
    expect(block("hardware_ultrasonic_distance")?.fields?.TRIGGER).toBe("2");
    expect(block("hardware_ultrasonic_distance")?.fields?.ECHO).toBe("4");
    expect(block("hardware_oled_init")?.fields?.ADDRESS).toBe("0x3C");
    expect(block("hardware_oled_init")?.inputs?.WIDTH?.shadow?.fields?.NUM).toBe(128);
    expect(block("hardware_oled_init")?.inputs?.HEIGHT?.shadow?.fields?.NUM).toBe(64);
  });

  it("validates both ultrasonic pins against their board-specific uses", () => {
    const workspace = loadWorkspace([{ type: "hardware_ultrasonic_distance", fields: { TRIGGER: "2", ECHO: "18" } }], "esp32-wroom");
    const ultrasonic = workspace.getBlocksByType("hardware_ultrasonic_distance")[0];
    (ultrasonic.getField("TRIGGER") as unknown as { value_: string }).value_ = "34";
    expect(collectHardwareBlockIssues(workspace, "esp32-wroom").map((issue) => issue.message)).toEqual([
      "「超声波测距」积木：TRIGGER 引脚 GPIO34（仅输入/模拟） 只能作为输入使用",
    ]);
    workspace.dispose();

    const stale = loadWorkspace([{ type: "hardware_ultrasonic_distance", fields: { TRIGGER: "14", ECHO: "16" } }], "esp8266-esp12e");
    expect(collectHardwareBlockIssues(stale, "esp8266-esp12e")).toEqual([]);
    stale.dispose();
  });
});
