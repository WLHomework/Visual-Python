import { describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import "blockly/blocks";
import { pythonGenerator } from "blockly/python";
import "../pythonBlocks";
import { registerHardwareBlocks, setActiveHardwareBoard } from "./hardwareBlocks";
import { MicroPythonConversionError, micropythonToWorkspace } from "./micropythonToBlocks";

registerHardwareBlocks();

const load = (source: string) => {
  setActiveHardwareBoard("esp32-wroom");
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(micropythonToWorkspace(source, "esp32-wroom") as Parameters<typeof Blockly.serialization.workspaces.load>[0], workspace);
  return workspace;
};

describe("MicroPython to blocks", () => {
  it("converts Pin variables, pin writes and sleeps into a forever tree", () => {
    const workspace = load(`from machine import Pin
import time

led = Pin(2, Pin.OUT)
while True:
  led.value(1)
  time.sleep(0.5)
  led.value(0)
  time.sleep_ms(500)
`);
    const root = workspace.getTopBlocks(false)[0];
    expect(root?.type).toBe("hardware_forever");
    expect(root?.getInput("BODY")?.connection?.targetBlock()?.type).toBe("hardware_pin_write");
    expect(root?.getInput("BODY")?.connection?.targetBlock()?.getFieldValue("PIN")).toBe("2");
    expect(root?.getInput("BODY")?.connection?.targetBlock()?.getFieldValue("LEVEL")).toBe("1");
    expect(pythonGenerator.workspaceToCode(workspace)).toContain("time.sleep_ms(500)");
    workspace.dispose();
  });

  it("converts PWM setup and duty_u16 into a PWM block", () => {
    const workspace = load(`from machine import Pin, PWM
import time
pwm = PWM(Pin(2), freq=1000)
while True:
  pwm.duty_u16(32768)
  time.sleep(0.5)
`);
    const root = workspace.getTopBlocks(false)[0];
    const body = root?.getInput("BODY")?.connection?.targetBlock();
    expect(body?.type).toBe("hardware_pwm_write");
    expect(body?.getFieldValue("PIN")).toBe("2");
    const generated = pythonGenerator.workspaceToCode(workspace);
    expect(generated).toContain("hardware_set_pwm(2, 1000, 512)");
    workspace.dispose();
  });

  it("converts the generated hardware_set_pwm helper", () => {
    const workspace = load("hardware_set_pwm(4, 2000, 300)\n");
    const root = workspace.getTopBlocks(false)[0];
    expect(root?.type).toBe("hardware_pwm_write");
    expect(root?.getFieldValue("PIN")).toBe("4");
    workspace.dispose();
  });

  it("converts NeoPixel init, pixel, fill and write", () => {
    const workspace = load(`import neopixel
from machine import Pin
np = neopixel.NeoPixel(Pin(4), 8)
np[0] = (255, 0, 0)
np.fill((0, 0, 255))
np.write()
`);
    const root = workspace.getTopBlocks(false)[0];
    expect(root?.type).toBe("hardware_neopixel_init");
    expect(root?.getFieldValue("PIN")).toBe("4");
    const pixel = root?.getNextBlock();
    expect(pixel?.type).toBe("hardware_neopixel_set_pixel");
    expect(pixel?.getNextBlock()?.type).toBe("hardware_neopixel_fill");
    expect(pixel?.getNextBlock()?.getNextBlock()?.type).toBe("hardware_neopixel_write");
    workspace.dispose();
  });

  it("rejects NeoPixel operations on unknown variables", () => {
    expect(() => micropythonToWorkspace("np.write()\n", "esp32-wroom")).toThrow(MicroPythonConversionError);
  });

  it("rejects Manim programs with a cross-workbench error", () => {
    expect(() => micropythonToWorkspace("from manim import *\n\nclass S(Scene):\n    def construct(self):\n        self.play(Create(Circle()))\n", "esp32-s3"))
      .toThrow(/Manim.*硬件工作台|硬件工作台.*Manim/);
  });

  it("recognizes NeoPixel init when the Pin carries a mode argument", () => {
    const workspace = load(`import neopixel
from machine import Pin
np = neopixel.NeoPixel(Pin(4, Pin.OUT), 8)
np[0] = (255, 0, 0)
np.write()
`);
    const root = workspace.getTopBlocks(false)[0];
    expect(root?.type).toBe("hardware_neopixel_init");
    expect(root?.getFieldValue("PIN")).toBe("4");
    expect(root?.getNextBlock()?.type).toBe("hardware_neopixel_set_pixel");
    workspace.dispose();
  });

  it("accepts a numeric step in for-range loops", () => {
    const workspace = load(`from machine import Pin
led = Pin(2, Pin.OUT)
for i in range(0, 10, 2):
  led.value(1)
`);
    const root = workspace.getTopBlocks(false)[0];
    expect(root?.type).toBe("controls_repeat_ext");
    expect(root?.getInput("TIMES")?.connection?.targetBlock()?.getFieldValue("NUM")).toBe(5);
    workspace.dispose();
  });

  it("maps DHT reads into a value block and print statement", () => {
    const workspace = load(`import dht
from machine import Pin
sensor = dht.DHT22(Pin(4))
while True:
  sensor.measure()
  print("Temp", sensor.temperature())
  time.sleep(2)
`);
    const root = workspace.getTopBlocks(false)[0];
    const printBlock = root?.getInput("BODY")?.connection?.targetBlock();
    expect(printBlock?.type).toBe("python_print_many");
    expect(printBlock?.getInput("ITEM0")?.connection?.targetBlock()?.type).toBe("text");
    expect(printBlock?.getInput("ITEM1")?.connection?.targetBlock()?.type).toBe("hardware_dht_temperature");
    const generated = pythonGenerator.workspaceToCode(workspace);
    expect(generated).toContain("hardware_dht_read(4, dht.DHT22)[0]");
    expect(generated).toContain("print(");
    workspace.dispose();
  });

  it("maps ADC reads through a stored variable into print", () => {
    const workspace = load(`import machine
adc = machine.ADC(machine.Pin(34))
value = adc.read()
print(value)
`);
    const printBlock = workspace.getTopBlocks(false)[0];
    expect(printBlock?.type).toBe("python_print");
    expect(printBlock?.getInput("VALUE")?.connection?.targetBlock()?.type).toBe("hardware_analog_read");
    expect(pythonGenerator.workspaceToCode(workspace)).toContain("machine.ADC(machine.Pin(34)).read()");
    workspace.dispose();
  });

  it("maps OLED init, clear, text and refresh", () => {
    const workspace = load(`import ssd1306
_oled_i2c = hardware_i2c()
_oled = ssd1306.SSD1306_I2C(128, 64, _oled_i2c, addr=0x3C)
_oled.fill(0)
_oled.text("Hello", 0, 0)
_oled.show()
`);
    const root = workspace.getTopBlocks(false)[0];
    expect(root?.type).toBe("hardware_oled_init");
    expect(root?.getFieldValue("ADDRESS")).toBe("0x3C");
    expect(root?.getNextBlock()?.type).toBe("hardware_oled_clear");
    expect(root?.getNextBlock()?.getNextBlock()?.type).toBe("hardware_oled_text");
    expect(root?.getNextBlock()?.getNextBlock()?.getNextBlock()?.type).toBe("hardware_oled_write");
    expect(pythonGenerator.workspaceToCode(workspace)).toContain("_oled.text(str('Hello'), int(0), int(0), 1)");
    workspace.dispose();
  });

  it("maps a DHT value into OLED text", () => {
    const workspace = load(`import dht
from machine import Pin
_oled_i2c = hardware_i2c()
_oled = ssd1306.SSD1306_I2C(128, 64, _oled_i2c)
sensor = dht.DHT22(Pin(4))
_oled.text(str(sensor.temperature()), 0, 0)
`);
    const textBlock = workspace.getAllBlocks(false).find((block) => block.type === "hardware_oled_text");
    expect(textBlock?.getInput("TEXT")?.connection?.targetBlock()?.type).toBe("hardware_dht_temperature");
    workspace.dispose();
  });

  it("maps servo angle commands", () => {
    const workspace = load(`from machine import Pin, PWM
servo = PWM(Pin(2), freq=50)
servo.angle(90)
servo.write(45)
`);
    const root = workspace.getTopBlocks(false)[0];
    expect(root?.type).toBe("hardware_servo_write");
    expect(root?.getFieldValue("PIN")).toBe("2");
    expect(root?.getNextBlock()?.type).toBe("hardware_servo_write");
    workspace.dispose();
  });

  it("maps concatenated DHT values into OLED text", () => {
    const workspace = load(`import machine
import dht
import ssd1306
i2c = machine.I2C(0)
oled = ssd1306.SSD1306_I2C(128, 64, i2c, addr=0x3C)
sensor = dht.DHT22(machine.Pin(4))
while True:
  oled.fill(0)
  oled.text("Temp: " + str(sensor.temperature()) + " C", 0, 0)
  oled.show()
  time.sleep_ms(2000)
`);
    const textBlock = workspace.getAllBlocks(false).find((block) => block.type === "hardware_oled_text");
    expect(textBlock?.getInput("TEXT")?.connection?.targetBlock()?.type).toBe("text_join");
    expect(pythonGenerator.workspaceToCode(workspace)).toContain("hardware_dht_read(4, dht.DHT22)[0]");
    workspace.dispose();
  });

  it("maps generated hardware_dht_read helper expressions back to DHT blocks", () => {
    const workspace = load(`_oled = ssd1306.SSD1306_I2C(128, 64, _oled_i2c, addr=0x3C)
_oled.text("Temp(C): " + str(hardware_dht_read(4, dht.DHT22)[0]), 0, 0, 1)
`);
    const textBlock = workspace.getAllBlocks(false).find((block) => block.type === "hardware_oled_text");
    const join = textBlock?.getInput("TEXT")?.connection?.targetBlock();
    expect(join?.type).toBe("text_join");
    expect(join?.getInput("ADD1")?.connection?.targetBlock()?.type).toBe("hardware_dht_temperature");
    workspace.dispose();
  });

  it("supports direct machine.Pin writes", () => {
    const workspace = load(`from machine import Pin
machine.Pin(4, machine.Pin.OUT).value(0)
`);
    const root = workspace.getTopBlocks(false)[0];
    expect(root?.type).toBe("hardware_pin_write");
    expect(root?.getFieldValue("PIN")).toBe("4");
    expect(root?.getFieldValue("LEVEL")).toBe("0");
    workspace.dispose();
  });

  it("keeps unsupported single-line statements as raw statements", () => {
    const workspace = load("foo()\n");
    expect(workspace.getTopBlocks(false)[0]?.type).toBe("python_raw_statement");
    workspace.dispose();
  });

  it("compiles a literal range for loop into repeat", () => {
    const workspace = load(`from machine import Pin
led = Pin(2, Pin.OUT)
for _ in range(3):
  led.value(1)
  led.value(0)
`);
    const root = workspace.getTopBlocks(false)[0];
    expect(root?.type).toBe("controls_repeat_ext");
    expect(pythonGenerator.workspaceToCode(workspace)).toContain("for count");
    workspace.dispose();
  });

  it("compiles an if/else condition into controls_if", () => {
    const workspace = load(`from machine import Pin
import time
led = Pin(2, Pin.OUT)
while True:
  if machine.Pin(4).value():
    led.value(1)
  else:
    led.value(0)
  time.sleep_ms(100)
`);
    const root = workspace.getTopBlocks(false)[0];
    const branch = root?.getInput("BODY")?.connection?.targetBlock();
    expect(branch?.type).toBe("controls_if");
    expect(branch?.getInput("IF0")?.connection?.targetBlock()?.type).toBe("hardware_pin_read");
    expect(pythonGenerator.workspaceToCode(workspace)).toContain("if ");
    workspace.dispose();
  });

  it("rejects unsupported elif with a line number", () => {
    expect(() => micropythonToWorkspace(`while True:
  if True:
    print('a')
  elif False:
    print('b')
`, "esp32-wroom")).toThrow(MicroPythonConversionError);
    try {
      micropythonToWorkspace("while True:\n  if True:\n    print('a')\n  elif False:\n    print('b')\n", "esp32-wroom");
    } catch (error) {
      expect((error as MicroPythonConversionError).message).toContain("第 4 行");
    }
  });
});
