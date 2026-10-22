import { describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import "blockly/blocks";
import * as ZhHans from "blockly/msg/zh-hans";
import { pythonGenerator } from "blockly/python";
import { createBlockSearchIndex, searchBlockIndex } from "../blockSearch";
import { buildBlockOutline, filterBlockOutline } from "../blockOutline";
import {
  collectHardwareBlockIssues,
  countIncompatiblePins,
  hardwareToolboxContents,
  refreshHardwareBlocks,
  registerHardwareBlocks,
  setActiveHardwareBoard,
} from "./hardwareBlocks";
import type { HardwareBoardId } from "./firmwareCatalog";

const locale = Object.fromEntries(
  Object.entries(ZhHans).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
);
Blockly.setLocale(locale);

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

  it("maps a value between ranges on every board", () => {
    const blocks = [{
      type: "hardware_map_range",
      inputs: {
        VALUE: number(512),
        FROM_LOW: number(0),
        FROM_HIGH: number(1023),
        TO_LOW: number(0),
        TO_HIGH: number(100),
      },
    }];

    for (const boardId of ["esp32-wroom", "esp8266-esp12e", "esp32-s3"] as const) {
      expect(generate(blocks, boardId)).toBe("(512 - 0) * (100 - 0) / (1023 - 0) + 0\n");
    }
  });

  it("measures elapsed time with the wrap-safe ticks helpers on every board", () => {
    for (const boardId of ["esp32-wroom", "esp8266-esp12e", "esp32-s3"] as const) {
      const code = generate([
        { type: "hardware_ticks_ms" },
        { type: "hardware_ticks_diff", inputs: { START: number(1000), END: number(1500) } },
      ], boardId);

      expect(code).toContain("time.ticks_ms()");
      expect(code).toContain("time.ticks_diff(1500, 1000)");
      expect(code.match(/import time/g)).toHaveLength(1);
    }
  });

  it("reads capacitive touch pads only on boards that have them", () => {
    for (const boardId of ["esp32-wroom", "esp32-s3"] as const) {
      const code = generate([{ type: "hardware_touch_read", fields: { PIN: "4" } }], boardId);

      expect(code).toContain("import machine");
      expect(code).toContain("machine.TouchPad(machine.Pin(4)).read()");
    }

    const esp8266 = generate([{ type: "hardware_touch_read", fields: { PIN: "4" } }], "esp8266-esp12e");
    expect(esp8266.trim()).toBe("None");
    expect(esp8266).not.toContain("TouchPad");
  });

  it("resets and deep-sleeps on every board", () => {
    for (const boardId of ["esp32-wroom", "esp8266-esp12e", "esp32-s3"] as const) {
      const code = generate([chain(
        { type: "hardware_reset" },
        { type: "hardware_deepsleep", inputs: { MS: number(10000) } },
      )], boardId);

      expect(code).toContain("machine.reset()");
      expect(code).toContain("machine.deepsleep(int(max(0, 10000)))");
      expect(code.match(/import machine/g)).toHaveLength(1);
    }
  });

  it("never passes a negative deep-sleep duration", () => {
    const code = generate([{ type: "hardware_deepsleep", inputs: { MS: number(-5) } }], "esp32-s3");

    expect(code).toContain("machine.deepsleep(int(max(0, -5)))");
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

  it("does not generate random extras on ESP8266", () => {
    const esp8266Int = generate([{ type: "math_random_int", inputs: { FROM: number(1), TO: number(6) } }], "esp8266-esp12e");
    const esp8266Float = generate([{ type: "math_random_float" }], "esp8266-esp12e");
    expect(esp8266Int.trim()).toBe("None");
    expect(esp8266Float.trim()).toBe("None");
    expect(esp8266Int).not.toContain("random");
    expect(esp8266Float).not.toContain("random");

    const esp32Int = generate([{ type: "math_random_int", inputs: { FROM: number(1), TO: number(6) } }], "esp32-wroom");
    const s3Float = generate([{ type: "math_random_float" }], "esp32-s3");
    expect(esp32Int).toContain("import random");
    expect(esp32Int).toContain("random.randint(1, 6)");
    expect(s3Float).toContain("random.random()");
  });

  it("reports random blocks that ESP8266 cannot run", () => {
    const intWorkspace = loadWorkspace([
      { type: "math_random_int", inputs: { FROM: number(1), TO: number(6) } },
    ], "esp8266-esp12e");
    expect(collectHardwareBlockIssues(intWorkspace, "esp8266-esp12e").map((issue) => issue.message)).toEqual([
      "「随机整数」积木：ESP8266 固件没有 random.randint，请改用 ESP32 / ESP32-S3，或删除该积木",
    ]);
    intWorkspace.dispose();

    const floatWorkspace = loadWorkspace([{ type: "math_random_float" }], "esp8266-esp12e");
    expect(collectHardwareBlockIssues(floatWorkspace, "esp8266-esp12e").map((issue) => issue.message)).toEqual([
      "「随机小数」积木：ESP8266 固件没有 random.random，请改用 ESP32 / ESP32-S3，或删除该积木",
    ]);
    floatWorkspace.dispose();

    const s3Workspace = loadWorkspace([{ type: "math_random_float" }], "esp32-s3");
    expect(collectHardwareBlockIssues(s3Workspace, "esp32-s3")).toEqual([]);
    s3Workspace.dispose();
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

  it("lights the onboard RGB LED only on boards that have one", () => {
    const red = generate([{ type: "hardware_onboard_rgb", fields: { COLOR: "red" } }], "esp32-s3");
    const off = generate([{ type: "hardware_onboard_rgb", fields: { COLOR: "off" } }], "esp32-s3");

    expect(red).toContain("import machine");
    expect(red).toContain("import neopixel");
    expect(red).toContain("_onboard_rgb = neopixel.NeoPixel(machine.Pin(48, machine.Pin.OUT), 1)");
    expect(red).toContain("_onboard_rgb[0] = (255, 0, 0)");
    expect(red).toContain("_onboard_rgb.write()");
    expect(red.match(/import neopixel/g)).toHaveLength(1);
    expect(off).toContain("_onboard_rgb[0] = (0, 0, 0)");

    for (const boardId of ["esp32-wroom", "esp8266-esp12e"] as const) {
      const code = generate([{ type: "hardware_onboard_rgb", fields: { COLOR: "red" } }], boardId);
      expect(code).toContain("没有板载 RGB 灯");
      expect(code).not.toContain("neopixel.NeoPixel");
    }
  });

  it("generates UART setup, text writes, and reads as text", () => {
    const setup = generate([chain(
      { type: "hardware_uart_init", fields: { UART: "2", TX: "16", RX: "17" }, inputs: { BAUD: number(115200) } },
      { type: "hardware_uart_write", inputs: { TEXT: { block: { type: "text", fields: { TEXT: "Hello" } } } } },
    )], "esp32-wroom");

    expect(setup).toContain("import machine");
    expect(setup).toContain("_uart = machine.UART(2, baudrate=int(115200), tx=machine.Pin(16), rx=machine.Pin(17))");
    expect(setup).toContain("def hardware_uart_write_text(text):");
    expect(setup).toContain("hardware_uart_write_text('Hello')");
    expect(setup.match(/import machine/g)).toHaveLength(1);

    const line = generate([{ type: "hardware_uart_read", fields: { MODE: "line" } }], "esp32-s3");
    expect(line).toContain("def hardware_uart_readline():");
    expect(line).toContain("data = uart.readline()");
    expect(line).toContain("hardware_uart_readline()");

    const all = generate([{ type: "hardware_uart_read", fields: { MODE: "all" } }], "esp32-s3");
    expect(all).toContain("def hardware_uart_readall():");
    expect(all).toContain("data = uart.read()");
    expect(all).toContain("hardware_uart_readall()");

    const available = generate([{ type: "hardware_uart_available" }], "esp32-s3");
    expect(available).toContain("def hardware_uart_available():");
    expect(available).toContain("return uart.any() if uart is not None else 0");
    expect(available).toContain("hardware_uart_available()");

    const close = generate([{ type: "hardware_uart_deinit" }], "esp32-s3");
    expect(close).toContain("def hardware_uart_deinit():");
    expect(close).toContain("uart.deinit()");
    expect(close).toContain('globals()["_uart"] = None');
    expect(close).toContain("hardware_uart_deinit()");
  });

  it("does not generate UART setup with the same send and receive pin", () => {
    const same = generate([{ type: "hardware_uart_init", fields: { UART: "1", TX: "4", RX: "4" }, inputs: { BAUD: number(9600) } }], "esp32-s3");

    expect(same).toContain("发送和接收引脚不能相同");
    expect(same).not.toContain("machine.UART");
  });

  it("explains UART and MCU temperature blocks on boards without the hardware", () => {
    const init = generate([{ type: "hardware_uart_init", fields: { UART: "1", TX: "4", RX: "5" }, inputs: { BAUD: number(9600) } }], "esp8266-esp12e");
    expect(init).toContain("没有可用的串口");
    expect(init).not.toContain("machine.UART");

    const write = generate([{ type: "hardware_uart_write", inputs: { TEXT: { block: { type: "text", fields: { TEXT: "Hi" } } } } }], "esp8266-esp12e");
    expect(write).toContain("没有可用的串口");
    expect(write).not.toContain("_uart.write");

    const read = generate([{ type: "hardware_uart_read", fields: { MODE: "line" } }], "esp8266-esp12e");
    expect(read.trim()).toBe("None");
    expect(read).not.toContain("hardware_uart_readline");

    const wroom = generate([{ type: "hardware_mcu_temperature" }], "esp32-wroom");
    expect(wroom.trim()).toBe("None");
    expect(wroom).not.toContain("mcu_temperature");

    const esp8266Temp = generate([{ type: "hardware_mcu_temperature" }], "esp8266-esp12e");
    expect(esp8266Temp.trim()).toBe("None");
    expect(esp8266Temp).not.toContain("esp32");

    const s3 = generate([{ type: "hardware_mcu_temperature" }], "esp32-s3");
    expect(s3).toContain("import esp32");
    expect(s3).toContain("esp32.mcu_temperature()");
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
    expect(code).toContain("def hardware_i2c_bus():");
    expect(code).toContain('bus = globals().get("_i2c")');
    expect(code).toContain("machine.I2C(0, scl=machine.Pin(22), sda=machine.Pin(21), freq=400000)");
    expect(code).toContain("_oled_i2c = hardware_i2c_bus()");
    expect(code).toContain("ssd1306.SSD1306_I2C(int(128), int(64), _oled_i2c, addr=0x3C)");
    expect(code).toContain("_oled.fill(0)");
    expect(code).toContain("_oled.text(str('Hello'), int(0), int(8), 1)");
    expect(code).toContain("_oled.pixel(int(10), int(12), 1)");
    expect(code).toContain("_oled.show()");

    const esp8266 = generate([{ type: "hardware_oled_init", fields: { ADDRESS: "0x3D" }, inputs: { WIDTH: number(128), HEIGHT: number(32) } }], "esp8266-esp12e");
    expect(esp8266).toContain("machine.I2C(scl=machine.Pin(5), sda=machine.Pin(4), freq=100000)");
    expect(esp8266).toContain("_oled_i2c = hardware_i2c_bus()");
    expect(esp8266).toContain("ssd1306.SSD1306_I2C(int(128), int(32), _oled_i2c, addr=0x3D)");
  });

  it("generates I2C init, scan, register write and read", () => {
    const wroom = generate([chain(
      { type: "hardware_i2c_init", fields: { SDA: "21", SCL: "22" } },
      { type: "hardware_i2c_write_register", inputs: { ADDRESS: number(0x3C), REGISTER: number(0x10), DATA: number(0xAB) } },
    )], "esp32-wroom");

    expect(wroom).toContain("import machine");
    expect(wroom).toContain("_i2c = machine.I2C(0, scl=machine.Pin(22), sda=machine.Pin(21), freq=400000)");
    expect(wroom).toContain("hardware_i2c_bus().writeto_mem(int(60), int(16), bytes([int(171) & 0xFF]))");

    const read = generate([{ type: "hardware_i2c_read_register", inputs: { ADDRESS: number(0x3C), REGISTER: number(0) } }], "esp32-s3");
    expect(read).toContain("hardware_i2c_bus().readfrom_mem(int(60), int(0), 1)[0]");

    const scan = generate([{ type: "hardware_i2c_scan" }], "esp32-s3");
    expect(scan).toContain("hardware_i2c_bus().scan()");
    expect(scan).toContain("machine.I2C(0, scl=machine.Pin(9), sda=machine.Pin(8), freq=400000)");

    const esp8266 = generate([{ type: "hardware_i2c_init", fields: { SDA: "4", SCL: "5" } }], "esp8266-esp12e");
    expect(esp8266).toContain("machine.I2C(scl=machine.Pin(5), sda=machine.Pin(4), freq=100000)");
  });

  it("shares one lazy I2C helper across OLED and register blocks", () => {
    const code = generate([
      { type: "hardware_oled_init", fields: { ADDRESS: "0x3C" }, inputs: { WIDTH: number(128), HEIGHT: number(64) } },
      { type: "hardware_i2c_scan" },
      { type: "hardware_i2c_read_register", inputs: { ADDRESS: number(0x3C), REGISTER: number(0) } },
    ], "esp32-s3");

    expect(code.match(/def hardware_i2c_bus\(\)/g)).toHaveLength(1);
    expect(code).toContain("_oled_i2c = hardware_i2c_bus()");
    expect(code).toContain("hardware_i2c_bus().scan()");
    expect(code).toContain("hardware_i2c_bus().readfrom_mem(int(60), int(0), 1)[0]");
  });

  it("does not generate I2C register calls for out-of-range literals", () => {
    const code = generate([{
      type: "hardware_i2c_write_register",
      inputs: { ADDRESS: number(0x80), REGISTER: number(0), DATA: number(1) },
    }], "esp32-s3");

    expect(code).toContain("I2C 地址必须在 0x08–0x77 之间");
    expect(code).not.toContain("writeto_mem");
  });

  it("generates Wi-Fi connect, disconnect, status and IP blocks", () => {
    const wroom = generate([chain(
      {
        type: "hardware_wifi_connect",
        inputs: {
          SSID: { block: { type: "text", fields: { TEXT: "TestNet" } } },
          PASSWORD: { block: { type: "text", fields: { TEXT: "secret123" } } },
        },
      },
      { type: "hardware_wifi_disconnect" },
    )], "esp32-wroom");

    expect(wroom).toContain("import network");
    expect(wroom).toContain("_wlan = network.WLAN(network.WLAN.IF_STA)");
    expect(wroom).toContain("_wlan.active(True)");
    expect(wroom).toContain("_wlan.connect(str('TestNet'), str('secret123'))");
    expect(wroom).toContain("if _wlan.isconnected():");
    expect(wroom).toContain("_wlan.disconnect()");
    expect(wroom).toContain("_wlan.active(False)");

    const connected = generate([{ type: "hardware_wifi_connected" }], "esp32-s3");
    expect(connected).toContain("_wlan.isconnected()");

    const ip = generate([{ type: "hardware_wifi_ip" }], "esp8266-esp12e");
    expect(ip).toContain("_wlan.ifconfig()[0]");

    const wait = generate([{ type: "hardware_wifi_wait", inputs: { SECONDS: number(10) } }], "esp32-s3");
    expect(wait).toContain("import time");
    expect(wait).toContain("def hardware_wifi_wait(timeout_ms):");
    expect(wait).toContain("time.ticks_ms()");
    expect(wait).toContain("time.ticks_diff");
    expect(wait).toContain("time.sleep_ms(100)");
    expect(wait).toContain("hardware_wifi_wait(int(10) * 1000)");
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

  it("reports touch blocks on pins without capacitive touch", () => {
    const s3 = loadWorkspace([{ type: "hardware_touch_read", fields: { PIN: "1" } }], "esp32-s3");
    const s3Block = s3.getBlocksByType("hardware_touch_read")[0];
    (s3Block.getField("PIN") as unknown as { value_: string }).value_ = "15";
    expect(collectHardwareBlockIssues(s3, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「触摸读数」积木：引脚 GPIO15 不支持电容触摸",
    ]);
    s3.dispose();

    const esp8266 = loadWorkspace([{ type: "hardware_touch_read", fields: { PIN: "" } }], "esp8266-esp12e");
    const esp8266Block = esp8266.getBlocksByType("hardware_touch_read")[0];
    (esp8266Block.getField("PIN") as unknown as { value_: string }).value_ = "4";
    expect(collectHardwareBlockIssues(esp8266, "esp8266-esp12e").map((issue) => issue.message)).toEqual([
      "「触摸读数」积木：引脚 GPIO4（D2） 不支持电容触摸",
    ]);
    esp8266.dispose();
  });

  it("reports the onboard RGB block on boards without one", () => {
    const wroom = loadWorkspace([{ type: "hardware_onboard_rgb", fields: { COLOR: "red" } }], "esp32-wroom");
    expect(collectHardwareBlockIssues(wroom, "esp32-wroom").map((issue) => issue.message)).toEqual([
      "「板载 RGB 灯」积木：ESP32 WROOM 没有板载 RGB 灯",
    ]);
    wroom.dispose();

    const s3 = loadWorkspace([{ type: "hardware_onboard_rgb", fields: { COLOR: "red" } }], "esp32-s3");
    expect(collectHardwareBlockIssues(s3, "esp32-s3")).toEqual([]);
    s3.dispose();
  });

  it("reports an empty source range because it would divide by zero", () => {
    const empty = loadWorkspace([{
      type: "hardware_map_range",
      inputs: { VALUE: number(5), FROM_LOW: number(3), FROM_HIGH: number(3), TO_LOW: number(0), TO_HIGH: number(10) },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(empty, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「数值映射」积木：原范围的上下限不能相等（会除以零）",
    ]);
    empty.dispose();

    const computed = loadWorkspace([{
      type: "hardware_map_range",
      inputs: {
        VALUE: number(5),
        FROM_LOW: { block: { type: "math_arithmetic", fields: { OP: "ADD" }, inputs: { A: number(1), B: number(2) } } },
        FROM_HIGH: { block: { type: "math_arithmetic", fields: { OP: "ADD" }, inputs: { A: number(1), B: number(2) } } },
        TO_LOW: number(0),
        TO_HIGH: number(10),
      },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(computed, "esp32-s3")).toEqual([]);
    computed.dispose();
  });

  it("reports UART and MCU temperature blocks that the selected board cannot run", () => {
    const esp8266 = loadWorkspace([chain(
      { type: "hardware_uart_init", fields: { UART: "1", TX: "4", RX: "5" }, inputs: { BAUD: number(9600) } },
      { type: "hardware_uart_write", inputs: { TEXT: { block: { type: "text", fields: { TEXT: "Hi" } } } } },
    )], "esp8266-esp12e");
    expect(collectHardwareBlockIssues(esp8266, "esp8266-esp12e").map((issue) => issue.message)).toEqual([
      "「初始化串口」积木：ESP8266 ESP-12E（NodeMCU） 没有可用的串口",
      "「串口发送」积木：ESP8266 ESP-12E（NodeMCU） 没有可用的串口",
    ]);
    esp8266.dispose();

    const samePin = loadWorkspace([{ type: "hardware_uart_init", fields: { UART: "1", TX: "4", RX: "4" }, inputs: { BAUD: number(9600) } }], "esp32-s3");
    expect(collectHardwareBlockIssues(samePin, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「初始化串口」积木：发送和接收不能使用同一个引脚",
    ]);
    samePin.dispose();

    const missingPin = loadWorkspace([{ type: "hardware_uart_init", fields: { UART: "1", TX: "4", RX: "5" }, inputs: { BAUD: number(9600) } }], "esp32-s3");
    const missingBlock = missingPin.getBlocksByType("hardware_uart_init")[0];
    (missingBlock.getField("TX") as unknown as { value_: string }).value_ = "";
    expect(collectHardwareBlockIssues(missingPin, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「初始化串口」积木：TX 请选择引脚",
    ]);
    missingPin.dispose();

    const reservedPin = loadWorkspace([{ type: "hardware_uart_init", fields: { UART: "1", TX: "4", RX: "5" }, inputs: { BAUD: number(9600) } }], "esp32-s3");
    const reservedBlock = reservedPin.getBlocksByType("hardware_uart_init")[0];
    (reservedBlock.getField("TX") as unknown as { value_: string }).value_ = "3";
    expect(collectHardwareBlockIssues(reservedPin, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「初始化串口」积木：TX 引脚 GPIO3（启动配置） 会影响设备启动，暂不支持使用",
    ]);
    reservedPin.dispose();

    const wroom = loadWorkspace([{ type: "hardware_mcu_temperature" }], "esp32-wroom");
    expect(collectHardwareBlockIssues(wroom, "esp32-wroom").map((issue) => issue.message)).toEqual([
      "「芯片温度」积木：ESP32 WROOM 不支持读取芯片温度",
    ]);
    wroom.dispose();

    const s3 = loadWorkspace([{ type: "hardware_mcu_temperature" }], "esp32-s3");
    expect(collectHardwareBlockIssues(s3, "esp32-s3")).toEqual([]);
    s3.dispose();
  });

  it("reports invalid I2C pins and literal ranges", () => {
    const samePin = loadWorkspace([{ type: "hardware_i2c_init", fields: { SDA: "4", SCL: "4" } }], "esp32-s3");
    expect(collectHardwareBlockIssues(samePin, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「初始化 I2C」积木：SDA 和 SCL 不能使用同一个引脚",
    ]);
    samePin.dispose();

    const badAddress = loadWorkspace([{ type: "hardware_i2c_read_register", inputs: { ADDRESS: number(0x80), REGISTER: number(0) } }], "esp32-s3");
    expect(collectHardwareBlockIssues(badAddress, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「I2C 读寄存器」积木：I2C 地址必须是 0x08–0x77 之间的整数",
    ]);
    badAddress.dispose();

    const badData = loadWorkspace([{ type: "hardware_i2c_write_register", inputs: { ADDRESS: number(0x3C), REGISTER: number(0), DATA: number(256) } }], "esp32-s3");
    expect(collectHardwareBlockIssues(badData, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「I2C 写寄存器」积木：写入数据必须是 0–255 之间的整数",
    ]);
    badData.dispose();

    const valid = loadWorkspace([{ type: "hardware_i2c_write_register", inputs: { ADDRESS: number(0x3C), REGISTER: number(0), DATA: number(255) } }], "esp32-s3");
    expect(collectHardwareBlockIssues(valid, "esp32-s3")).toEqual([]);
    valid.dispose();
  });

  it("reports an empty Wi-Fi name", () => {
    const empty = loadWorkspace([{
      type: "hardware_wifi_connect",
      inputs: {
        SSID: { block: { type: "text", fields: { TEXT: "  " } } },
        PASSWORD: { block: { type: "text", fields: { TEXT: "" } } },
      },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(empty, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「连接 Wi-Fi」积木：Wi-Fi 名称不能为空",
    ]);
    empty.dispose();

    const valid = loadWorkspace([{
      type: "hardware_wifi_connect",
      inputs: {
        SSID: { block: { type: "text", fields: { TEXT: "TestNet" } } },
        PASSWORD: { block: { type: "text", fields: { TEXT: "" } } },
      },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(valid, "esp32-s3")).toEqual([]);
    valid.dispose();

    const badWait = loadWorkspace([{ type: "hardware_wifi_wait", inputs: { SECONDS: number(0) } }], "esp32-s3");
    expect(collectHardwareBlockIssues(badWait, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「等待 Wi-Fi 连接」积木：等待时间必须是大于 0 的整数秒",
    ]);
    badWait.dispose();
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

  it("counts touch pins that the target board does not offer", () => {
    const s3 = loadWorkspace([{ type: "hardware_touch_read", fields: { PIN: "1" } }], "esp32-s3");
    expect(countIncompatiblePins(s3, "esp32-s3")).toBe(0);
    expect(countIncompatiblePins(s3, "esp8266-esp12e")).toBe(1);
    s3.dispose();
  });
});

describe("hardware block discovery", () => {
  it("exposes the current hardware toolbox to search and the block outline", () => {
    const definition = {
      kind: "flyoutToolbox",
      contents: hardwareToolboxContents("esp32-wroom"),
    } as unknown as Blockly.utils.toolbox.ToolboxDefinition;
    const index = createBlockSearchIndex(definition, (type) => type);
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

    expect(hardwareToolboxContents("esp32-wroom").length).toBeGreaterThan(5);
  });

  it("offers board-specific blocks only on boards that support them", () => {
    const types = (boardId: HardwareBoardId) => hardwareToolboxContents(boardId)
      .map((item) => (item as { type?: string }).type)
      .filter((type): type is string => type !== undefined);

    expect(types("esp8266-esp12e")).toContain("hardware_builtin_led");
    expect(types("esp32-s3")).not.toContain("hardware_builtin_led");
  });

  it("offers the range mapping block on every board", () => {
    for (const boardId of ["esp32-wroom", "esp8266-esp12e", "esp32-s3"] as const) {
      const entry = hardwareToolboxContents(boardId).find((item) => (item as { type?: string }).type === "hardware_map_range") as
        | { inputs?: Record<string, { shadow?: { fields?: Record<string, number> } }> }
        | undefined;
      expect(entry, `${boardId} 缺少数值映射积木`).toBeDefined();
      expect(entry?.inputs?.FROM_HIGH?.shadow?.fields?.NUM).toBe(1023);
      expect(entry?.inputs?.TO_HIGH?.shadow?.fields?.NUM).toBe(100);
    }
  });

  it("offers the wrap-safe timing blocks on every board", () => {
    for (const boardId of ["esp32-wroom", "esp8266-esp12e", "esp32-s3"] as const) {
      const types = hardwareToolboxContents(boardId).map((item) => (item as { type?: string }).type);

      expect(types).toEqual(expect.arrayContaining(["hardware_ticks_ms", "hardware_ticks_diff"]));
    }
  });

  it("offers capacitive touch only on boards with touch pins", () => {
    for (const boardId of ["esp32-wroom", "esp32-s3"] as const) {
      const entry = hardwareToolboxContents(boardId).find((item) => (item as { type?: string }).type === "hardware_touch_read") as
        | { fields?: Record<string, string> }
        | undefined;

      expect(entry?.fields?.PIN, `${boardId} 缺少触摸积木`).toBe(boardId === "esp32-s3" ? "1" : "2");
    }

    const esp8266Types = hardwareToolboxContents("esp8266-esp12e").map((item) => (item as { type?: string }).type);
    expect(esp8266Types).not.toContain("hardware_touch_read");
  });

  it("offers the onboard RGB block only on boards that have one", () => {
    const s3 = hardwareToolboxContents("esp32-s3").find((item) => (item as { type?: string }).type === "hardware_onboard_rgb") as
      | { fields?: Record<string, string> }
      | undefined;
    expect(s3?.fields?.COLOR).toBe("red");

    for (const boardId of ["esp32-wroom", "esp8266-esp12e"] as const) {
      const types = hardwareToolboxContents(boardId).map((item) => (item as { type?: string }).type);
      expect(types).not.toContain("hardware_onboard_rgb");
    }
  });

  it("offers reset and deep sleep on every board", () => {
    for (const boardId of ["esp32-wroom", "esp8266-esp12e", "esp32-s3"] as const) {
      const contents = hardwareToolboxContents(boardId);
      const types = contents.map((item) => (item as { type?: string }).type);
      const deepsleep = contents.find((item) => (item as { type?: string }).type === "hardware_deepsleep") as
        | { inputs?: Record<string, { shadow?: { fields?: Record<string, number> } }> }
        | undefined;

      expect(types).toEqual(expect.arrayContaining(["hardware_reset", "hardware_deepsleep"]));
      expect(deepsleep?.inputs?.MS?.shadow?.fields?.NUM).toBe(10000);
    }
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

  it("offers H1 module blocks with board-appropriate pin and calibration defaults", () => {
    const contents = hardwareToolboxContents("esp32-s3");
    const block = (type: string) => contents.find((item) => (item as { type?: string }).type === type) as {
      fields?: Record<string, string>;
      inputs?: Record<string, { shadow?: { fields?: Record<string, number> } }>;
    } | undefined;

    expect(block("hardware_button_read")?.fields).toMatchObject({ PIN: "1", ACTIVE: "low" });
    expect(block("hardware_button_read")?.inputs?.DEBOUNCE?.shadow?.fields?.NUM).toBe(30);
    expect(block("hardware_pir_motion")?.fields?.PIN).toBe("2");
    expect(block("hardware_pir_motion")?.inputs?.HOLD?.shadow?.fields?.NUM).toBe(2);
    expect(block("hardware_light_percent")?.fields?.PIN).toBe("1");
    expect(block("hardware_light_percent")?.inputs?.DARK?.shadow?.fields?.NUM).toBe(0);
    expect(block("hardware_light_percent")?.inputs?.BRIGHT?.shadow?.fields?.NUM).toBe(4095);
    expect(block("hardware_soil_percent")?.fields?.PIN).toBe("1");
    expect(block("hardware_soil_percent")?.inputs?.DRY?.shadow?.fields?.NUM).toBe(4095);
    expect(block("hardware_soil_percent")?.inputs?.WET?.shadow?.fields?.NUM).toBe(0);
    expect(block("hardware_relay_set")?.fields).toMatchObject({ PIN: "1", STATE: "off", ACTIVE: "low" });
    expect(block("hardware_dc_motor")?.fields).toMatchObject({ IN1: "2", IN2: "4", PWM: "1" });
    expect(block("hardware_dc_motor")?.inputs?.SPEED?.shadow?.fields?.NUM).toBe(50);
    expect(block("hardware_neopixel_fill")?.inputs?.R?.shadow?.fields?.NUM).toBe(255);
    expect(block("hardware_neopixel_fill")?.inputs?.G?.shadow?.fields?.NUM).toBe(255);
    expect(block("hardware_neopixel_fill")?.inputs?.B?.shadow?.fields?.NUM).toBe(255);

    for (const boardId of ["esp32-wroom", "esp8266-esp12e"] as const) {
      const types = hardwareToolboxContents(boardId).map((item) => (item as { type?: string }).type);
      for (const type of ["hardware_button_read", "hardware_pir_motion", "hardware_relay_set", "hardware_neopixel_fill"]) {
        expect(types, `${boardId} 缺少 ${type}`).toContain(type);
      }
    }

    const analogDefaults = (boardId: "esp32-wroom" | "esp8266-esp12e") => {
      const contents = hardwareToolboxContents(boardId);
      const light = contents.find((item) => (item as { type?: string }).type === "hardware_light_percent") as {
        inputs?: Record<string, { shadow?: { fields?: Record<string, number> } }>;
      } | undefined;
      return light?.inputs?.BRIGHT?.shadow?.fields?.NUM;
    };
    expect(analogDefaults("esp32-wroom")).toBe(4095);
    expect(analogDefaults("esp8266-esp12e")).toBe(1023);
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

  it("offers UART blocks only on boards with a free two-way serial port", () => {
    const contentsOf = (boardId: HardwareBoardId) => hardwareToolboxContents(boardId);
    const initOf = (contents: Blockly.utils.toolbox.FlyoutItemInfo[]) =>
      contents.find((item) => (item as { type?: string }).type === "hardware_uart_init") as
        | { fields?: Record<string, string>; inputs?: Record<string, { shadow?: { fields?: Record<string, number> } }> }
        | undefined;

    const s3Contents = contentsOf("esp32-s3");
    const s3 = initOf(s3Contents);
    expect(s3?.fields).toMatchObject({ UART: "1", TX: "1", RX: "2" });
    expect(s3?.inputs?.BAUD?.shadow?.fields?.NUM).toBe(9600);
    const s3Types = s3Contents.map((item) => (item as { type?: string }).type);
    expect(s3Types).toEqual(expect.arrayContaining(["hardware_uart_write", "hardware_uart_read"]));

    // WROOM 的默认收发引脚避开板载 LED（GPIO2）。
    const wroom = initOf(contentsOf("esp32-wroom"));
    expect(wroom?.fields).toMatchObject({ UART: "1", TX: "4", RX: "5" });

    const esp8266Types = contentsOf("esp8266-esp12e").map((item) => (item as { type?: string }).type);
    expect(esp8266Types).not.toContain("hardware_uart_init");
  });

  it("offers the MCU temperature block only on boards that support it", () => {
    const s3Types = hardwareToolboxContents("esp32-s3").map((item) => (item as { type?: string }).type);
    expect(s3Types).toContain("hardware_mcu_temperature");

    for (const boardId of ["esp32-wroom", "esp8266-esp12e"] as const) {
      const types = hardwareToolboxContents(boardId).map((item) => (item as { type?: string }).type);
      expect(types, `${boardId} 不应出现芯片温度积木`).not.toContain("hardware_mcu_temperature");
    }
  });
});

describe("ESP32-S3 advanced wireless and storage blocks", () => {
  const text = (value: string) => ({ block: { type: "text", fields: { TEXT: value } } });

  it("generates HTTP GET/POST, NTP sync, UTC time and local time", () => {
    const http = generate([{ type: "hardware_http_get", inputs: { URL: text("http://example.com") } }], "esp32-s3");
    const post = generate([{
      type: "hardware_http_post",
      inputs: { URL: text("http://example.com"), BODY: text("hello") },
    }], "esp32-s3");
    const ntp = generate([{ type: "hardware_ntp_sync" }], "esp32-s3");
    const now = generate([{ type: "hardware_ntp_now" }], "esp32-s3");
    const local = generate([{ type: "hardware_ntp_local", inputs: { OFFSET: number(8) } }], "esp32-s3");

    expect(http).toContain("import requests");
    expect(http).toContain("def hardware_http_get(url):");
    expect(http).toContain("response = requests.get(str(url), timeout=5)");
    expect(http).toContain("data = response.text");
    expect(http).toContain("response.close()");
    expect(http).toContain("except (OSError, ValueError, UnicodeError):");
    expect(http).toContain("hardware_http_get('http://example.com')");
    expect(post).toContain("def hardware_http_post(url, body):");
    expect(post).toContain("requests.post(str(url), data=str(body), timeout=5)");
    expect(post).toContain("hardware_http_post('http://example.com', 'hello')");
    expect(ntp).toContain("import ntptime");
    expect(ntp).toContain("def hardware_ntp_sync():");
    expect(ntp).toContain("ntptime.settime()");
    expect(ntp).toContain("except OSError:");
    expect(now).toContain("import time");
    expect(now).toContain('time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())');
    expect(local).toContain('time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(time.time() + int(float(8) * 3600)))');
  });

  it("generates Wi-Fi hotspot control, hotspot IP and RSSI", () => {
    const code = generate([chain(
      {
        type: "hardware_wifi_ap_start",
        inputs: { SSID: text("VisualPython"), PASSWORD: text("12345678"), CHANNEL: number(6) },
      },
      { type: "hardware_wifi_ap_stop" },
    )], "esp32-s3");

    expect(code).toContain("import network");
    expect(code).toContain("_ap = network.WLAN(network.WLAN.IF_AP)");
    expect(code).toContain("_ap.config(essid=str('VisualPython'), password=str('12345678'), authmode=network.WLAN.SEC_WPA_WPA2, channel=int(6))");
    expect(code).toContain("_ap.active(True)");
    expect(code).toContain("_ap.active(False)");

    const apIp = generate([{ type: "hardware_wifi_ap_ip" }], "esp32-s3");
    expect(apIp).toContain("_ap.ifconfig()[0]");

    const rssi = generate([{ type: "hardware_wifi_rssi" }], "esp32-s3");
    expect(rssi).toContain('_wlan.status("rssi") if _wlan.isconnected() else 0');
  });

  it("generates BLE advertising with a bounded name and a stop command", () => {
    const code = generate([chain(
      { type: "hardware_ble_start", inputs: { NAME: text("VisualPython") } },
      { type: "hardware_ble_stop" },
    )], "esp32-s3");

    expect(code).toContain("import bluetooth");
    expect(code).toContain("_ble = bluetooth.BLE()");
    expect(code).toContain("def hardware_ble_start(name):");
    expect(code).toContain("_ble.config(gap_name=text)");
    expect(code).toContain("_ble.gap_advertise(None)");
    expect(code).toContain("data = text.encode()");
    expect(code).toContain("while len(data) > 20:");
    expect(code).toContain("connectable=False");
    expect(code).toContain("hardware_ble_start('VisualPython')");
    expect(code).toContain("hardware_ble_stop()");
  });

  it("generates ESP-NOW setup, MAC conversion, sending and receiving", () => {
    const code = generate([chain(
      { type: "hardware_espnow_init" },
      { type: "hardware_espnow_send", inputs: { TEXT: text("Hi"), MAC: text("aa:bb:cc:dd:ee:ff") } },
    )], "esp32-s3");
    const receive = generate([{ type: "hardware_espnow_receive", inputs: { TIMEOUT: number(500) } }], "esp32-s3");

    expect(code).toContain("import network");
    expect(code).toContain("import espnow");
    expect(code).toContain("_wlan = network.WLAN(network.WLAN.IF_STA)");
    expect(code).toContain("_espnow = espnow.ESPNow()");
    expect(code).toContain("_wlan.active(True)");
    expect(code).toContain("_espnow.active(True)");
    expect(code).toContain("def hardware_espnow_mac_bytes(mac):");
    expect(code).toContain("result[index] = int(parts[index], 16)");
    expect(code).toContain("_espnow.add_peer(peer)");
    expect(code).toContain("_espnow.send(peer, str(text), False)");
    expect(code).toContain("hardware_espnow_send('aa:bb:cc:dd:ee:ff', 'Hi')");
    expect(receive).toContain("_espnow.recv(int(timeout_ms))");
    expect(receive).toContain("hardware_espnow_receive(int(500))");
    expect(receive).toContain("global _espnow_last_mac");
  });

  it("generates the MQTT connection, publish, subscribe, receive queue and disconnect", () => {
    const code = generate([chain(
      {
        type: "hardware_mqtt_connect",
        inputs: {
          SERVER: text("192.168.1.2"),
          PORT: number(1883),
          CLIENT_ID: text("vp-s3"),
          USER: text("user"),
          PASSWORD: text("secret"),
        },
      },
      { type: "hardware_mqtt_publish", inputs: { TOPIC: text("visual-python/test"), MESSAGE: text("hello") } },
      { type: "hardware_mqtt_subscribe", inputs: { TOPIC: text("visual-python/test") } },
      { type: "hardware_mqtt_disconnect" },
    )], "esp32-s3");

    expect(code).toContain("import umqtt.simple");
    expect(code).toContain("try:");
    expect(code).toContain("_mqtt = umqtt.simple.MQTTClient(str('vp-s3'), str('192.168.1.2'), port=int(1883), user=(str('user') or None), password=str('secret'))");
    expect(code).toContain("_mqtt.set_callback(_mqtt_on_message)");
    expect(code).toContain("_mqtt.connect()");
    expect(code).toContain("except (OSError, ValueError):");
    expect(code).toContain("def hardware_mqtt_publish(topic, message):");
    expect(code).toContain("_mqtt.publish(str(topic).encode(), str(message).encode())");
    expect(code).toContain("hardware_mqtt_publish('visual-python/test', 'hello')");
    expect(code).toContain("def hardware_mqtt_subscribe(topic):");
    expect(code).toContain("_mqtt.subscribe(str(topic).encode())");
    expect(code).toContain("hardware_mqtt_subscribe('visual-python/test')");
    expect(code).toContain("def hardware_mqtt_disconnect():");
    expect(code).toContain("_mqtt.disconnect()");
    expect(code).toContain("hardware_mqtt_disconnect()");
    expect(code).toContain("def _mqtt_on_message(topic, msg):");
    expect(code).toContain("_mqtt_messages.append((_mqtt_text(topic), _mqtt_text(msg)))");

    const wait = generate([{ type: "hardware_mqtt_wait", inputs: { TIMEOUT: number(200) } }], "esp32-s3");
    expect(wait).toContain("import time");
    expect(wait).toContain("_mqtt.check_msg()");
    expect(wait).toContain("except (OSError, AttributeError):");
    expect(wait).toContain("time.sleep_ms(20)");
    expect(wait).toContain("hardware_mqtt_wait(int(200))");
    expect(wait).toContain("_mqtt_messages.pop(0)");
    expect(wait).toContain("global _mqtt, _mqtt_last_topic");
    expect(wait).toContain("_mqtt_last_topic = item[0]");
    expect(wait).toContain("return item[1]");
  });

  it("generates text-file and NVS storage helpers", () => {
    const code = generate([chain(
      { type: "hardware_file_write", inputs: { PATH: text("/data.txt"), TEXT: text("hello") } },
      { type: "hardware_nvs_set", inputs: { KEY: text("counter"), VALUE: text("1") } },
    )], "esp32-s3");

    expect(code).toContain("import esp32");
    expect(code).toContain('with open(str(path), "w") as file:');
    expect(code).toContain("file.write(str(text))");
    expect(code).toContain("hardware_file_write('/data.txt', 'hello')");
    expect(code).toContain('_nvs = esp32.NVS("visual_python")');
    expect(code).toContain("_nvs.set_blob(str(key), str(value).encode())");
    expect(code).toContain("hardware_nvs_set('counter', '1')");
    expect(code).toContain("_nvs.commit()");

    const read = generate([{ type: "hardware_file_read", inputs: { PATH: text("/data.txt") } }], "esp32-s3");
    const nvsRead = generate([{ type: "hardware_nvs_get", inputs: { KEY: text("counter") } }], "esp32-s3");
    expect(read).toContain("def hardware_file_read(path):");
    expect(read).toContain("file.read()");
    expect(nvsRead).toContain("def hardware_nvs_get(key):");
    expect(nvsRead).toContain("length = _nvs.get_blob(str(key), data)");
    expect(nvsRead).toContain("hardware_nvs_get('counter')");
    expect(nvsRead).toContain("bytes(data[:length]).decode()");
  });

  it("does not generate ESP32-S3-only blocks on the other boards", () => {
    for (const boardId of ["esp32-wroom", "esp8266-esp12e"] as const) {
      const http = generate([{ type: "hardware_http_get", inputs: { URL: text("http://example.com") } }], boardId);
      expect(http).not.toContain("requests.get");
      expect(http).not.toContain("hardware_http_get");

      const ap = generate([{
        type: "hardware_wifi_ap_start",
        inputs: { SSID: text("VP"), PASSWORD: text("12345678"), CHANNEL: number(1) },
      }], boardId);
      expect(ap).toContain("仅 ESP32-S3");
      expect(ap).not.toContain("IF_AP");

      const ble = generate([{ type: "hardware_ble_start", inputs: { NAME: text("VP") } }], boardId);
      expect(ble).toContain("仅 ESP32-S3");

      const disconnect = generate([{ type: "hardware_mqtt_disconnect" }], boardId);
      expect(disconnect).toContain("仅 ESP32-S3");

      const file = generate([{ type: "hardware_file_write", inputs: { PATH: text("/data.txt"), TEXT: text("x") } }], boardId);
      expect(file).toContain("仅 ESP32-S3");
      expect(file).not.toContain("open(");
    }
  });

  it("reports S3-only blocks on the other boards in the problem panel", () => {
    const workspace = loadWorkspace([
      { type: "hardware_http_get", inputs: { URL: text("http://example.com") } },
      { type: "hardware_wifi_ap_start", inputs: { SSID: text("VP"), PASSWORD: text("12345678"), CHANNEL: number(1) } },
      { type: "hardware_wifi_rssi" },
      { type: "hardware_ble_start", inputs: { NAME: text("VP") } },
      { type: "hardware_mqtt_disconnect" },
      { type: "hardware_file_write", inputs: { PATH: text("/data.txt"), TEXT: text("x") } },
    ], "esp32-wroom");
    expect(collectHardwareBlockIssues(workspace, "esp32-wroom").map((issue) => issue.message)).toEqual([
      "「HTTP GET 请求」积木：ESP32 WROOM 不支持该联网/无线积木（仅 ESP32-S3）",
      "「开启 Wi-Fi 热点」积木：ESP32 WROOM 不支持该联网/无线积木（仅 ESP32-S3）",
      "「Wi-Fi 信号强度」积木：ESP32 WROOM 不支持该联网/无线积木（仅 ESP32-S3）",
      "「开启 BLE 广播」积木：ESP32 WROOM 不支持该联网/无线积木（仅 ESP32-S3）",
      "「断开 MQTT」积木：ESP32 WROOM 不支持该联网/无线积木（仅 ESP32-S3）",
      "「写入设备文件」积木：ESP32 WROOM 不支持设备存储积木（仅 ESP32-S3）",
    ]);
    workspace.dispose();
  });

  it("validates URLs, MACs, MQTT settings, file paths and NVS keys", () => {
    const http = loadWorkspace([{ type: "hardware_http_get", inputs: { URL: text("example.com") } }], "esp32-s3");
    expect(collectHardwareBlockIssues(http, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「HTTP GET 请求」积木：网址必须以 http:// 或 https:// 开头",
    ]);
    http.dispose();

    const post = loadWorkspace([{ type: "hardware_http_post", inputs: { URL: text("example.com"), BODY: text("x") } }], "esp32-s3");
    expect(collectHardwareBlockIssues(post, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「HTTP POST 请求」积木：网址必须以 http:// 或 https:// 开头",
    ]);
    post.dispose();

    const ap = loadWorkspace([{
      type: "hardware_wifi_ap_start",
      inputs: { SSID: text(""), PASSWORD: text("short"), CHANNEL: number(20) },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(ap, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「开启 Wi-Fi 热点」积木：热点名称不能为空",
      "「开启 Wi-Fi 热点」积木：热点密码必须是 8–63 个 ASCII 字符",
      "「开启 Wi-Fi 热点」积木：信道必须是 1–13 之间的整数",
    ]);
    ap.dispose();

    const ntpLocal = loadWorkspace([{ type: "hardware_ntp_local", inputs: { OFFSET: number(20) } }], "esp32-s3");
    expect(collectHardwareBlockIssues(ntpLocal, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「设备本地时间」积木：时区偏移必须在 -12 到 14 小时之间",
    ]);
    ntpLocal.dispose();

    const espnow = loadWorkspace([{ type: "hardware_espnow_send", inputs: { TEXT: text("Hi"), MAC: text("aa:bb:cc") } }], "esp32-s3");
    expect(collectHardwareBlockIssues(espnow, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「ESP-NOW 发送」积木：MAC 地址应写成 6 组十六进制，例如 aa:bb:cc:dd:ee:ff",
    ]);
    espnow.dispose();

    const mqtt = loadWorkspace([{
      type: "hardware_mqtt_connect",
      inputs: {
        SERVER: text(""),
        PORT: number(70000),
        CLIENT_ID: text(""),
        USER: text(""),
        PASSWORD: text(""),
      },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(mqtt, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「连接 MQTT」积木：服务器地址不能为空",
      "「连接 MQTT」积木：客户端 ID 不能为空",
      "「连接 MQTT」积木：端口必须是 1–65535 之间的整数",
    ]);
    mqtt.dispose();

    const file = loadWorkspace([{ type: "hardware_file_write", inputs: { PATH: text("/main.py"), TEXT: text("x") } }], "esp32-s3");
    expect(collectHardwareBlockIssues(file, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「写入设备文件」积木：不要写入 /main.py，它会覆盖正在运行的程序",
    ]);
    file.dispose();

    const nvs = loadWorkspace([{ type: "hardware_nvs_set", inputs: { KEY: text("key with spaces"), VALUE: text("x") } }], "esp32-s3");
    expect(collectHardwareBlockIssues(nvs, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「写入 NVS 键值」积木：NVS 键必须是 1–15 个 ASCII 字母、数字或下划线",
    ]);
    nvs.dispose();

    const nvsValue = loadWorkspace([{ type: "hardware_nvs_set", inputs: { KEY: text("key"), VALUE: text("中".repeat(342)) } }], "esp32-s3");
    expect(collectHardwareBlockIssues(nvsValue, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「写入 NVS 键值」积木：NVS 文本值不能超过约 1 KB",
    ]);
    nvsValue.dispose();
  });
});

describe("H1 P0 module blocks", () => {
  it("generates a debounced button read with board pull mode", () => {
    const low = generate([{
      type: "hardware_button_read",
      fields: { PIN: "1", ACTIVE: "low" },
      inputs: { DEBOUNCE: number(30) },
    }], "esp32-s3");
    expect(low).toContain("import machine");
    expect(low).toContain("import time");
    expect(low).toContain("def hardware_button_read(pin, debounce_ms, active_low):");
    expect(low).toContain("machine.Pin(pin, machine.Pin.IN, machine.Pin.PULL_UP if active_low else machine.Pin.PULL_DOWN)");
    expect(low).toContain("time.sleep_ms(int(debounce_ms))");
    expect(low).toContain("hardware_button_read(1, 30, True)");

    const high = generate([{
      type: "hardware_button_read",
      fields: { PIN: "2", ACTIVE: "high" },
      inputs: { DEBOUNCE: number(5) },
    }], "esp32-s3");
    expect(high).toContain("hardware_button_read(2, 5, False)");
  });

  it("holds PIR motion per pin after the sensor output goes low", () => {
    const code = generate([{
      type: "hardware_pir_motion",
      fields: { PIN: "2" },
      inputs: { HOLD: number(3) },
    }], "esp32-s3");

    expect(code).toContain("def hardware_pir_motion(pin, hold_ms):");
    expect(code).toContain('key = "_pir_last_" + str(pin)');
    expect(code).toContain("globals()[key] = now");
    expect(code).toContain("time.ticks_diff(now, last) < hold_ms");
    expect(code).toContain("hardware_pir_motion(2, int(3 * 1000))");
  });

  it("converts light and soil ADC readings into calibrated percentages", () => {
    const light = generate([{
      type: "hardware_light_percent",
      fields: { PIN: "1" },
      inputs: { DARK: number(100), BRIGHT: number(3000) },
    }], "esp32-s3");
    expect(light).toContain("def hardware_adc_percent(pin, low, high):");
    expect(light).toContain("machine.ADC(machine.Pin(pin)).read()");
    expect(light).toContain("percent = (value - low) * 100.0 / (high - low)");
    expect(light).toContain("hardware_adc_percent(1, 100, 3000)");

    const soil = generate([{
      type: "hardware_soil_percent",
      fields: { PIN: "2" },
      inputs: { DRY: number(4095), WET: number(0) },
    }], "esp32-s3");
    expect(soil).toContain("hardware_adc_percent(2, 4095, 0)");
  });

  it("switches a relay for both trigger polarities", () => {
    const onLow = generate([{
      type: "hardware_relay_set",
      fields: { PIN: "4", STATE: "on", ACTIVE: "low" },
    }], "esp32-s3");
    const offLow = generate([{
      type: "hardware_relay_set",
      fields: { PIN: "4", STATE: "off", ACTIVE: "low" },
    }], "esp32-s3");
    const onHigh = generate([{
      type: "hardware_relay_set",
      fields: { PIN: "4", STATE: "on", ACTIVE: "high" },
    }], "esp32-s3");

    expect(onLow).toContain("machine.Pin(4, machine.Pin.OUT).value(0)");
    expect(offLow).toContain("machine.Pin(4, machine.Pin.OUT).value(1)");
    expect(onHigh).toContain("machine.Pin(4, machine.Pin.OUT).value(1)");
  });

  it("drives a DC motor with direction pins and clamped PWM speed", () => {
    const code = generate([{
      type: "hardware_dc_motor",
      fields: { IN1: "2", IN2: "4", PWM: "5" },
      inputs: { SPEED: number(-40) },
    }], "esp32-s3");

    expect(code).toContain("def hardware_dc_motor(in1, in2, pwm_pin, speed):");
    expect(code).toContain("if speed > 100:");
    expect(code).toContain("if speed < -100:");
    expect(code).toContain("forward = machine.Pin(in1, machine.Pin.OUT)");
    expect(code).toContain("backward = machine.Pin(in2, machine.Pin.OUT)");
    expect(code).toContain("hardware_set_pwm(pwm_pin, 1000, int(abs(speed) * 1023 / 100))");
    expect(code).toContain("hardware_dc_motor(2, 4, 5, -40)");
  });

  it("fills the whole NeoPixel strip", () => {
    const code = generate([{
      type: "hardware_neopixel_fill",
      inputs: { R: number(10), G: number(20), B: number(30) },
    }], "esp32-s3");

    expect(code).toContain("_neopixel.fill((int(max(0, min(255, 10))), int(max(0, min(255, 20))), int(max(0, min(255, 30)))))");
  });

  it("keeps H1 blocks available on the other boards and validates their ranges", () => {
    const valid = loadWorkspace([
      { type: "hardware_button_read", fields: { PIN: "1", ACTIVE: "low" }, inputs: { DEBOUNCE: number(30) } },
      { type: "hardware_pir_motion", fields: { PIN: "2" }, inputs: { HOLD: number(2) } },
      { type: "hardware_light_percent", fields: { PIN: "1" }, inputs: { DARK: number(0), BRIGHT: number(4095) } },
      { type: "hardware_soil_percent", fields: { PIN: "2" }, inputs: { DRY: number(4095), WET: number(0) } },
      { type: "hardware_relay_set", fields: { PIN: "4", STATE: "off", ACTIVE: "low" } },
      { type: "hardware_dc_motor", fields: { IN1: "2", IN2: "4", PWM: "5" }, inputs: { SPEED: number(0) } },
      { type: "hardware_neopixel_fill", inputs: { R: number(255), G: number(0), B: number(0) } },
    ], "esp32-s3");
    expect(collectHardwareBlockIssues(valid, "esp32-s3")).toEqual([]);
    valid.dispose();

    const wroom = loadWorkspace([{
      type: "hardware_button_read",
      fields: { PIN: "4", ACTIVE: "low" },
      inputs: { DEBOUNCE: number(30) },
    }], "esp32-wroom");
    // H6：P0 通用包已下放到 WROOM，不再按板卡报告“暂未开放”。
    expect(collectHardwareBlockIssues(wroom, "esp32-wroom")).toEqual([]);
    wroom.dispose();

    const button = loadWorkspace([{
      type: "hardware_button_read",
      fields: { PIN: "1", ACTIVE: "high" },
      inputs: { DEBOUNCE: number(1500) },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(button, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「读取按键」积木：消抖时间必须是 0–1000 之间的整数毫秒",
    ]);
    button.dispose();

    const pir = loadWorkspace([{
      type: "hardware_pir_motion",
      fields: { PIN: "2" },
      inputs: { HOLD: number(4.5) },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(pir, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「PIR 人体感应」积木：保持时间必须是 0–3600 之间的整数秒",
    ]);
    pir.dispose();

    const light = loadWorkspace([{
      type: "hardware_light_percent",
      fields: { PIN: "1" },
      inputs: { DARK: number(0), BRIGHT: number(0) },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(light, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「光敏百分比」积木：两个校准值不能相等（会无法换算百分比）",
    ]);
    light.dispose();

    const soil = loadWorkspace([{
      type: "hardware_soil_percent",
      fields: { PIN: "1" },
      inputs: { DRY: number(5000), WET: number(0) },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(soil, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「土壤湿度百分比」积木：干值必须是 0–4095 之间的读数",
    ]);
    soil.dispose();

    const motor = loadWorkspace([{
      type: "hardware_dc_motor",
      fields: { IN1: "2", IN2: "2", PWM: "5" },
      inputs: { SPEED: number(200) },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(motor, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「直流电机」积木：速度必须在 -100 到 100 之间",
      "「直流电机」积木：IN1、IN2 和 PWM 必须使用不同引脚",
    ]);
    motor.dispose();
  });
});

describe("H3 P1 storage, UART and SPI blocks", () => {
  const text = (value: string) => ({ block: { type: "text", fields: { TEXT: value } } });

  it("appends, checks, deletes and lists device files with controlled failures", () => {
    const code = generate([
      { type: "hardware_file_append", inputs: { PATH: text("/log.txt"), TEXT: text("line") } },
      { type: "hardware_file_exists", inputs: { PATH: text("/data.txt") } },
      { type: "hardware_file_delete", inputs: { PATH: text("/data.txt") } },
      { type: "hardware_file_list", inputs: { PATH: text("/") } },
    ], "esp32-s3");

    expect(code).toContain("import os");
    expect(code).toContain('with open(str(path), "a") as file:');
    expect(code).toContain("os.stat(str(path))");
    expect(code).toContain("os.remove(str(path))");
    expect(code).toContain("os.listdir(str(path))");
    expect(code).toContain("hardware_file_append('/log.txt', 'line')");
    expect(code).toContain("hardware_file_exists('/data.txt')");
    expect(code).toContain("hardware_file_delete('/data.txt')");
    expect(code).toContain("hardware_file_list('/')");
  });

  it("erases an NVS key and commits immediately", () => {
    const code = generate([{ type: "hardware_nvs_delete", inputs: { KEY: text("counter") } }], "esp32-s3");

    expect(code).toContain('_nvs = esp32.NVS("visual_python")');
    expect(code).toContain("def hardware_nvs_delete(key):");
    expect(code).toContain("_nvs.erase_key(str(key))");
    expect(code).toContain("_nvs.commit()");
    expect(code).toContain("hardware_nvs_delete('counter')");
  });

  it("reports UART availability and closes the port safely", () => {
    const wroom = generate([
      { type: "hardware_uart_available" },
      { type: "hardware_uart_deinit" },
    ], "esp32-wroom");

    expect(wroom).toContain("def hardware_uart_available():");
    expect(wroom).toContain("return uart.any() if uart is not None else 0");
    expect(wroom).toContain("def hardware_uart_deinit():");
    expect(wroom).toContain("uart.deinit()");
    expect(wroom).toContain('globals()["_uart"] = None');

    const esp8266Available = generate([{ type: "hardware_uart_available" }], "esp8266-esp12e");
    expect(esp8266Available.trim()).toBe("0");
    const esp8266Close = generate([{ type: "hardware_uart_deinit" }], "esp8266-esp12e");
    expect(esp8266Close).toContain("没有可用的串口");
  });

  it("closes the shared I2C bus and lets the next block recreate it", () => {
    for (const boardId of ["esp32-s3", "esp32-wroom", "esp8266-esp12e"] as const) {
      const code = generate([
        { type: "hardware_i2c_deinit" },
        { type: "hardware_i2c_scan" },
      ], boardId);

      expect(code).toContain("def hardware_i2c_close():");
      expect(code).toContain("bus.deinit()");
      expect(code).toContain('globals()["_i2c"] = None');
      expect(code).toContain("hardware_i2c_bus().scan()");
      expect(code.match(/machine\.I2C\(/g)).toHaveLength(1);
    }

    const lcd = generate([
      { type: "hardware_i2c_deinit" },
      {
        type: "hardware_lcd1602_init",
        fields: { ADDRESS: "0x27", BACKLIGHT: "on" },
        inputs: { COLS: number(16), ROWS: number(2) },
      },
    ], "esp32-s3");
    expect(lcd).toContain("_lcd = lcd1602.Lcd1602(hardware_i2c_bus(), address=0x27, cols=int(16), rows=int(2), backlight=True)");
  });

  it("generates SPI initialization and byte/text transfers", () => {
    const code = generate([
      {
        type: "hardware_spi_init",
        fields: { SPI: "1", SCK: "12", MOSI: "13", MISO: "14" },
        inputs: { BAUD: number(1000000) },
      },
      { type: "hardware_spi_transfer", inputs: { VALUE: number(0x42) } },
      { type: "hardware_spi_transfer_text", inputs: { TEXT: text("Hi") } },
    ], "esp32-s3");

    expect(code).toContain("import machine");
    expect(code).toContain("_spi = machine.SPI(1, baudrate=int(1000000), sck=machine.Pin(12), mosi=machine.Pin(13), miso=machine.Pin(14))");
    expect(code).toContain("def hardware_spi_transfer_byte(value):");
    expect(code).toContain("spi.write_readinto(tx, rx)");
    expect(code).toContain("hardware_spi_transfer_byte(66)");
    expect(code).toContain("def hardware_spi_transfer_text(text):");
    expect(code).toContain("return rx.hex()");
    expect(code).toContain("hardware_spi_transfer_text('Hi')");
    expect(code.match(/import machine/g)).toHaveLength(1);
  });

  it("keeps storage and SPI off WROOM/ESP8266 and UART extras off ESP8266", () => {
    for (const boardId of ["esp32-wroom", "esp8266-esp12e"] as const) {
      const types = hardwareToolboxContents(boardId).map((item) => (item as { type?: string }).type);
      for (const type of [
        "hardware_file_append",
        "hardware_file_exists",
        "hardware_file_delete",
        "hardware_file_list",
        "hardware_nvs_delete",
        "hardware_spi_init",
        "hardware_spi_transfer",
        "hardware_spi_transfer_text",
      ]) {
        expect(types, `${boardId} 不应出现 ${type}`).not.toContain(type);
      }
      expect(types).toContain("hardware_i2c_deinit");
    }

    const wroomTypes = hardwareToolboxContents("esp32-wroom").map((item) => (item as { type?: string }).type);
    expect(wroomTypes).toEqual(expect.arrayContaining(["hardware_uart_available", "hardware_uart_deinit"]));
    const esp8266Types = hardwareToolboxContents("esp8266-esp12e").map((item) => (item as { type?: string }).type);
    expect(esp8266Types).not.toContain("hardware_uart_available");
    expect(esp8266Types).not.toContain("hardware_uart_deinit");
  });

  it("offers storage and SPI defaults on ESP32-S3", () => {
    const contents = hardwareToolboxContents("esp32-s3");
    const block = (type: string) => contents.find((item) => (item as { type?: string }).type === type) as {
      fields?: Record<string, string>;
      inputs?: Record<string, { shadow?: { fields?: Record<string, unknown> } }>;
    } | undefined;

    expect(block("hardware_file_append")?.inputs?.PATH?.shadow?.fields?.TEXT).toBe("/log.txt");
    expect(block("hardware_file_append")?.inputs?.TEXT?.shadow?.fields?.TEXT).toBe("line");
    expect(block("hardware_file_exists")?.inputs?.PATH?.shadow?.fields?.TEXT).toBe("/data.txt");
    expect(block("hardware_file_delete")?.inputs?.PATH?.shadow?.fields?.TEXT).toBe("/data.txt");
    expect(block("hardware_file_list")?.inputs?.PATH?.shadow?.fields?.TEXT).toBe("/");
    expect(block("hardware_nvs_delete")?.inputs?.KEY?.shadow?.fields?.TEXT).toBe("counter");
    expect(block("hardware_spi_init")?.fields).toMatchObject({ SPI: "1", SCK: "12", MOSI: "11", MISO: "13" });
    expect(block("hardware_spi_init")?.inputs?.BAUD?.shadow?.fields?.NUM).toBe(1000000);
    expect(block("hardware_spi_transfer")?.inputs?.VALUE?.shadow?.fields?.NUM).toBe(0);
    expect(block("hardware_spi_transfer_text")?.inputs?.TEXT?.shadow?.fields?.TEXT).toBe("Hello");
  });

  it("validates storage paths, NVS keys and SPI settings", () => {
    const append = loadWorkspace([{ type: "hardware_file_append", inputs: { PATH: text(""), TEXT: text("x") } }], "esp32-s3");
    expect(collectHardwareBlockIssues(append, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「追加设备文件」积木：文件路径不能为空",
    ]);
    append.dispose();

    const deleteMain = loadWorkspace([{ type: "hardware_file_delete", inputs: { PATH: text("/main.py") } }], "esp32-s3");
    expect(collectHardwareBlockIssues(deleteMain, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「删除设备文件」积木：不要删除 /main.py，它可能正在运行",
    ]);
    deleteMain.dispose();

    const list = loadWorkspace([{ type: "hardware_file_list", inputs: { PATH: text("  ") } }], "esp32-s3");
    expect(collectHardwareBlockIssues(list, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「列出设备目录」积木：文件路径不能为空",
    ]);
    list.dispose();

    const nvs = loadWorkspace([{ type: "hardware_nvs_delete", inputs: { KEY: text("bad key") } }], "esp32-s3");
    expect(collectHardwareBlockIssues(nvs, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「删除 NVS 键值」积木：NVS 键必须是 1–15 个 ASCII 字母、数字或下划线",
    ]);
    nvs.dispose();

    const spiPins = loadWorkspace([{
      type: "hardware_spi_init",
      fields: { SPI: "1", SCK: "12", MOSI: "12", MISO: "14" },
      inputs: { BAUD: number(1000000) },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(spiPins, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「初始化 SPI」积木：SCK、MOSI 和 MISO 必须使用不同引脚",
    ]);
    spiPins.dispose();

    const spiBaud = loadWorkspace([{
      type: "hardware_spi_init",
      fields: { SPI: "1", SCK: "12", MOSI: "13", MISO: "14" },
      inputs: { BAUD: number(500) },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(spiBaud, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「初始化 SPI」积木：SPI 波特率必须是 1000–80000000 之间的整数",
    ]);
    spiBaud.dispose();

    const spiByte = loadWorkspace([{ type: "hardware_spi_transfer", inputs: { VALUE: number(256) } }], "esp32-s3");
    expect(collectHardwareBlockIssues(spiByte, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「SPI 收发字节」积木：SPI 发送字节必须是 0–255 之间的整数",
    ]);
    spiByte.dispose();

    const spiBoard = loadWorkspace([{
      type: "hardware_spi_init",
      fields: { SPI: "1", SCK: "4", MOSI: "5", MISO: "16" },
      inputs: { BAUD: number(1000000) },
    }], "esp32-wroom");
    expect(collectHardwareBlockIssues(spiBoard, "esp32-wroom").map((issue) => issue.message)).toEqual([
      "「初始化 SPI」积木：ESP32 WROOM 不支持 SPI 积木（仅 ESP32-S3）",
    ]);
    spiBoard.dispose();
  });

  it("does not generate storage or SPI code on unsupported boards", () => {
    const wroomAppend = generate([
      { type: "hardware_file_append", inputs: { PATH: text("/log.txt"), TEXT: text("x") } },
      { type: "hardware_nvs_delete", inputs: { KEY: text("counter") } },
    ], "esp32-wroom");
    expect(wroomAppend).toContain("仅 ESP32-S3");
    expect(wroomAppend).not.toContain("open(");
    expect(wroomAppend).not.toContain("erase_key");

    const wroomSpi = generate([{
      type: "hardware_spi_init",
      fields: { SPI: "1", SCK: "4", MOSI: "5", MISO: "16" },
      inputs: { BAUD: number(1000000) },
    }], "esp32-wroom");
    expect(wroomSpi).toContain("不支持 SPI 积木");
    expect(wroomSpi).not.toContain("machine.SPI");
  });
});

describe("H2 P0 LCD1602 and BH1750 blocks", () => {
  const text = (value: string) => ({ block: { type: "text", fields: { TEXT: value } } });

  it("generates LCD1602 initialization, text and clear code with one shared I2C bus", () => {
    const code = generate([
      {
        type: "hardware_lcd1602_init",
        fields: { ADDRESS: "0x27", BACKLIGHT: "on" },
        inputs: { COLS: number(16), ROWS: number(2) },
      },
      {
        type: "hardware_lcd1602_text",
        inputs: { ROW: number(1), COL: number(1), TEXT: text("Hello") },
      },
      { type: "hardware_lcd1602_clear" },
    ], "esp32-s3");

    expect(code).toContain("import lcd1602");
    expect(code).toContain("def hardware_i2c_bus():");
    expect(code).toContain("_lcd = lcd1602.Lcd1602(hardware_i2c_bus(), address=0x27, cols=int(16), rows=int(2), backlight=True)");
    expect(code).toContain("_lcd.text(int(1) - 1, int(1) - 1, str('Hello'))");
    expect(code).toContain("_lcd.clear()");
    expect(code.match(/machine\.I2C\(/g)).toHaveLength(1);
  });

  it("passes the alternate LCD address and backlight state", () => {
    const code = generate([{
      type: "hardware_lcd1602_init",
      fields: { ADDRESS: "0x3F", BACKLIGHT: "off" },
      inputs: { COLS: number(20), ROWS: number(4) },
    }], "esp32-s3");

    expect(code).toContain("address=0x3F, cols=int(20), rows=int(4), backlight=False");
  });

  it("reads lux through one cached BH1750 helper", () => {
    const code = generate([
      { type: "hardware_bh1750_lux", fields: { ADDRESS: "0x23" } },
      { type: "hardware_bh1750_lux", fields: { ADDRESS: "0x23" } },
    ], "esp32-s3");

    expect(code).toContain("import bh1750");
    expect(code).toContain("def hardware_bh1750_read(address):");
    expect(code).toContain('if globals().get("_bh1750_address", -1) != address:');
    expect(code).toContain("bh1750.BH1750(hardware_i2c_bus(), address=address)");
    expect(code).toContain("return globals()[\"_bh1750\"].read_lux()");
    expect(code.match(/def hardware_bh1750_read\(/g)).toHaveLength(1);
    expect(code.match(/machine\.I2C\(/g)).toHaveLength(1);
    expect(code.match(/hardware_bh1750_read\(0x23\)/g)).toHaveLength(2);
  });

  it("offers the H2 blocks on WROOM and ESP8266 after H6 down-channeling", () => {
    for (const boardId of ["esp32-wroom", "esp8266-esp12e"] as const) {
      const types = hardwareToolboxContents(boardId).map((item) => (item as { type?: string }).type);
      for (const type of ["hardware_lcd1602_init", "hardware_lcd1602_text", "hardware_lcd1602_clear", "hardware_bh1750_lux"]) {
        expect(types, `${boardId} 缺少 ${type}`).toContain(type);
      }
    }
  });

  it("offers S3 defaults for LCD1602 and BH1750", () => {
    const contents = hardwareToolboxContents("esp32-s3");
    const block = (type: string) => contents.find((item) => (item as { type?: string }).type === type) as {
      fields?: Record<string, string>;
      inputs?: Record<string, { shadow?: { fields?: Record<string, unknown> } }>;
    } | undefined;

    expect(block("hardware_lcd1602_init")?.fields).toMatchObject({ ADDRESS: "0x27", BACKLIGHT: "on" });
    expect(block("hardware_lcd1602_init")?.inputs?.COLS?.shadow?.fields?.NUM).toBe(16);
    expect(block("hardware_lcd1602_init")?.inputs?.ROWS?.shadow?.fields?.NUM).toBe(2);
    expect(block("hardware_lcd1602_text")?.inputs?.ROW?.shadow?.fields?.NUM).toBe(1);
    expect(block("hardware_lcd1602_text")?.inputs?.COL?.shadow?.fields?.NUM).toBe(1);
    expect(block("hardware_lcd1602_text")?.inputs?.TEXT?.shadow?.fields?.TEXT).toBe("Hello");
    expect(block("hardware_bh1750_lux")?.fields?.ADDRESS).toBe("0x23");
  });

  it("validates LCD dimensions, coordinates and ASCII text", () => {
    const valid = loadWorkspace([
      {
        type: "hardware_lcd1602_init",
        fields: { ADDRESS: "0x27", BACKLIGHT: "on" },
        inputs: { COLS: number(16), ROWS: number(2) },
      },
      {
        type: "hardware_lcd1602_text",
        inputs: { ROW: number(1), COL: number(1), TEXT: text("Hi 123!") },
      },
      { type: "hardware_lcd1602_clear" },
      { type: "hardware_bh1750_lux", fields: { ADDRESS: "0x23" } },
    ], "esp32-s3");
    expect(collectHardwareBlockIssues(valid, "esp32-s3")).toEqual([]);
    valid.dispose();

    const init = loadWorkspace([{
      type: "hardware_lcd1602_init",
      fields: { ADDRESS: "0x27" },
      inputs: { COLS: number(21), ROWS: number(5) },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(init, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「初始化 LCD1602」积木：列数必须是 1–20 之间的整数",
      "「初始化 LCD1602」积木：行数必须是 1–4 之间的整数",
    ]);
    init.dispose();

    const textBlock = loadWorkspace([{
      type: "hardware_lcd1602_text",
      inputs: { ROW: number(0), COL: number(21), TEXT: text("中文") },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(textBlock, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「LCD1602 显示文字」积木：行号必须是 1–4 之间的整数",
      "「LCD1602 显示文字」积木：列号必须是 1–20 之间的整数",
      "「LCD1602 显示文字」积木：LCD1602 默认字库只能显示英文字母、数字和常用符号",
    ]);
    textBlock.dispose();
  });

  it("does not report H2 blocks as unsupported on WROOM after H6", () => {
    const workspace = loadWorkspace([
      { type: "hardware_lcd1602_init", fields: { ADDRESS: "0x27" }, inputs: { COLS: number(16), ROWS: number(2) } },
      { type: "hardware_lcd1602_text", inputs: { ROW: number(1), COL: number(1), TEXT: text("Hi") } },
      { type: "hardware_lcd1602_clear" },
      { type: "hardware_bh1750_lux", fields: { ADDRESS: "0x23" } },
    ], "esp32-wroom");

    expect(collectHardwareBlockIssues(workspace, "esp32-wroom")).toEqual([]);
    workspace.dispose();
  });

  it("adapts the P0 analog percentage blocks to each board ADC", () => {
    const wroom = generate([{ type: "hardware_light_percent", fields: { PIN: "32" } }], "esp32-wroom");
    expect(wroom).toContain("value = machine.ADC(machine.Pin(pin)).read()");
    expect(wroom).toContain("hardware_adc_percent(32, 0, 4095)");

    const esp8266 = generate([{ type: "hardware_light_percent", fields: { PIN: "A0" } }], "esp8266-esp12e");
    expect(esp8266).toContain("value = machine.ADC(0).read()");
    expect(esp8266).toContain("hardware_adc_percent(0, 0, 1023)");
    expect(esp8266).not.toContain("hardware_adc_percent(A0");
  });
});

describe("H5 P1-C sensor, display and actuator driver blocks", () => {
  it("reads DS18B20 through one cached one-wire helper", () => {
    const code = generate([
      { type: "hardware_ds18b20_temperature", fields: { PIN: "4" }, inputs: { INDEX: number(2) } },
      { type: "hardware_ds18b20_temperature", fields: { PIN: "4" }, inputs: { INDEX: number(1) } },
    ], "esp32-s3");

    expect(code).toContain("import onewire");
    expect(code).toContain("import ds18x20");
    expect(code).toContain("_ds18b20_sensors = {}");
    expect(code).toContain("def hardware_ds18b20_read(pin, index):");
    expect(code).toContain("sensor = ds18x20.DS18X20(onewire.OneWire(machine.Pin(pin)))");
    expect(code).toContain("sensor.convert_temp()");
    expect(code).toContain("time.sleep_ms(750)");
    expect(code).toContain("return -127.0");
    expect(code.match(/def hardware_ds18b20_read\(/g)).toHaveLength(1);
    expect(code.match(/hardware_ds18b20_read\(4, int\(2\)\)/g)).toHaveLength(1);
    expect(code.match(/hardware_ds18b20_read\(4, int\(1\)\)/g)).toHaveLength(1);
  });

  it("shares one lazy I2C bus across BH1750, BMP280, SHT30 and MPU6050", () => {
    const code = generate([
      { type: "hardware_bh1750_lux", fields: { ADDRESS: "0x23" } },
      { type: "hardware_bmp280_read", fields: { FIELD: "pressure", ADDRESS: "0x77" } },
      { type: "hardware_sht30_read", fields: { FIELD: "humidity", ADDRESS: "0x45" } },
      { type: "hardware_mpu6050_read", fields: { READING: "gyro_z", ADDRESS: "0x69" } },
    ], "esp32-s3");

    expect(code).toContain("import bmp280");
    expect(code).toContain("import sht30");
    expect(code).toContain("import mpu6050");
    expect(code).toContain("_bmp280_sensors = {}");
    expect(code).toContain("_sht30_sensors = {}");
    expect(code).toContain("_mpu6050_sensors = {}");
    expect(code).toContain("def hardware_bmp280_read(address, field):");
    expect(code).toContain("def hardware_sht30_read(address, field):");
    expect(code).toContain("def hardware_mpu6050_read(address, reading):");
    expect(code).toContain('hardware_bmp280_read(0x77, "pressure")');
    expect(code).toContain('hardware_sht30_read(0x45, "humidity")');
    expect(code).toContain('hardware_mpu6050_read(0x69, "gyro_z")');
    expect(code).toContain("def hardware_i2c_bus():");
    expect(code.match(/def hardware_i2c_bus\(/g)).toHaveLength(1);
    expect(code.match(/machine\.I2C\(/g)).toHaveLength(1);
    expect(code.match(/return -999\.0/g)).toHaveLength(3);
  });

  it("initializes TM1637 and shows a number with decimals and colon", () => {
    const code = generate([
      { type: "hardware_tm1637_init", fields: { CLK: "4", DIO: "5", BRIGHTNESS: "3" } },
      { type: "hardware_tm1637_number", fields: { COLON: "on" }, inputs: { VALUE: number(12.5), DECIMALS: number(1) } },
    ], "esp32-s3");

    expect(code).toContain("import tm1637");
    expect(code).toContain("_tm1637 = tm1637.Tm1637(machine.Pin(4, machine.Pin.OUT, value=1), machine.Pin(5, machine.Pin.OUT, value=1), brightness=3)");
    expect(code).toContain("_tm1637.show_number(12.5, decimals=int(1), colon=True)");
  });

  it("drives a four-phase stepper motor and releases the coils", () => {
    const code = generate([
      {
        type: "hardware_stepper_move",
        fields: { IN1: "4", IN2: "5", IN3: "6", IN4: "7" },
        inputs: { STEPS: number(-200), INTERVAL: number(5) },
      },
    ], "esp32-s3");

    expect(code).toContain("def hardware_stepper_move(in1, in2, in3, in4, steps, interval_ms):");
    expect(code).toContain("sequence = ((1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1))");
    expect(code).toContain("hardware_stepper_move(4, 5, 6, 7, int(-200), int(5))");
    expect(code).toContain("pin.value(0)");
    expect(code.match(/time\.sleep_ms\(interval_ms\)/g)).toHaveLength(1);
  });

  it("draws OLED lines and rectangles through the framebuffer", () => {
    const code = generate([
      { type: "hardware_oled_line", fields: { STATE: "on" }, inputs: { X1: number(0), Y1: number(0), X2: number(64), Y2: number(32) } },
      { type: "hardware_oled_rect", fields: { FILL: "fill" }, inputs: { X: number(4), Y: number(8), WIDTH: number(32), HEIGHT: number(16) } },
      { type: "hardware_oled_rect", fields: { FILL: "outline" }, inputs: { X: number(0), Y: number(0), WIDTH: number(16), HEIGHT: number(8) } },
    ], "esp32-s3");

    expect(code).toContain("_oled.line(int(0), int(0), int(64), int(32), 1)");
    expect(code).toContain("_oled.fill_rect(int(4), int(8), int(32), int(16), 1)");
    expect(code).toContain("_oled.rect(int(0), int(0), int(16), int(8), 1)");
  });

  it("keeps the H5 blocks off WROOM and ESP8266", () => {
    const types = ["hardware_ds18b20_temperature", "hardware_bmp280_read", "hardware_sht30_read", "hardware_mpu6050_read", "hardware_tm1637_init", "hardware_tm1637_number", "hardware_stepper_move", "hardware_oled_line", "hardware_oled_rect"];
    for (const boardId of ["esp32-wroom", "esp8266-esp12e"] as const) {
      const entries = hardwareToolboxContents(boardId).map((item) => (item as { type?: string }).type);
      for (const type of types) expect(entries, `${boardId} 不应出现 ${type}`).not.toContain(type);
    }
    const s3 = hardwareToolboxContents("esp32-s3").map((item) => (item as { type?: string }).type);
    for (const type of types) expect(s3, `ESP32-S3 缺少 ${type}`).toContain(type);
  });

  it("offers S3 defaults for the H5 blocks", () => {
    const contents = hardwareToolboxContents("esp32-s3");
    const block = (type: string) => contents.find((item) => (item as { type?: string }).type === type) as {
      fields?: Record<string, string>;
      inputs?: Record<string, { shadow?: { fields?: Record<string, unknown> } }>;
    } | undefined;

    expect(block("hardware_ds18b20_temperature")?.fields?.PIN).toBe("1");
    expect(block("hardware_ds18b20_temperature")?.inputs?.INDEX?.shadow?.fields?.NUM).toBe(1);
    expect(block("hardware_bmp280_read")?.fields).toMatchObject({ FIELD: "temperature", ADDRESS: "0x76" });
    expect(block("hardware_sht30_read")?.fields).toMatchObject({ FIELD: "temperature", ADDRESS: "0x44" });
    expect(block("hardware_mpu6050_read")?.fields).toMatchObject({ READING: "accel_x", ADDRESS: "0x68" });
    expect(block("hardware_tm1637_init")?.fields).toMatchObject({ CLK: "1", DIO: "2", BRIGHTNESS: "7" });
    expect(block("hardware_tm1637_number")?.fields?.COLON).toBe("off");
    expect(block("hardware_tm1637_number")?.inputs?.DECIMALS?.shadow?.fields?.NUM).toBe(0);
    expect(block("hardware_stepper_move")?.fields).toMatchObject({ IN1: "1", IN2: "2", IN3: "4", IN4: "5" });
    expect(block("hardware_stepper_move")?.inputs?.STEPS?.shadow?.fields?.NUM).toBe(200);
    expect(block("hardware_stepper_move")?.inputs?.INTERVAL?.shadow?.fields?.NUM).toBe(5);
    expect(block("hardware_oled_line")?.fields?.STATE).toBe("on");
    expect(block("hardware_oled_rect")?.fields?.FILL).toBe("outline");
  });

  it("reports H5 blocks on WROOM through the P1 gate", () => {
    const workspace = loadWorkspace([
      { type: "hardware_ds18b20_temperature", fields: { PIN: "4" }, inputs: { INDEX: number(1) } },
      { type: "hardware_bmp280_read", fields: { FIELD: "temperature", ADDRESS: "0x76" } },
      { type: "hardware_stepper_move", fields: { IN1: "4", IN2: "5", IN3: "6", IN4: "7" }, inputs: { STEPS: number(200), INTERVAL: number(5) } },
      { type: "hardware_oled_rect", fields: { FILL: "outline" }, inputs: { X: number(0), Y: number(0), WIDTH: number(16), HEIGHT: number(8) } },
    ], "esp32-wroom");

    expect(collectHardwareBlockIssues(workspace, "esp32-wroom").map((issue) => issue.message)).toEqual([
      "「DS18B20 温度」积木：ESP32 WROOM 暂未开放该模块积木（仅 ESP32-S3，待 S3 真机验证后评估下放）",
      "「读取 BMP280」积木：ESP32 WROOM 暂未开放该模块积木（仅 ESP32-S3，待 S3 真机验证后评估下放）",
      "「步进电机转动」积木：ESP32 WROOM 暂未开放该模块积木（仅 ESP32-S3，待 S3 真机验证后评估下放）",
      "「OLED 画矩形」积木：ESP32 WROOM 暂未开放该模块积木（仅 ESP32-S3，待 S3 真机验证后评估下放）",
    ]);
    workspace.dispose();
  });

  it("validates H5 sensor indexes, TM1637 settings and stepper ranges", () => {
    const sensor = loadWorkspace([
      { type: "hardware_ds18b20_temperature", fields: { PIN: "4" }, inputs: { INDEX: number(0) } },
    ], "esp32-s3");
    expect(collectHardwareBlockIssues(sensor, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「DS18B20 温度」积木：传感器序号必须是 1–8 之间的整数",
    ]);
    sensor.dispose();

    const tm = loadWorkspace([
      { type: "hardware_tm1637_init", fields: { CLK: "4", DIO: "4", BRIGHTNESS: "7" } },
      { type: "hardware_tm1637_number", fields: { COLON: "off" }, inputs: { VALUE: number(1), DECIMALS: number(4) } },
    ], "esp32-s3");
    expect(collectHardwareBlockIssues(tm, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「初始化 TM1637」积木：CLK 和 DIO 必须使用不同引脚",
      "「TM1637 显示数字」积木：小数位必须是 0–3 之间的整数",
    ]);
    tm.dispose();

    const stepper = loadWorkspace([
      {
        type: "hardware_stepper_move",
        fields: { IN1: "4", IN2: "4", IN3: "6", IN4: "7" },
        inputs: { STEPS: number(200000), INTERVAL: number(0) },
      },
    ], "esp32-s3");
    expect(collectHardwareBlockIssues(stepper, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「步进电机转动」积木：IN1–IN4 必须使用 4 个不同引脚",
      "「步进电机转动」积木：步数必须是 -100000 到 100000 之间的整数",
      "「步进电机转动」积木：间隔必须是 1–1000 之间的整数毫秒",
    ]);
    stepper.dispose();
  });

  it("does not generate invalid TM1637 or stepper code", () => {
    const tm = generate([
      { type: "hardware_tm1637_init", fields: { CLK: "4", DIO: "4", BRIGHTNESS: "7" } },
      { type: "hardware_tm1637_number", fields: { COLON: "off" }, inputs: { VALUE: number(1), DECIMALS: number(4) } },
    ], "esp32-s3");
    expect(tm).toContain("# 硬件积木未生成代码：TM1637 的 CLK 和 DIO 必须使用不同引脚");
    expect(tm).toContain("# 硬件积木未生成代码：TM1637 小数位必须是 0–3 之间的整数");
    expect(tm).not.toContain("_tm1637.show_number(");

    const stepper = generate([{
      type: "hardware_stepper_move",
      fields: { IN1: "4", IN2: "5", IN3: "6", IN4: "6" },
      inputs: { STEPS: number(200), INTERVAL: number(5) },
    }], "esp32-s3");
    expect(stepper).toContain("# 硬件积木未生成代码：步进电机的 IN1–IN4 必须使用 4 个不同引脚");
    expect(stepper).not.toContain("machine.Pin(in1, machine.Pin.OUT)");
  });
});

describe("P2 clock, time-of-flight, progress and download blocks", () => {
  const text = (value: string) => ({ block: { type: "text", fields: { TEXT: value } } });

  it("reads and writes the DS3231 through one cached helper", () => {
    const code = generate([
      { type: "hardware_ds3231_read", fields: { COMPONENT: "0" } },
      {
        type: "hardware_ds3231_set",
        inputs: { YEAR: number(2026), MONTH: number(1), DAY: number(2), HOUR: number(3), MINUTE: number(4), SECOND: number(5) },
      },
    ], "esp32-s3");

    expect(code).toContain("import ds3231");
    expect(code).toContain("def hardware_ds3231_read(component):");
    expect(code).toContain('sensor = globals().get("_ds3231")');
    expect(code).toContain("values = sensor.read_datetime()");
    expect(code).toContain("return values[component]");
    expect(code).toContain("def hardware_ds3231_write(year, month, day, hour, minute, second):");
    expect(code).toContain("sensor.set_datetime(year, month, day, hour, minute, second)");
    expect(code).toContain("hardware_ds3231_read(0)");
    expect(code).toContain("hardware_ds3231_write(2026, 1, 2, 3, 4, 5)");
    expect(code.match(/def hardware_i2c_bus\(/g)).toHaveLength(1);
    expect(code.match(/machine\.I2C\(/g)).toHaveLength(1);
  });

  it("reads VL53L0X distance through one cached sensor", () => {
    const code = generate([{ type: "hardware_vl53l0x_distance" }], "esp32-s3");

    expect(code).toContain("import vl53l0x");
    expect(code).toContain("_vl53l0x = None");
    expect(code).toContain("def hardware_vl53l0x_read():");
    expect(code).toContain("_vl53l0x = vl53l0x.VL53L0X(hardware_i2c_bus())");
    expect(code).toContain("return _vl53l0x.read_mm()");
    expect(code).toContain("return -1");
    expect(code).toContain("hardware_vl53l0x_read()");
  });

  it("draws an OLED progress bar with a clamped percentage", () => {
    const code = generate([{
      type: "hardware_oled_progress",
      inputs: { X: number(0), Y: number(48), WIDTH: number(128), HEIGHT: number(10), PERCENT: number(50) },
    }], "esp32-s3");

    expect(code).toContain("def hardware_oled_progress(x, y, width, height, percent):");
    expect(code).toContain("_oled.rect(x, y, width, height, 1)");
    expect(code).toContain("_oled.fill_rect(x, y, int(width * percent / 100), height, 1)");
    expect(code).toContain("hardware_oled_progress(int(0), int(48), int(128), int(10), 50)");
  });

  it("downloads a URL into a device file with explicit error codes", () => {
    const code = generate([{
      type: "hardware_http_download",
      inputs: { URL: text("http://example.com/a.bin"), PATH: text("/a.bin") },
    }], "esp32-s3");

    expect(code).toContain("import requests");
    expect(code).toContain("def hardware_http_download(url, path):");
    expect(code).toContain('with open(str(path), "wb") as file:');
    expect(code).toContain("return -1");
    expect(code).toContain("return -2");
    expect(code).toContain("return len(data)");
    expect(code).toContain("hardware_http_download('http://example.com/a.bin', '/a.bin')");
  });

  it("keeps the P2 blocks off WROOM and ESP8266", () => {
    const types = [
      "hardware_ds3231_read",
      "hardware_ds3231_set",
      "hardware_vl53l0x_distance",
      "hardware_oled_progress",
      "hardware_http_download",
      "hardware_http_status",
      "hardware_mqtt_connected",
      "hardware_ir_receive",
      "hardware_file_size",
      "hardware_rc522_uid",
      "hardware_sd_card",
      "hardware_webserver_serve",
      "hardware_timer_every",
      "hardware_ble_gatt_start",
      "hardware_ble_gatt_notify",
    ];
    for (const boardId of ["esp32-wroom", "esp8266-esp12e"] as const) {
      const entries = hardwareToolboxContents(boardId).map((item) => (item as { type?: string }).type);
      for (const type of types) expect(entries, `${boardId} 不应出现 ${type}`).not.toContain(type);
    }
    const s3 = hardwareToolboxContents("esp32-s3").map((item) => (item as { type?: string }).type);
    for (const type of types) expect(s3, `ESP32-S3 缺少 ${type}`).toContain(type);
  });

  it("offers S3 defaults for the P2 blocks", () => {
    const contents = hardwareToolboxContents("esp32-s3");
    const block = (type: string) => contents.find((item) => (item as { type?: string }).type === type) as {
      fields?: Record<string, string>;
      inputs?: Record<string, { shadow?: { fields?: Record<string, unknown> } }>;
    } | undefined;

    expect(block("hardware_ds3231_read")?.fields?.COMPONENT).toBe("0");
    expect(block("hardware_ds3231_set")?.inputs?.YEAR?.shadow?.fields?.NUM).toBe(2026);
    expect(block("hardware_ds3231_set")?.inputs?.MONTH?.shadow?.fields?.NUM).toBe(1);
    expect(block("hardware_oled_progress")?.inputs?.PERCENT?.shadow?.fields?.NUM).toBe(50);
    expect(block("hardware_oled_progress")?.inputs?.WIDTH?.shadow?.fields?.NUM).toBe(128);
    expect(block("hardware_http_download")?.inputs?.URL?.shadow?.fields?.TEXT).toBe("http://example.com/data.txt");
    expect(block("hardware_http_download")?.inputs?.PATH?.shadow?.fields?.TEXT).toBe("/data.txt");
    expect(block("hardware_http_status")).toBeTruthy();
    expect(block("hardware_mqtt_connected")).toBeTruthy();
    expect(block("hardware_ir_receive")?.inputs?.TIMEOUT?.shadow?.fields?.NUM).toBe(5000);
    expect(block("hardware_file_size")?.inputs?.PATH?.shadow?.fields?.TEXT).toBe("/data.txt");
  });

  it("reports P2 blocks on WROOM through the P2 gate", () => {
    const workspace = loadWorkspace([
      { type: "hardware_ds3231_read", fields: { COMPONENT: "0" } },
      { type: "hardware_vl53l0x_distance" },
      { type: "hardware_oled_progress", inputs: { X: number(0), Y: number(0), WIDTH: number(64), HEIGHT: number(8), PERCENT: number(50) } },
      { type: "hardware_http_download", inputs: { URL: text("http://example.com/a.bin"), PATH: text("/a.bin") } },
    ], "esp32-wroom");

    expect(collectHardwareBlockIssues(workspace, "esp32-wroom").map((issue) => issue.message)).toEqual([
      "「读取 DS3231」积木：ESP32 WROOM 暂未开放该模块积木（仅 ESP32-S3，待 S3 真机验证后评估下放）",
      "「VL53L0X 测距」积木：ESP32 WROOM 暂未开放该模块积木（仅 ESP32-S3，待 S3 真机验证后评估下放）",
      "「OLED 进度条」积木：ESP32 WROOM 暂未开放该模块积木（仅 ESP32-S3，待 S3 真机验证后评估下放）",
      "「HTTP 下载文件」积木：ESP32 WROOM 暂未开放该模块积木（仅 ESP32-S3，待 S3 真机验证后评估下放）",
    ]);
    workspace.dispose();
  });

  it("validates DS3231 fields, progress percentage and download paths", () => {
    const clock = loadWorkspace([{
      type: "hardware_ds3231_set",
      inputs: { YEAR: number(1999), MONTH: number(13), DAY: number(1), HOUR: number(0), MINUTE: number(0), SECOND: number(0) },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(clock, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「设置 DS3231 时间」积木：年份必须是 2000–2099 之间的整数",
      "「设置 DS3231 时间」积木：月份必须是 1–12 之间的整数",
    ]);
    clock.dispose();

    const progress = loadWorkspace([{
      type: "hardware_oled_progress",
      inputs: { X: number(0), Y: number(0), WIDTH: number(64), HEIGHT: number(8), PERCENT: number(101) },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(progress, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「OLED 进度条」积木：百分比必须是 0–100 之间的数",
    ]);
    progress.dispose();

    const download = loadWorkspace([{
      type: "hardware_http_download",
      inputs: { URL: text("ftp://example.com/a.bin"), PATH: text("/main.py") },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(download, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「HTTP 下载文件」积木：网址必须以 http:// 或 https:// 开头",
      "「HTTP 下载文件」积木：不要覆盖 /main.py，它会替换正在运行的程序",
    ]);
    download.dispose();
  });

  it("tracks the last HTTP status and MQTT connection state", () => {
    const code = generate([
      { type: "hardware_http_get", inputs: { URL: text("http://example.com") } },
      { type: "hardware_http_status" },
      {
        type: "hardware_mqtt_connect",
        inputs: { SERVER: text("192.168.1.10"), PORT: number(1883), CLIENT_ID: text("vp"), USER: text(""), PASSWORD: text("") },
      },
      { type: "hardware_mqtt_connected" },
    ], "esp32-s3");

    expect(code).toContain('globals()["_http_status"] = response.status_code');
    expect(code).toContain('globals()["_http_status"] = 0');
    expect(code).toContain('globals().get("_http_status", 0)');
    expect(code).toContain("def hardware_mqtt_connected():");
    expect(code).toContain("return _mqtt.sock is not None");
    expect(code).toContain("hardware_mqtt_connected()");
  });

  it("decodes NEC infrared frames with inverse-byte validation", () => {
    const code = generate([
      { type: "hardware_ir_receive", fields: { PIN: "4" }, inputs: { TIMEOUT: number(5000) } },
    ], "esp32-s3");

    expect(code).toContain("import machine");
    expect(code).toContain("def hardware_ir_read(pin, timeout_ms):");
    expect(code).toContain("receiver = machine.Pin(pin, machine.Pin.IN)");
    expect(code).toContain("machine.time_pulse_us(receiver, 0, 20000)");
    expect(code).toContain("machine.time_pulse_us(receiver, 1, 2000)");
    expect(code).toContain("value |= 1 << index");
    expect(code).toContain("if address ^ ((value >> 8) & 0xFF) != 0xFF:");
    expect(code).toContain("return command");
    expect(code).toContain("hardware_ir_read(4, int(5000))");
  });

  it("reads a device file size and returns -1 when missing", () => {
    const code = generate([
      { type: "hardware_file_size", inputs: { PATH: text("/data.txt") } },
    ], "esp32-s3");

    expect(code).toContain("def hardware_file_size(path):");
    expect(code).toContain("return os.stat(str(path))[6]");
    expect(code).toContain("return -1");
    expect(code).toContain("hardware_file_size('/data.txt')");
  });

  it("validates the infrared timeout and file-size paths", () => {
    const ir = loadWorkspace([{
      type: "hardware_ir_receive",
      fields: { PIN: "4" },
      inputs: { TIMEOUT: number(60001) },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(ir, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「红外接收」积木：超时必须是 0–60000 之间的整数毫秒",
    ]);
    ir.dispose();

    const size = loadWorkspace([{
      type: "hardware_file_size",
      inputs: { PATH: text("") },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(size, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「设备文件大小」积木：文件路径不能为空",
    ]);
    size.dispose();
  });

  it("reads a 4-byte UID from the RC522 over SPI", () => {
    const code = generate([{
      type: "hardware_rc522_uid",
      fields: { SPI: "2", SCK: "12", MOSI: "11", MISO: "13", CS: "10", RST: "7" },
    }], "esp32-s3");

    expect(code).toContain("import rc522");
    expect(code).toContain("def hardware_rc522_read(spi_id, sck, mosi, miso, cs, rst):");
    expect(code).toContain("spi = machine.SPI(spi_id, baudrate=1000000, polarity=0, phase=0, sck=machine.Pin(sck), mosi=machine.Pin(mosi), miso=machine.Pin(miso))");
    expect(code).toContain("sensor = rc522.RC522(spi, machine.Pin(cs, machine.Pin.OUT, value=1), machine.Pin(rst, machine.Pin.OUT, value=1))");
    expect(code).toContain("return sensor.read_uid()");
    expect(code).toContain('return ""');
    expect(code).toContain("hardware_rc522_read(2, 12, 11, 13, 10, 7)");
  });

  it("mounts and unmounts an SD card through slot 2", () => {
    const code = generate([
      { type: "hardware_sd_card", fields: { ACTION: "mount", SCK: "12", MOSI: "11", MISO: "13", CS: "10" } },
      { type: "hardware_sd_card", fields: { ACTION: "unmount" } },
    ], "esp32-s3");

    expect(code).toContain("import machine");
    expect(code).toContain("def hardware_sd_card(action, sck, mosi, miso, cs):");
    expect(code).toContain('sd = machine.SDCard(slot=2, sck=machine.Pin(sck), mosi=machine.Pin(mosi), miso=machine.Pin(miso), cs=machine.Pin(cs), freq=20000000)');
    expect(code).toContain('os.mount(sd, "/sd")');
    expect(code).toContain('os.umount("/sd")');
    expect(code).toContain('hardware_sd_card("mount", 12, 11, 13, 10)');
    expect(code).toContain('hardware_sd_card("unmount", 0, 0, 0, 0)');
  });

  it("offers distinct S3 defaults for RFID and SD card", () => {
    const contents = hardwareToolboxContents("esp32-s3");
    const block = (type: string) => contents.find((item) => (item as { type?: string }).type === type) as {
      fields?: Record<string, string>;
      inputs?: Record<string, { shadow?: { fields?: Record<string, unknown> } }>;
    } | undefined;

    expect(block("hardware_rc522_uid")?.fields).toMatchObject({ SPI: "1", SCK: "1", MOSI: "2", MISO: "6", CS: "4", RST: "5" });
    expect(block("hardware_sd_card")?.fields).toMatchObject({ ACTION: "mount", SCK: "1", MOSI: "2", MISO: "5", CS: "4" });
    expect(block("hardware_webserver_serve")?.inputs?.PORT?.shadow?.fields?.NUM).toBe(80);
    expect(block("hardware_webserver_serve")?.inputs?.BODY?.shadow?.fields?.TEXT).toBe("<h1>Visual Python</h1>");
  });

  it("reports duplicate RFID and SD card pins", () => {
    const rfid = loadWorkspace([{
      type: "hardware_rc522_uid",
      fields: { SPI: "2", SCK: "12", MOSI: "12", MISO: "13", CS: "10", RST: "7" },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(rfid, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「RFID 读卡」积木：SCK、MOSI、MISO、CS、RST 必须使用不同引脚",
    ]);
    rfid.dispose();

    const sd = loadWorkspace([{
      type: "hardware_sd_card",
      fields: { ACTION: "mount", SCK: "12", MOSI: "11", MISO: "11", CS: "10" },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(sd, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「SD 卡挂载/卸载」积木：SCK、MOSI、MISO、CS 必须使用不同引脚",
    ]);
    sd.dispose();
  });

  it("serves one HTTP request per call and returns its path", () => {
    const code = generate([{
      type: "hardware_webserver_serve",
      inputs: { PORT: number(80), BODY: text("<h1>Hi</h1>") },
    }], "esp32-s3");

    expect(code).toContain("import socket");
    expect(code).toContain("def hardware_webserver_serve(port, body):");
    expect(code).toContain("server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)");
    expect(code).toContain('server.bind(("", int(port)))');
    expect(code).toContain("client, address = server.accept()");
    expect(code).toContain('request.decode().split(" ")[1]');
    expect(code).toContain("client.send(response.encode())");
    expect(code).toContain("client.close()");
    expect(code).toContain("hardware_webserver_serve(80, '<h1>Hi</h1>')");
  });

  it("validates the web server port", () => {
    const workspace = loadWorkspace([{
      type: "hardware_webserver_serve",
      inputs: { PORT: number(70000), BODY: text("<h1>Hi</h1>") },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(workspace, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「处理一次网页请求」积木：端口必须是 1–65535 之间的整数",
    ]);
    workspace.dispose();
  });

  it("creates a periodic hardware timer around a statement body", () => {
    const code = generate([{
      type: "hardware_timer_every",
      inputs: {
        PERIOD: number(1000),
        BODY: { block: { type: "hardware_pin_write", fields: { PIN: "4", LEVEL: "1" } } },
      },
    }], "esp32-s3");

    expect(code).toContain("import machine");
    expect(code).toMatch(/def hardware_timer_cb_0_[A-Za-z0-9_]+\(_timer\):/);
    expect(code).toContain("machine.Pin(4, machine.Pin.OUT).value(1)");
    expect(code).toContain("machine.Timer(0)");
    expect(code).toContain("mode=machine.Timer.PERIODIC");
    expect(code).toMatch(/hardware_timer_0_[A-Za-z0-9_]+\.init\(period=int\(1000\)/);
  });

  it("registers a BLE GATT service and sends notifications", () => {
    const service = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
    const characteristic = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";
    const code = generate([
      {
        type: "hardware_ble_gatt_start",
        inputs: { NAME: text("VP"), SERVICE: text(service), CHARACTERISTIC: text(characteristic) },
      },
      { type: "hardware_ble_gatt_notify", inputs: { MESSAGE: text("hello") } },
    ], "esp32-s3");

    expect(code).toContain("import bluetooth");
    expect(code).toContain("_ble_conn = None");
    expect(code).toContain("def hardware_ble_gatt_start(name, service_uuid, characteristic_uuid):");
    expect(code).toContain("((_ble_handle,),) = _ble.gatts_register_services((service,))");
    expect(code).toContain("_ble.gap_advertise(200000, adv_data=");
    expect(code).toContain("connectable=True");
    expect(code).toContain("def hardware_ble_gatt_notify(message):");
    expect(code).toContain("_ble.gatts_notify(_ble_conn, _ble_handle, str(message).encode())");
    expect(code).toContain(`hardware_ble_gatt_start('VP', '${service}', '${characteristic}')`);
    expect(code).toContain("hardware_ble_gatt_notify('hello')");
  });

  it("validates timer periods, timer count and GATT UUIDs", () => {
    const timer = loadWorkspace([{
      type: "hardware_timer_every",
      inputs: { PERIOD: number(0) },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(timer, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「定时器」积木：周期必须是 1–3600000 之间的整数毫秒",
    ]);
    timer.dispose();

    const many = loadWorkspace(Array.from({ length: 5 }, () => ({
      type: "hardware_timer_every",
      inputs: { PERIOD: number(500) },
    })), "esp32-s3");
    const countIssues = collectHardwareBlockIssues(many, "esp32-s3");
    expect(countIssues).toHaveLength(5);
    expect(countIssues[0].message).toBe("「定时器」积木：最多同时使用 4 个定时器（当前 5 个）");
    many.dispose();

    const gatt = loadWorkspace([{
      type: "hardware_ble_gatt_start",
      inputs: { NAME: text("这个设备名字远远超过二十个字节"), SERVICE: text("not-a-uuid"), CHARACTERISTIC: text("6E400003-B5A3-F393-E0A9-E50E24DCCA9E") },
    }], "esp32-s3");
    expect(collectHardwareBlockIssues(gatt, "esp32-s3").map((issue) => issue.message)).toEqual([
      "「开启 BLE GATT 服务」积木：设备名不能超过 20 字节",
      "「开启 BLE GATT 服务」积木：服务 UUID 格式无效",
    ]);
    gatt.dispose();
  });

  it("offers S3 defaults for the timer and GATT blocks", () => {
    const contents = hardwareToolboxContents("esp32-s3");
    const block = (type: string) => contents.find((item) => (item as { type?: string }).type === type) as {
      inputs?: Record<string, { shadow?: { fields?: Record<string, unknown> } }>;
    } | undefined;

    expect(block("hardware_timer_every")?.inputs?.PERIOD?.shadow?.fields?.NUM).toBe(500);
    expect(block("hardware_ble_gatt_start")?.inputs?.SERVICE?.shadow?.fields?.TEXT).toBe("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
    expect(block("hardware_ble_gatt_notify")?.inputs?.MESSAGE?.shadow?.fields?.TEXT).toBe("hello");
  });
});
