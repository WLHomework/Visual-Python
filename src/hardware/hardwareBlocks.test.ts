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
    expect(setup).toContain("_uart.write(str('Hello'))");
    expect(setup.match(/import machine/g)).toHaveLength(1);

    const line = generate([{ type: "hardware_uart_read", fields: { MODE: "line" } }], "esp32-s3");
    expect(line).toContain("def hardware_uart_readline():");
    expect(line).toContain("data = _uart.readline()");
    expect(line).toContain("hardware_uart_readline()");

    const all = generate([{ type: "hardware_uart_read", fields: { MODE: "all" } }], "esp32-s3");
    expect(all).toContain("def hardware_uart_readall():");
    expect(all).toContain("data = _uart.read()");
    expect(all).toContain("hardware_uart_readall()");
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
    expect(code).toContain('_oled_i2c = globals().get("_i2c")');
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

  it("generates I2C init, scan, register write and read", () => {
    const wroom = generate([chain(
      { type: "hardware_i2c_init", fields: { SDA: "21", SCL: "22" } },
      { type: "hardware_i2c_write_register", inputs: { ADDRESS: number(0x3C), REGISTER: number(0x10), DATA: number(0xAB) } },
    )], "esp32-wroom");

    expect(wroom).toContain("import machine");
    expect(wroom).toContain("_i2c = machine.I2C(0, scl=machine.Pin(22), sda=machine.Pin(21), freq=400000)");
    expect(wroom).toContain("_i2c.writeto_mem(int(60), int(16), bytes([int(171) & 0xFF]))");

    const read = generate([{ type: "hardware_i2c_read_register", inputs: { ADDRESS: number(0x3C), REGISTER: number(0) } }], "esp32-s3");
    expect(read).toContain("_i2c.readfrom_mem(int(60), int(0), 1)[0]");

    const scan = generate([{ type: "hardware_i2c_scan" }], "esp32-s3");
    expect(scan).toContain("_i2c.scan()");

    const esp8266 = generate([{ type: "hardware_i2c_init", fields: { SDA: "4", SCL: "5" } }], "esp8266-esp12e");
    expect(esp8266).toContain("machine.I2C(scl=machine.Pin(5), sda=machine.Pin(4), freq=100000)");
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
    expect(wroom).toContain("_wlan = network.WLAN(network.STA_IF)");
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
