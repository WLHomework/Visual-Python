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

export const hardwareColours = {
  // 每个分类一种颜色：分类色条与积木同色，所有分类互不重复（见 toolboxes/esp32-s3.test.ts）。
  pin: "#9e2f3f",
  pwm: "#9e5018",
  sensor: "#3f7a3f",
  light: "#b8912f",
  display: "#4a5568",
  board: "#2f9e8f",
  communication: "#1f6f7f",
  network: "#5f6b2f",
  storage: "#7a5c3a",
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
  hardware_button_read: "digital-input",
  hardware_pir_motion: "digital-input",
  hardware_light_percent: "analog",
  hardware_soil_percent: "analog",
  hardware_relay_set: "digital-output",
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
  hardware_i2c_init: {
    SDA: "digital-output",
    SCL: "digital-output",
  },
  hardware_dc_motor: {
    IN1: "digital-output",
    IN2: "digital-output",
    PWM: "pwm",
  },
  hardware_spi_init: {
    SCK: "digital-output",
    MOSI: "digital-output",
    MISO: "digital-input",
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
  hardware_neopixel_fill: "填充 NeoPixel",
  hardware_button_read: "读取按键",
  hardware_pir_motion: "PIR 人体感应",
  hardware_light_percent: "光敏百分比",
  hardware_soil_percent: "土壤湿度百分比",
  hardware_relay_set: "继电器开关",
  hardware_dc_motor: "直流电机",
  hardware_dht_temperature: "读取 DHT 温度",
  hardware_dht_humidity: "读取 DHT 湿度",
  hardware_ultrasonic_distance: "超声波测距",
  hardware_oled_init: "初始化 OLED",
  hardware_oled_clear: "清空 OLED 画面",
  hardware_oled_text: "OLED 显示文字",
  hardware_oled_pixel: "OLED 像素",
  hardware_oled_write: "刷新 OLED 显示",
  hardware_lcd1602_init: "初始化 LCD1602",
  hardware_lcd1602_text: "LCD1602 显示文字",
  hardware_lcd1602_clear: "清空 LCD1602",
  hardware_bh1750_lux: "BH1750 光照",
  hardware_uart_init: "初始化串口",
  hardware_uart_write: "串口发送",
  hardware_uart_read: "串口读取",
  hardware_uart_available: "串口可读字节数",
  hardware_uart_deinit: "关闭串口",
  hardware_i2c_init: "初始化 I2C",
  hardware_i2c_scan: "扫描 I2C 设备",
  hardware_i2c_write_register: "I2C 写寄存器",
  hardware_i2c_read_register: "I2C 读寄存器",
  hardware_i2c_deinit: "关闭 I2C",
  hardware_spi_init: "初始化 SPI",
  hardware_spi_transfer: "SPI 收发字节",
  hardware_spi_transfer_text: "SPI 收发文本",
  hardware_wifi_connect: "连接 Wi-Fi",
  hardware_wifi_wait: "等待 Wi-Fi 连接",
  hardware_wifi_disconnect: "断开 Wi-Fi",
  hardware_wifi_connected: "Wi-Fi 已连接",
  hardware_wifi_ip: "Wi-Fi IP 地址",
  hardware_wifi_ap_start: "开启 Wi-Fi 热点",
  hardware_wifi_ap_stop: "关闭 Wi-Fi 热点",
  hardware_wifi_ap_ip: "热点 IP 地址",
  hardware_wifi_rssi: "Wi-Fi 信号强度",
  hardware_http_get: "HTTP GET 请求",
  hardware_http_post: "HTTP POST 请求",
  hardware_ntp_sync: "NTP 校时",
  hardware_ntp_now: "设备当前时间",
  hardware_ntp_local: "设备本地时间",
  hardware_ble_start: "开启 BLE 广播",
  hardware_ble_stop: "停止 BLE 广播",
  hardware_espnow_init: "初始化 ESP-NOW",
  hardware_espnow_mac: "ESP-NOW 本机 MAC",
  hardware_espnow_send: "ESP-NOW 发送",
  hardware_espnow_receive: "接收 ESP-NOW 消息",
  hardware_espnow_last_mac: "最近 ESP-NOW 发送者",
  hardware_mqtt_connect: "连接 MQTT",
  hardware_mqtt_publish: "MQTT 发布",
  hardware_mqtt_subscribe: "MQTT 订阅",
  hardware_mqtt_wait: "等待 MQTT 消息",
  hardware_mqtt_last_topic: "最近 MQTT 主题",
  hardware_mqtt_disconnect: "断开 MQTT",
  hardware_file_write: "写入设备文件",
  hardware_file_append: "追加设备文件",
  hardware_file_read: "读取设备文件",
  hardware_file_exists: "设备文件存在",
  hardware_file_delete: "删除设备文件",
  hardware_file_list: "列出设备目录",
  hardware_nvs_set: "写入 NVS 键值",
  hardware_nvs_get: "读取 NVS 键值",
  hardware_nvs_delete: "删除 NVS 键值",
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

/** 只有 `BoardProfile.advancedWireless` 为 true 的板卡才生成这些积木。 */
export const advancedWirelessBlockTypes: readonly string[] = [
  "hardware_wifi_ap_start",
  "hardware_wifi_ap_stop",
  "hardware_wifi_ap_ip",
  "hardware_wifi_rssi",
  "hardware_http_get",
  "hardware_http_post",
  "hardware_ntp_sync",
  "hardware_ntp_now",
  "hardware_ntp_local",
  "hardware_ble_start",
  "hardware_ble_stop",
  "hardware_espnow_init",
  "hardware_espnow_mac",
  "hardware_espnow_send",
  "hardware_espnow_receive",
  "hardware_espnow_last_mac",
  "hardware_mqtt_connect",
  "hardware_mqtt_publish",
  "hardware_mqtt_subscribe",
  "hardware_mqtt_wait",
  "hardware_mqtt_last_topic",
  "hardware_mqtt_disconnect",
];

/** 只有 `BoardProfile.deviceStorage` 为 true 的板卡才生成这些积木。 */
export const deviceStorageBlockTypes: readonly string[] = [
  "hardware_file_write",
  "hardware_file_append",
  "hardware_file_read",
  "hardware_file_exists",
  "hardware_file_delete",
  "hardware_file_list",
  "hardware_nvs_set",
  "hardware_nvs_get",
  "hardware_nvs_delete",
];

/** 只有 `BoardProfile.spiIds` 非空的板卡才生成这些积木（目前仅 ESP32-S3）。 */
export const spiBlockTypes: readonly string[] = [
  "hardware_spi_init",
  "hardware_spi_transfer",
  "hardware_spi_transfer_text",
];

export type HardwareBlockIssue = { blockId?: string; message: string };

/** P0 模块积木：先只在具备 `p0Modules` 的板卡上开放（H1 输入/执行器 + H2 显示/传感器）。 */
export const p0ModuleBlockTypes: readonly string[] = [
  "hardware_button_read",
  "hardware_pir_motion",
  "hardware_light_percent",
  "hardware_soil_percent",
  "hardware_relay_set",
  "hardware_dc_motor",
  "hardware_neopixel_fill",
  "hardware_lcd1602_init",
  "hardware_lcd1602_text",
  "hardware_lcd1602_clear",
  "hardware_bh1750_lux",
];

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

/** 提供给积木模块定义 Python 辅助函数的入口，避免每个模块强转生成器内部类型。 */
export const hardwareFunctionPlaceholder = (): string => hardwareInternals().FUNCTION_NAME_PLACEHOLDER_;

export const provideHardwareFunction = (name: string, code: string[]): string => hardwareInternals().provideFunction_(name, code);

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

/** Wi-Fi 接口只创建一次：状态和 IP 积木即使没先运行连接积木也能安全使用。 */
export const ensureWlan = (): string => {
  ensureImport("network");
  // v1.29 起接口常量移到 WLAN 类上；旧的 network.STA_IF 在 ESP32/ESP8266 固件里已不存在。
  hardwareInternals().definitions_.hardware_wlan = "_wlan = network.WLAN(network.WLAN.IF_STA)";
  return "_wlan";
};

/** 热点接口只创建一次：热点 IP/关闭积木即使没先运行开启积木也能安全使用。 */
export const ensureWlanAp = (): string => {
  ensureImport("network");
  hardwareInternals().definitions_.hardware_wlan_ap = "_ap = network.WLAN(network.WLAN.IF_AP)";
  return "_ap";
};

/** 轮询等待连接，避免在积木里展开循环；超时后返回当前连接状态。 */
export const ensureWifiWaitHelper = (): string => {
  const internals = hardwareInternals();
  return internals.provideFunction_("hardware_wifi_wait", [
    `def ${internals.FUNCTION_NAME_PLACEHOLDER_}(timeout_ms):`,
    "  start = time.ticks_ms()",
    "  while not _wlan.isconnected() and time.ticks_diff(time.ticks_ms(), start) < timeout_ms:",
    "    time.sleep_ms(100)",
    "  return _wlan.isconnected()",
  ]);
};

export const ensureUartReadLineHelper = (): string => {
  const internals = hardwareInternals();
  return internals.provideFunction_("hardware_uart_readline", [
    `def ${internals.FUNCTION_NAME_PLACEHOLDER_}():`,
    '  uart = globals().get("_uart")',
    "  if uart is None:",
    '    return ""',
    "  data = uart.readline()",
    '  return data.decode() if data else ""',
  ]);
};

export const ensureUartReadAllHelper = (): string => {
  const internals = hardwareInternals();
  return internals.provideFunction_("hardware_uart_readall", [
    `def ${internals.FUNCTION_NAME_PLACEHOLDER_}():`,
    '  uart = globals().get("_uart")',
    "  if uart is None:",
    '    return ""',
    "  data = uart.read()",
    '  return data.decode() if data else ""',
  ]);
};

/** 串口在未初始化或已关闭时静默跳过，避免收尾代码里的发送积木抛异常。 */
export const ensureUartWriteHelper = (): string => {
  const internals = hardwareInternals();
  return internals.provideFunction_("hardware_uart_write_text", [
    `def ${internals.FUNCTION_NAME_PLACEHOLDER_}(text):`,
    '  uart = globals().get("_uart")',
    "  if uart is not None:",
    "    uart.write(str(text))",
  ]);
};

/** 返回可读字节数；未初始化或已关闭时按 0 处理，避免读空串口时抛异常。 */
export const ensureUartAvailableHelper = (): string => {
  const internals = hardwareInternals();
  return internals.provideFunction_("hardware_uart_available", [
    `def ${internals.FUNCTION_NAME_PLACEHOLDER_}():`,
    '  uart = globals().get("_uart")',
    "  return uart.any() if uart is not None else 0",
  ]);
};

/** 关闭串口并清空全局对象，之后重新「初始化串口」会创建新实例。 */
export const ensureUartDeinitHelper = (): string => {
  const internals = hardwareInternals();
  return internals.provideFunction_("hardware_uart_deinit", [
    `def ${internals.FUNCTION_NAME_PLACEHOLDER_}():`,
    '  uart = globals().get("_uart")',
    "  if uart is not None:",
    "    uart.deinit()",
    '    globals()["_uart"] = None',
  ]);
};

/** I²C 总线构造表达式：ESP8266 只有软件 I²C，ESP32 系列用硬件 I²C 0。 */
export const i2cBusExpression = (profile: BoardProfile, sda: string, scl: string): string => {
  if (profile.chipFamily === "esp8266") return `machine.I2C(scl=machine.Pin(${scl}), sda=machine.Pin(${sda}), freq=100000)`;
  return `machine.I2C(0, scl=machine.Pin(${scl}), sda=machine.Pin(${sda}), freq=400000)`;
};

/**
 * 生成变量和函数：所有 I2C 设备共用一条总线。
 *
 * 先运行「初始化 I2C」时直接复用已有的 `_i2c`；没有初始化时按板卡默认引脚懒创建。
 * 这样 OLED、传感器和寄存器积木无论以什么顺序拖入，都不会在同一组引脚上重复建总线。
 */
export const ensureI2cBus = (profile: BoardProfile): string => {
  ensureImport("machine");
  const internals = hardwareInternals();
  const bus = i2cBusExpression(profile, profile.defaultI2c.sda, profile.defaultI2c.scl);
  return internals.provideFunction_("hardware_i2c_bus", [
    `def ${internals.FUNCTION_NAME_PLACEHOLDER_}():`,
    '  bus = globals().get("_i2c")',
    "  if bus is None:",
    `    bus = ${bus}`,
    '    globals()["_i2c"] = bus',
    "  return bus",
  ]);
};

/** 关闭共享 I2C 总线；下一次调用 `ensureI2cBus` 的积木会重建，已有设备对象需要重新初始化。 */
export const ensureI2cCloseHelper = (): string => {
  const internals = hardwareInternals();
  return internals.provideFunction_("hardware_i2c_close", [
    `def ${internals.FUNCTION_NAME_PLACEHOLDER_}():`,
    '  bus = globals().get("_i2c")',
    "  if bus is not None:",
    "    bus.deinit()",
    '    globals()["_i2c"] = None',
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
export const textInputValue = (block: Blockly.Block, inputName: string): string | undefined => {
  const target = block.getInputTargetBlock(inputName);
  if (!target || target.type !== "text") return undefined;
  return String(target.getFieldValue("TEXT") ?? "");
};
export const pythonOrder = Order;
export const hardwareGenerator = pythonGenerator;
export const hardwareGeneratorIndent = () => hardwareInternals().INDENT;
