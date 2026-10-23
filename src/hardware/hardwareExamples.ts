import type { HardwareBoardId } from "./firmwareCatalog";

/** 硬件示例的分类顺序；每块板卡只显示自己有例子的分类。 */
export const hardwareExampleCategories = ["基础", "串口", "传感器", "执行器", "灯光"] as const;
export type HardwareExampleCategory = (typeof hardwareExampleCategories)[number];

type BlockState = {
  type: string;
  fields?: Record<string, string | number>;
  inputs?: Record<string, unknown>;
  next?: { block: BlockState };
};

/** 把顺序语句串成 Blockly 的 next 链。 */
const chain = (blocks: BlockState[]): BlockState | undefined => {
  let next: BlockState | undefined;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    next = { ...blocks[index], ...(next ? { next: { block: next } } : {}) };
  }
  return next;
};

const numberShadow = (value: number) => ({ shadow: { type: "math_number", fields: { NUM: value } } });
const textBlock = (value: string) => ({ block: { type: "text", fields: { TEXT: value } } });
const forever = (...blocks: BlockState[]): BlockState => ({ type: "hardware_forever", inputs: { BODY: { block: chain(blocks)! } } });
const print = (value: BlockState | string): BlockState => ({ type: "python_print", inputs: { VALUE: typeof value === "string" ? textBlock(value) : { block: value } } });
const sleep = (milliseconds: number): BlockState => ({ type: "hardware_sleep_ms", inputs: { MS: numberShadow(milliseconds) } });
const builtinLed = (state: "on" | "off"): BlockState => ({ type: "hardware_builtin_led", fields: { STATE: state } });
const onboardRgb = (color: string): BlockState => ({ type: "hardware_onboard_rgb", fields: { COLOR: color } });
const pwm = (pin: string, frequency: number, duty: number): BlockState => ({
  type: "hardware_pwm_write",
  fields: { PIN: pin },
  inputs: { FREQ: numberShadow(frequency), DUTY: numberShadow(duty) },
});
const touchRead = (pin: string): BlockState => ({ type: "hardware_touch_read", fields: { PIN: pin } });
const temperatureRead = (): BlockState => ({ type: "hardware_mcu_temperature" });
const analogRead = (pin: string): BlockState => ({ type: "hardware_analog_read", fields: { PIN: pin } });

const workspace = (topLevel: BlockState[]): object => ({ blocks: { languageVersion: 0, blocks: topLevel } });

export type HardwareExample = {
  id: string;
  boardId: HardwareBoardId;
  category: HardwareExampleCategory;
  /** 加载后的工程名（不含扩展名）。 */
  projectName: string;
  title: string;
  description: string;
  /** Blockly 序列化工作区；加载后停留在图形化模式。 */
  workspace: object;
};

const heartbeat = (boardLabel: string): HardwareExample["workspace"] =>
  workspace([forever(print(`${boardLabel} ready`), sleep(1000))]);

const blink = (activeLow: boolean): HardwareExample["workspace"] => {
  const on = activeLow ? "off" : "on";
  const off = activeLow ? "on" : "off";
  return workspace([forever(builtinLed(on), sleep(500), builtinLed(off), sleep(500))]);
};

const pwmExample = (pin: string): HardwareExample["workspace"] =>
  workspace([forever(pwm(pin, 1000, 0), sleep(400), pwm(pin, 1000, 1023), sleep(400))]);

export const hardwareExamples: HardwareExample[] = [
  {
    id: "esp32-s3-serial-heartbeat",
    boardId: "esp32-s3",
    category: "串口",
    projectName: "s3-serial-heartbeat",
    title: "串口心跳",
    description: "每秒在输出面板打印一次 S3 ready。",
    workspace: heartbeat("ESP32-S3"),
  },
  {
    id: "esp32-s3-rgb-cycle",
    boardId: "esp32-s3",
    category: "灯光",
    projectName: "s3-rgb-cycle",
    title: "板载 RGB 循环",
    description: "用 GPIO48 的 WS2812 依次显示红、绿、蓝、黄。",
    workspace: workspace([forever(
      onboardRgb("red"), sleep(500),
      onboardRgb("green"), sleep(500),
      onboardRgb("blue"), sleep(500),
      onboardRgb("yellow"), sleep(500),
    )]),
  },
  {
    id: "esp32-s3-touch-read",
    boardId: "esp32-s3",
    category: "传感器",
    projectName: "s3-touch-read",
    title: "读取触摸引脚",
    description: "读取 GPIO1 触摸值并打印；手指靠近时数值会明显变化。",
    workspace: workspace([forever(print(touchRead("1")), sleep(500))]),
  },
  {
    id: "esp32-s3-pwm-output",
    boardId: "esp32-s3",
    category: "执行器",
    projectName: "s3-pwm-output",
    title: "PWM 输出",
    description: "在 GPIO4 上以 1 kHz 输出，占空比在高/低之间切换。",
    workspace: pwmExample("4"),
  },
  {
    id: "esp32-wroom-serial-heartbeat",
    boardId: "esp32-wroom",
    category: "串口",
    projectName: "wroom-serial-heartbeat",
    title: "串口心跳",
    description: "每秒在输出面板打印一次 WROOM ready。",
    workspace: heartbeat("ESP32-WROOM"),
  },
  {
    id: "esp32-wroom-led-blink",
    boardId: "esp32-wroom",
    category: "基础",
    projectName: "wroom-led-blink",
    title: "板载 LED 闪烁",
    description: "让 GPIO2 上的板载 LED 以 1 秒周期闪烁。",
    workspace: blink(false),
  },
  {
    id: "esp32-wroom-temperature",
    boardId: "esp32-wroom",
    category: "传感器",
    projectName: "wroom-temperature",
    title: "读取芯片温度",
    description: "每秒打印一次芯片内部温度。",
    workspace: workspace([forever(print(temperatureRead()), sleep(1000))]),
  },
  {
    id: "esp32-wroom-pwm-output",
    boardId: "esp32-wroom",
    category: "执行器",
    projectName: "wroom-pwm-output",
    title: "PWM 输出",
    description: "在 GPIO5 上以 1 kHz 输出，占空比在高/低之间切换。",
    workspace: pwmExample("5"),
  },
  {
    id: "esp8266-serial-heartbeat",
    boardId: "esp8266-esp12e",
    category: "串口",
    projectName: "esp8266-serial-heartbeat",
    title: "串口心跳",
    description: "每秒在输出面板打印一次 ESP8266 ready。",
    workspace: heartbeat("ESP8266"),
  },
  {
    id: "esp8266-led-blink",
    boardId: "esp8266-esp12e",
    category: "基础",
    projectName: "esp8266-led-blink",
    title: "板载 LED 闪烁",
    description: "GPIO2 板载 LED 为低电平点亮，按 1 秒周期闪烁。",
    workspace: blink(true),
  },
  {
    id: "esp8266-analog-read",
    boardId: "esp8266-esp12e",
    category: "传感器",
    projectName: "esp8266-analog-read",
    title: "读取 A0",
    description: "每秒打印一次 A0 的原始模拟值（0–1023）。",
    workspace: workspace([forever(print(analogRead("A0")), sleep(1000))]),
  },
  {
    id: "esp8266-pwm-output",
    boardId: "esp8266-esp12e",
    category: "执行器",
    projectName: "esp8266-pwm-output",
    title: "PWM 输出",
    description: "在 GPIO5（D1）上以 1 kHz 输出，占空比在高/低之间切换。",
    workspace: pwmExample("5"),
  },
];

export const hardwareExamplesForBoard = (boardId: HardwareBoardId): HardwareExample[] =>
  hardwareExamples.filter((example) => example.boardId === boardId);

export type HardwareExampleGroup = {
  category: HardwareExampleCategory;
  examples: HardwareExample[];
};

/** 按固定分类顺序分组，空分类不显示。 */
export const hardwareExampleGroups = (boardId: HardwareBoardId): HardwareExampleGroup[] =>
  hardwareExampleCategories.map((category) => ({
    category,
    examples: hardwareExamples.filter((example) => example.boardId === boardId && example.category === category),
  })).filter((group) => group.examples.length > 0);
