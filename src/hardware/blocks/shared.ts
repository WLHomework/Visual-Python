import * as Blockly from "blockly/core";
import { pythonGenerator } from "blockly/python";
import { Order } from "blockly/python";
import { localizeBlockDefinitions } from "../../blockDisplayLocalization";
import {
  boardPinChoices,
  getBoardProfile,
  validateBoardPin,
  type BoardProfile,
  type HardwarePinUse,
} from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";

export const hardwareToolboxCategoryName = "硬件";

const hardwareToolboxShortNames: Record<HardwareBoardId, string> = {
  "esp32-wroom": "ESP32",
  "esp8266-esp12e": "ESP8266",
  "esp32-s3": "ESP32-S3",
};

export function hardwareToolboxCategoryLabel(boardId?: HardwareBoardId): string {
  const profile = getBoardProfile(boardId);
  if (!profile) return hardwareToolboxCategoryName;
  return `${hardwareToolboxShortNames[profile.boardId] ?? profile.displayName} 硬件`;
}

export function isHardwareToolboxCategoryName(name: unknown): boolean {
  return name === hardwareToolboxCategoryName || (typeof name === "string" && name.endsWith(" 硬件"));
}

export const hardwareColours = {
  // 每个分类一种颜色：分类色条与积木同色，15 个分类互不重复（见 toolboxes/esp32-s3.test.ts）。
  pin: "#9e2f3f",
  pwm: "#9e5018",
  sensor: "#3f7a3f",
  light: "#b8912f",
  display: "#4a5568",
  board: "#2f9e8f",
  loop: "#4b9b62",
  // 与 Python 界面的数学积木同色（见 pythonBlocks.ts 的 blockStyles.math_blocks）。
  math: "#4f72b8",
};

export const pinUseByBlockType: Record<string, HardwarePinUse> = {
  hardware_pin_write: "digital-output",
  hardware_pin_read: "digital-input",
  hardware_pwm_write: "pwm",
  hardware_servo_write: "pwm",
  hardware_tone: "pwm",
  hardware_analog_read: "analog",
  hardware_touch_read: "touch",
  hardware_neopixel_init: "digital-output",
  hardware_dht_temperature: "digital-input",
  hardware_dht_humidity: "digital-input",
};

export const pinUseByBlockField: Record<string, Record<string, HardwarePinUse>> = {
  hardware_ultrasonic_distance: {
    TRIGGER: "digital-output",
    ECHO: "digital-input",
  },
  hardware_uart_init: {
    TX: "digital-output",
    RX: "digital-input",
  },
};

export const hardwareBlockLabels: Record<string, string> = {
  hardware_servo_write: "舵机角度",
  hardware_tone: "音调",
  hardware_pin_write: "设置数字引脚",
  hardware_pin_read: "读取数字引脚",
  hardware_pwm_write: "设置 PWM 输出",
  hardware_analog_read: "读取模拟输入",
  hardware_touch_read: "触摸读数",
  hardware_builtin_led: "板载 LED",
  hardware_onboard_rgb: "板载 RGB 灯",
  hardware_neopixel_init: "初始化 NeoPixel",
  hardware_neopixel_set_pixel: "设置 NeoPixel 颜色",
  hardware_neopixel_clear: "清空 NeoPixel",
  hardware_neopixel_write: "刷新 NeoPixel",
  hardware_dht_temperature: "读取 DHT 温度",
  hardware_dht_humidity: "读取 DHT 湿度",
  hardware_ultrasonic_distance: "超声波测距",
  hardware_oled_init: "初始化 OLED",
  hardware_oled_clear: "清空 OLED 画面",
  hardware_oled_text: "OLED 显示文字",
  hardware_oled_pixel: "OLED 像素",
  hardware_oled_write: "刷新 OLED 显示",
  hardware_uart_init: "初始化串口",
  hardware_uart_write: "串口发送",
  hardware_uart_read: "串口读取",
  hardware_mcu_temperature: "芯片温度",
  hardware_sleep_ms: "等待毫秒",
  hardware_forever: "永远重复",
  hardware_ticks_ms: "毫秒计时器",
  hardware_ticks_diff: "计时差值",
  hardware_reset: "重启开发板",
  hardware_deepsleep: "深度睡眠",
  hardware_map_range: "数值映射",
};

export const hardwareBlockTypes: readonly string[] = Object.keys(hardwareBlockLabels);

export type HardwareBlockIssue = { blockId?: string; message: string };

export function isHardwareBlockType(type: string): boolean {
  return Boolean(hardwareBlockLabels[type]);
}

let activeBoard: BoardProfile | undefined;

export function setActiveHardwareBoard(boardId: HardwareBoardId | undefined): BoardProfile | undefined {
  activeBoard = getBoardProfile(boardId);
  return activeBoard;
}

export function getActiveHardwareBoard(): BoardProfile | undefined {
  return activeBoard;
}

const pinFieldOptions = (use: HardwarePinUse): Array<[string, string]> => {
  const choices = boardPinChoices(activeBoard, use);
  if (choices.length === 0) return [["（请先选择硬件板卡）", ""]];
  return choices.map((pin) => [pin.label, pin.id] as [string, string]);
};

function applyBoardPinOptions(block: Blockly.Block): boolean {
  const uses = pinUsesForBlock(block);
  let updated = false;
  for (const { fieldName, use } of uses) {
    const field = block.getField(fieldName) as Blockly.FieldDropdown | null;
    if (!field) continue;
    const options = pinFieldOptions(use);
    field.setOptions(options);
    const values = options.map((option) => option[1]);
    if (!values.includes(String(field.getValue() ?? ""))) field.setValue(values[0]);
    updated = true;
  }
  return updated;
}

export function pinUsesForBlock(block: Blockly.Block): Array<{ fieldName: string; use: HardwarePinUse }> {
  const fields = pinUseByBlockField[block.type];
  if (fields) return Object.entries(fields).map(([fieldName, use]) => ({ fieldName, use }));
  const use = pinUseByBlockType[block.type];
  return use ? [{ fieldName: "PIN", use }] : [];
}

export function registerHardwareBoardPinExtension(): void {
  Blockly.Extensions.register("hardware_board_pin", function (this: Blockly.Block) {
    applyBoardPinOptions(this);
  });
}

export function refreshHardwareBlocks(workspace: Blockly.Workspace): number {
  let updated = 0;
  for (const block of workspace.getAllBlocks(false)) {
    if (applyBoardPinOptions(block)) updated += 1;
  }
  return updated;
}

export function countIncompatiblePins(workspace: Blockly.Workspace | null | undefined, boardId: HardwareBoardId): number {
  const profile = getBoardProfile(boardId);
  if (!workspace || !profile) return 0;
  let count = 0;
  for (const block of workspace.getAllBlocks(false)) {
    const uses = pinUsesForBlock(block);
    if (uses.some(({ fieldName, use }) => !boardPinChoices(profile, use).some((pin) => pin.id === String(block.getFieldValue(fieldName) ?? "")))) {
      count += 1;
    }
  }
  return count;
}

interface HardwareGeneratorInternals {
  definitions_: Record<string, string>;
  INDENT: string;
  FUNCTION_NAME_PLACEHOLDER_: string;
  provideFunction_(name: string, code: string[]): string;
}

const hardwareInternals = () => pythonGenerator as unknown as HardwareGeneratorInternals;

export const ensureImport = (moduleName: string) => {
  hardwareInternals().definitions_[`import_${moduleName}`] = `import ${moduleName}`;
};

export const unavailable = (reason: string) => `# 硬件积木未生成代码：${reason}\n`;

export const ensurePwmHelper = (): string => {
  const internals = hardwareInternals();
  internals.definitions_.hardware_pwm_channels = "_pwm_channels = {}";
  return internals.provideFunction_("hardware_set_pwm", [
    `def ${internals.FUNCTION_NAME_PLACEHOLDER_}(pin, freq, duty):`,
    "  pwm = _pwm_channels.get(pin)",
    "  if pwm is None:",
    "    pwm = machine.PWM(machine.Pin(pin), freq=freq, duty=duty)",
    "    _pwm_channels[pin] = pwm",
    "  else:",
    "    pwm.freq(freq)",
    "    pwm.duty(duty)",
  ]);
};

export const ensureDhtHelper = (): string => {
  const internals = hardwareInternals();
  return internals.provideFunction_("hardware_dht_read", [
    `def ${internals.FUNCTION_NAME_PLACEHOLDER_}(pin, sensor_type):`,
    "  sensor = sensor_type(machine.Pin(pin))",
    "  try:",
    "    sensor.measure()",
    "    return sensor.temperature(), sensor.humidity()",
    "  except OSError:",
    "    return None, None",
  ]);
};

export const ensureUartReadLineHelper = (): string => {
  const internals = hardwareInternals();
  return internals.provideFunction_("hardware_uart_readline", [
    `def ${internals.FUNCTION_NAME_PLACEHOLDER_}():`,
    "  data = _uart.readline()",
    '  return data.decode() if data else ""',
  ]);
};

export const ensureUartReadAllHelper = (): string => {
  const internals = hardwareInternals();
  return internals.provideFunction_("hardware_uart_readall", [
    `def ${internals.FUNCTION_NAME_PLACEHOLDER_}():`,
    "  data = _uart.read()",
    '  return data.decode() if data else ""',
  ]);
};

export type PinTarget = { profile: BoardProfile; pinId: string };

export const pinTarget = (block: Blockly.Block, use: HardwarePinUse): PinTarget | string => {
  return pinTargetField(block, use, "PIN");
};

export const pinTargetField = (block: Blockly.Block, use: HardwarePinUse, fieldName: string): PinTarget | string => {
  const profile = getActiveHardwareBoard();
  if (!profile) return unavailable("请先选择硬件板卡");
  const pinId = String(block.getFieldValue(fieldName) ?? "");
  const problem = validateBoardPin(profile, use, pinId);
  if (problem) return unavailable(problem);
  return { profile, pinId };
};

export function defineHardwareBlocks(definitions: unknown[]): void {
  Blockly.common.defineBlocksWithJsonArray(localizeBlockDefinitions(definitions as never));
}

export const hardwareSectionLabel = (text: string) =>
  ({ kind: "label", text, "web-class": "python-standard-library-label" }) as unknown as Blockly.utils.toolbox.FlyoutItemInfo;

export const numberShadow = (value: number) => ({ shadow: { type: "math_number", fields: { NUM: value } } });
export const numericInputValue = (block: Blockly.Block, inputName: string): number | undefined => {
  const target = block.getInputTargetBlock(inputName);
  if (!target || target.type !== "math_number") return undefined;
  const value = Number(target.getFieldValue("NUM"));
  return Number.isFinite(value) ? value : undefined;
};
export const pythonOrder = Order;
export const hardwareGenerator = pythonGenerator;
export const hardwareGeneratorIndent = () => hardwareInternals().INDENT;
