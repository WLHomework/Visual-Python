import { supportedHardwareBoards, type HardwareBoardId, type HardwareChipFamily, chipFamilyOfBoard } from "./firmwareCatalog";

export type HardwarePin = {
  /** 生成代码时使用的引脚编号；ESP8266 的 "A0" 表示模拟输入通道。 */
  id: string;
  /** 积木下拉与提示中显示的引脚名。 */
  label: string;
  /** 可以当作普通数字引脚使用。 */
  digital?: boolean;
  /** 支持 PWM 输出。 */
  pwm?: boolean;
  /** 支持模拟输入（ADC）。 */
  analog?: boolean;
  /** 支持电容触摸（MicroPython 的 machine.TouchPad）。 */
  touch?: boolean;
  /** 支持数字输入时的内置上拉。 */
  pullUp?: boolean;
  /** 支持数字输入时的内置下拉。 */
  pullDown?: boolean;
  /** 只能输入，不能输出（例如 ESP32 的 GPIO34-39）。 */
  inputOnly?: boolean;
  /** 板载按钮、串口或会影响启动的引脚，默认不出现在下拉里。 */
  reserved?: boolean;
  /** 板载 LED 所在的引脚。 */
  builtinLed?: boolean;
};

/** 积木上会出现的引脚用法。 */
export type HardwarePinUse = "digital-output" | "digital-input" | "pwm" | "analog" | "touch";
export type HardwarePinPull = "none" | "up" | "down";

export type BoardProfile = {
  boardId: HardwareBoardId;
  chipFamily: HardwareChipFamily;
  displayName: string;
  /** 模拟读取的代码形式：ESP8266 固定为 ADC(0)，ESP32 为 ADC(Pin(n))。 */
  analogRead: "adc0" | "adcPin";
  /** 常见接线下的默认 I2C 引脚。 */
  defaultI2c: { sda: string; scl: string };
  /** PWM 默认频率（赫兹）。 */
  pwmFrequencyHz: number;
  /** PWM 频率上限（赫兹）；未定义表示当前板卡没有已声明的上限。 */
  pwmFrequencyMaxHz?: number;
  /** PWM 占空比上限（0 到该值）。 */
  pwmDutyMax: number;
  /** 板载 LED 低电平点亮时为 true（ESP8266 常见）。 */
  builtinLedActiveLow?: boolean;
  /** 板载可寻址 RGB 灯（WS2812）的数据引脚；没有该字段的板卡不提供板载 RGB 积木。 */
  builtinRgb?: { pin: string };
  /** 用户可用的 UART 编号；UART0 被 REPL 占用不列入，没有该字段的板卡不提供串口积木。 */
  uartIds?: readonly number[];
  /** 用户可用的硬件 SPI 编号；没有该字段的板卡不提供 SPI 积木。 */
  spiIds?: readonly number[];
  /** 是否支持 esp32.mcu_temperature()；经典 ESP32 只有 raw_temperature()，ESP8266 没有 esp32 模块。 */
  mcuTemperature?: boolean;
  /** 固件是否内置 HTTP、NTP、BLE、ESP-NOW 与 MQTT；目前只有官方 ESP32-S3 固件提供这些积木。 */
  advancedWireless?: boolean;
  /** 是否提供设备文本文件与 NVS 键值积木。 */
  deviceStorage?: boolean;
  /**
   * 是否开放本轮新增的基础模块积木（按键/PIR/模拟传感器/继电器/直流电机/NeoPixel 填充）。
   * 先只在 ESP32-S3 打开；WROOM/ESP8266 等 S3 验证通过后再评估下放。
   */
  p0Modules?: boolean;
  /**
   * 是否开放 H5 的驱动类模块积木（DS18B20/I2C 传感器/TM1637/步进电机/OLED 图形）。
   * 先只在 ESP32-S3 打开；WROOM/ESP8266 等 S3 真机验证后再评估下放。
   */
  p1Modules?: boolean;
  /**
   * 是否开放 P2 模块积木（DS3231 时钟/VL53L0X 测距/OLED 进度条/HTTP 下载）。
   * 先只在 ESP32-S3 打开；WROOM/ESP8266 等 S3 真机验证后再评估下放。
   */
  p2Modules?: boolean;
  pins: HardwarePin[];
};

/** ADC.read() 的满量程：ESP8266 为 10 位，ESP32 系列为 12 位。 */
export const analogReadMax = (profile: BoardProfile): number => (profile.analogRead === "adc0" ? 1023 : 4095);

const esp32Wroom: BoardProfile = {
  boardId: "esp32-wroom",
  chipFamily: "esp32",
  displayName: "ESP32 WROOM",
  analogRead: "adcPin",
  defaultI2c: { sda: "21", scl: "22" },
  pwmFrequencyHz: 1000,
  pwmDutyMax: 1023,
  // H6.1：S3 上已验证的 P0 通用包下放到 WROOM（GPIO/ADC/PWM/I2C 驱动语义一致）。
  // 仍建议在 WROOM 真机上复核 ADC 校准、PWM 占空比与 I2C 驱动时序。
  p0Modules: true,
  // 经典 ESP32 有三个 UART，UART0 接 REPL；tx/rx 由积木下拉选择（任意 GPIO）。
  uartIds: [1, 2],
  pins: [
    { id: "0", label: "GPIO0（启动按键）", digital: true, pwm: true, pullUp: true, pullDown: true, touch: true, reserved: true },
    { id: "1", label: "GPIO1（串口 TX）", digital: true, pullUp: true, pullDown: true, reserved: true },
    { id: "2", label: "GPIO2（板载 LED）", digital: true, pwm: true, pullUp: true, pullDown: true, touch: true, builtinLed: true },
    { id: "3", label: "GPIO3（串口 RX）", digital: true, pullUp: true, pullDown: true, reserved: true },
    { id: "4", label: "GPIO4", digital: true, pwm: true, pullUp: true, pullDown: true, touch: true },
    { id: "5", label: "GPIO5", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "12", label: "GPIO12", digital: true, pwm: true, pullUp: true, pullDown: true, touch: true },
    { id: "13", label: "GPIO13", digital: true, pwm: true, pullUp: true, pullDown: true, touch: true },
    { id: "14", label: "GPIO14", digital: true, pwm: true, pullUp: true, pullDown: true, touch: true },
    { id: "15", label: "GPIO15", digital: true, pwm: true, pullUp: true, pullDown: true, touch: true },
    { id: "16", label: "GPIO16", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "17", label: "GPIO17", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "18", label: "GPIO18", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "19", label: "GPIO19", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "21", label: "GPIO21", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "22", label: "GPIO22", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "23", label: "GPIO23", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "25", label: "GPIO25（DAC）", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "26", label: "GPIO26（DAC）", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "27", label: "GPIO27", digital: true, pwm: true, pullUp: true, pullDown: true, touch: true },
    { id: "32", label: "GPIO32（模拟输入）", digital: true, pwm: true, analog: true, pullUp: true, pullDown: true, touch: true },
    { id: "33", label: "GPIO33（模拟输入）", digital: true, pwm: true, analog: true, pullUp: true, pullDown: true, touch: true },
    { id: "34", label: "GPIO34（仅输入/模拟）", analog: true, inputOnly: true },
    { id: "35", label: "GPIO35（仅输入/模拟）", analog: true, inputOnly: true },
    { id: "36", label: "GPIO36（部分板卡占用）", analog: true, inputOnly: true, reserved: true },
    { id: "39", label: "GPIO39（部分板卡占用）", analog: true, inputOnly: true, reserved: true },
  ],
};

const esp8266Esp12e: BoardProfile = {
  boardId: "esp8266-esp12e",
  chipFamily: "esp8266",
  displayName: "ESP8266 ESP-12E（NodeMCU）",
  analogRead: "adc0",
  defaultI2c: { sda: "4", scl: "5" },
  pwmFrequencyHz: 1000,
  pwmFrequencyMaxHz: 1000,
  pwmDutyMax: 1023,
  builtinLedActiveLow: true,
  // H6.2：P0 通用包下放到 ESP8266；A0 只有 0–1023、PWM 上限 1 kHz，
  // 生成器已按 analogReadMax/pwmDutyMax 归一化，仍建议在 8266 真机上复核分压与占空比。
  p0Modules: true,
  pins: [
    { id: "A0", label: "A0（模拟输入）", analog: true, inputOnly: true },
    { id: "0", label: "GPIO0（D3，启动）", digital: true, pwm: true, pullUp: true, reserved: true },
    { id: "1", label: "GPIO1（D10，串口 TX）", digital: true, pullUp: true, reserved: true },
    { id: "2", label: "GPIO2（D4，板载 LED）", digital: true, pwm: true, pullUp: true, builtinLed: true },
    { id: "3", label: "GPIO3（D9，串口 RX）", digital: true, pullUp: true, reserved: true },
    { id: "4", label: "GPIO4（D2）", digital: true, pwm: true, pullUp: true },
    { id: "5", label: "GPIO5（D1）", digital: true, pwm: true, pullUp: true },
    { id: "12", label: "GPIO12（D6）", digital: true, pwm: true, pullUp: true },
    { id: "13", label: "GPIO13（D7）", digital: true, pwm: true, pullUp: true },
    { id: "14", label: "GPIO14（D5）", digital: true, pwm: true, pullUp: true },
    { id: "15", label: "GPIO15（D8）", digital: true, pwm: true, pullUp: true },
    { id: "16", label: "GPIO16（D0，不支持 PWM）", digital: true },
  ],
};

const esp32S3: BoardProfile = {
  boardId: "esp32-s3",
  chipFamily: "esp32s3",
  displayName: "ESP32-S3",
  analogRead: "adcPin",
  defaultI2c: { sda: "8", scl: "9" },
  pwmFrequencyHz: 1000,
  pwmDutyMax: 1023,
  // DevKitC-1 v1.0 的板载 RGB 灯接 GPIO48；v1.1 改成 GPIO38，这里以用户手上的 v1.0 为准。
  builtinRgb: { pin: "48" },
  // ESP32-S3 有三个 UART，UART0 接板载 USB 串口（REPL）；tx/rx 由积木下拉选择（任意 GPIO）。
  uartIds: [1, 2],
  // ESP32-S3 的通用硬件 SPI 通道；SPI 积木先只在 S3 开放，WROOM/ESP8266 等真机验证后再评估。
  spiIds: [1, 2],
  mcuTemperature: true,
  // 官方 v1.29.0 的 S3 固件带 bluetooth / espnow，并冻结了 requests / ntptime / umqtt；
  // 这些积木只放在 S3 工具箱，WROOM 与 ESP8266 不追加。
  advancedWireless: true,
  // 设备文件系统与 esp32.NVS 都由 S3 固件提供，并与「设备」面板共用文件系统。
  deviceStorage: true,
  // H1 模块积木先只在 S3 开放；WROOM/ESP8266 等 S3 真机验证后再评估。
  p0Modules: true,
  // H5 的驱动类模块积木同样先只在 S3 开放。
  p1Modules: true,
  // P2 的时钟/测距/进度条/下载积木同样先只在 S3 开放。
  p2Modules: true,
  pins: [
    { id: "0", label: "GPIO0（启动配置）", digital: true, pwm: true, pullUp: true, pullDown: true, reserved: true },
    { id: "1", label: "GPIO1（模拟输入）", digital: true, pwm: true, analog: true, touch: true, pullUp: true, pullDown: true },
    { id: "2", label: "GPIO2（模拟输入）", digital: true, pwm: true, analog: true, touch: true, pullUp: true, pullDown: true },
    { id: "3", label: "GPIO3（启动配置）", digital: true, pwm: true, analog: true, touch: true, pullUp: true, pullDown: true, reserved: true },
    { id: "4", label: "GPIO4（模拟输入）", digital: true, pwm: true, analog: true, touch: true, pullUp: true, pullDown: true },
    { id: "5", label: "GPIO5（模拟输入）", digital: true, pwm: true, analog: true, touch: true, pullUp: true, pullDown: true },
    { id: "6", label: "GPIO6（模拟输入）", digital: true, pwm: true, analog: true, touch: true, pullUp: true, pullDown: true },
    { id: "7", label: "GPIO7（模拟输入）", digital: true, pwm: true, analog: true, touch: true, pullUp: true, pullDown: true },
    { id: "8", label: "GPIO8（模拟输入）", digital: true, pwm: true, analog: true, touch: true, pullUp: true, pullDown: true },
    { id: "9", label: "GPIO9（模拟输入）", digital: true, pwm: true, analog: true, touch: true, pullUp: true, pullDown: true },
    { id: "10", label: "GPIO10（模拟输入）", digital: true, pwm: true, analog: true, touch: true, pullUp: true, pullDown: true },
    { id: "11", label: "GPIO11", digital: true, pwm: true, touch: true, pullUp: true, pullDown: true },
    { id: "12", label: "GPIO12", digital: true, pwm: true, touch: true, pullUp: true, pullDown: true },
    { id: "13", label: "GPIO13", digital: true, pwm: true, touch: true, pullUp: true, pullDown: true },
    { id: "14", label: "GPIO14", digital: true, pwm: true, touch: true, pullUp: true, pullDown: true },
    { id: "15", label: "GPIO15", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "16", label: "GPIO16", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "17", label: "GPIO17", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "18", label: "GPIO18", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "19", label: "GPIO19（USB D-）", digital: true, reserved: true },
    { id: "20", label: "GPIO20（USB D+）", digital: true, reserved: true },
    { id: "21", label: "GPIO21", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "26", label: "GPIO26（Flash/PSRAM）", digital: true, pwm: true, pullUp: true, pullDown: true, reserved: true },
    { id: "27", label: "GPIO27（Flash/PSRAM）", digital: true, pwm: true, pullUp: true, pullDown: true, reserved: true },
    { id: "28", label: "GPIO28（Flash/PSRAM）", digital: true, pwm: true, pullUp: true, pullDown: true, reserved: true },
    { id: "29", label: "GPIO29（Flash/PSRAM）", digital: true, pwm: true, pullUp: true, pullDown: true, reserved: true },
    { id: "30", label: "GPIO30（Flash/PSRAM）", digital: true, pwm: true, pullUp: true, pullDown: true, reserved: true },
    { id: "31", label: "GPIO31（Flash/PSRAM）", digital: true, pwm: true, pullUp: true, pullDown: true, reserved: true },
    { id: "32", label: "GPIO32（Flash/PSRAM）", digital: true, pwm: true, pullUp: true, pullDown: true, reserved: true },
    { id: "33", label: "GPIO33（Flash/PSRAM，部分模组）", digital: true, pwm: true, pullUp: true, pullDown: true, reserved: true },
    { id: "34", label: "GPIO34（Flash/PSRAM，部分模组）", digital: true, pwm: true, pullUp: true, pullDown: true, reserved: true },
    { id: "35", label: "GPIO35（Flash/PSRAM，部分模组）", digital: true, pwm: true, pullUp: true, pullDown: true, reserved: true },
    { id: "36", label: "GPIO36（Flash/PSRAM，部分模组）", digital: true, pwm: true, pullUp: true, pullDown: true, reserved: true },
    { id: "37", label: "GPIO37（Flash/PSRAM，部分模组）", digital: true, pwm: true, pullUp: true, pullDown: true, reserved: true },
    { id: "38", label: "GPIO38", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "39", label: "GPIO39", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "40", label: "GPIO40", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "41", label: "GPIO41", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "42", label: "GPIO42", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "43", label: "GPIO43（串口 TX）", digital: true, pwm: true, pullUp: true, pullDown: true, reserved: true },
    { id: "44", label: "GPIO44（串口 RX）", digital: true, pwm: true, pullUp: true, pullDown: true, reserved: true },
    { id: "45", label: "GPIO45（启动配置）", digital: true, pwm: true, pullUp: true, pullDown: true, reserved: true },
    { id: "46", label: "GPIO46（启动配置）", digital: true, pwm: true, pullUp: true, pullDown: true, reserved: true },
    { id: "47", label: "GPIO47", digital: true, pwm: true, pullUp: true, pullDown: true },
    { id: "48", label: "GPIO48", digital: true, pwm: true, pullUp: true, pullDown: true },
  ],
};

export const hardwareBoardProfiles: readonly BoardProfile[] = [esp32Wroom, esp8266Esp12e, esp32S3];

export function isHardwareBoardId(value: unknown): value is HardwareBoardId {
  return typeof value === "string" && (supportedHardwareBoards as readonly string[]).includes(value);
}

export function getBoardProfile(boardId: HardwareBoardId | undefined): BoardProfile | undefined {
  if (!boardId) return undefined;
  return hardwareBoardProfiles.find((profile) => profile.boardId === boardId);
}

export function builtinLedPin(profile: BoardProfile): HardwarePin | undefined {
  return profile.pins.find((pin) => pin.builtinLed);
}

function supportsPinUse(pin: HardwarePin, use: HardwarePinUse): boolean {
  switch (use) {
    case "digital-output":
      return Boolean(pin.digital) && !pin.inputOnly;
    case "digital-input":
      return Boolean(pin.digital);
    case "pwm":
      return Boolean(pin.pwm) && !pin.inputOnly;
    case "analog":
      return Boolean(pin.analog);
    case "touch":
      return Boolean(pin.touch);
  }
}

/** 供积木下拉使用的引脚候选（自动排除保留引脚）。 */
export function boardPinChoices(profile: BoardProfile | undefined, use: HardwarePinUse): HardwarePin[] {
  if (!profile) return [];
  return profile.pins.filter((pin) => !pin.reserved && supportsPinUse(pin, use));
}

/** 校验某个引脚是否能用于指定用法，返回中文错误说明；合法时返回 undefined。 */
export function validateBoardPin(profile: BoardProfile | undefined, use: HardwarePinUse, pinId: string): string | undefined {
  if (!profile) return "请先在工程中选择硬件板卡";
  if (!pinId) return "请选择引脚";
  const pin = profile.pins.find((item) => item.id === pinId);
  if (!pin) return `${profile.displayName} 上没有引脚 ${pinId}`;
  if (pin.reserved) return `引脚 ${pin.label} 会影响设备启动，暂不支持使用`;
  if (!supportsPinUse(pin, use)) {
    if (use === "analog") return `引脚 ${pin.label} 不支持模拟输入`;
    if (use === "touch") return `引脚 ${pin.label} 不支持电容触摸`;
    if (use === "digital-input") return `引脚 ${pin.label} 不能作为数字输入使用`;
    return `引脚 ${pin.label} 只能作为输入使用`;
  }
  return undefined;
}

/** 校验数字输入引脚的内置上下拉模式。 */
export function validateDigitalInputPull(
  profile: BoardProfile | undefined,
  pinId: string,
  pull: HardwarePinPull,
): string | undefined {
  const pinProblem = validateBoardPin(profile, "digital-input", pinId);
  if (pinProblem) return pinProblem;
  if (pull !== "none" && pull !== "up" && pull !== "down") return `不支持的内部拉模式：${pull}`;
  if (pull === "none") return undefined;

  const pin = profile?.pins.find((item) => item.id === pinId);
  if (!pin) return `引脚 ${pinId} 不存在`;
  if (pull === "up" && !pin.pullUp) return `引脚 ${pin.label} 不支持内部上拉`;
  if (pull === "down" && !pin.pullDown) return `引脚 ${pin.label} 不支持内部下拉`;
  return undefined;
}

/** 校验音调频率；频率未能静态确定时由生成代码负责限制。 */
export function validateToneFrequency(profile: BoardProfile | undefined, frequency: number | undefined): string | undefined {
  if (!profile || frequency === undefined) return undefined;
  if (!Number.isFinite(frequency) || frequency <= 0) return "音调频率必须大于 0 Hz";
  if (profile.pwmFrequencyMaxHz !== undefined && frequency > profile.pwmFrequencyMaxHz) {
    return `${profile.displayName} 音调频率不能超过 ${profile.pwmFrequencyMaxHz} Hz`;
  }
  return undefined;
}

/** 检查板卡档案自身是否自洽，返回中文问题列表（为空表示通过）。 */
export function collectBoardProfileIssues(profiles: readonly BoardProfile[]): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const profile of profiles) {
    const prefix = profile.boardId;
    if (!isHardwareBoardId(profile.boardId)) issues.push(`${prefix} 不是受支持的板卡`);
    if (seen.has(profile.boardId)) issues.push(`${prefix} 重复定义了板卡档案`);
    seen.add(profile.boardId);
    if (!profile.displayName.trim()) issues.push(`${prefix} 缺少显示名`);
    if (profile.chipFamily !== chipFamilyOfBoard(profile.boardId)) issues.push(`${prefix} 芯片系列与固件目录不一致`);
    if (profile.pwmFrequencyHz <= 0) issues.push(`${prefix} 的 PWM 默认频率无效`);
    if (profile.pwmFrequencyMaxHz !== undefined && profile.pwmFrequencyMaxHz <= 0) issues.push(`${prefix} 的 PWM 频率上限无效`);
    if (profile.pwmDutyMax <= 0) issues.push(`${prefix} 的 PWM 占空比上限无效`);
    if (profile.pins.length === 0) issues.push(`${prefix} 缺少引脚定义`);

    const pinIds = new Set<string>();
    let builtinLedCount = 0;
    for (const pin of profile.pins) {
      if (!pin.id.trim()) issues.push(`${prefix} 存在缺少编号的引脚`);
      if (pinIds.has(pin.id)) issues.push(`${prefix} 的引脚 ${pin.id} 重复定义`);
      pinIds.add(pin.id);
      if ((pin.pullUp || pin.pullDown) && !pin.digital) issues.push(`${prefix} 引脚 ${pin.id} 内置上下拉能力必须是数字引脚`);
      if (pin.builtinLed) builtinLedCount += 1;
      if (!pin.digital && !pin.analog) issues.push(`${prefix} 的引脚 ${pin.id} 没有任何可用能力`);
      if (pin.pwm && !pin.digital) issues.push(`${prefix} 的引脚 ${pin.id} 支持 PWM 却不是数字引脚`);
    }
    if (builtinLedCount > 1) issues.push(`${prefix} 的板载 LED 引脚不唯一`);

    const analogPins = profile.pins.filter((pin) => pin.analog);
    if (analogPins.length === 0) issues.push(`${prefix} 缺少模拟输入引脚`);
    if (profile.analogRead === "adc0") {
      const dedicated = analogPins.every((pin) => !pin.digital);
      if (!dedicated) issues.push(`${prefix} 使用 ADC(0) 时模拟引脚不应该是数字引脚`);
    }

    for (const pinId of [profile.defaultI2c.sda, profile.defaultI2c.scl]) {
      if (!pinIds.has(pinId)) issues.push(`${prefix} 的默认 I2C 引脚 ${pinId} 不存在`);
    }

    const rgbPinId = profile.builtinRgb?.pin;
    if (rgbPinId !== undefined) {
      const rgbPin = profile.pins.find((pin) => pin.id === rgbPinId);
      if (!rgbPin) issues.push(`${prefix} 的板载 RGB 引脚 ${rgbPinId} 不存在`);
      else if (!supportsPinUse(rgbPin, "digital-output")) issues.push(`${prefix} 的板载 RGB 引脚 ${rgbPinId} 不能作为输出使用`);
    }

    const uartIds = profile.uartIds ?? [];
    if (new Set(uartIds).size !== uartIds.length) issues.push(`${prefix} 的串口编号重复`);
    if (uartIds.includes(0)) issues.push(`${prefix} 的串口 0 被 REPL 占用，不能作为用户串口`);

    const spiIds = profile.spiIds ?? [];
    if (new Set(spiIds).size !== spiIds.length) issues.push(`${prefix} 的 SPI 编号重复`);
    if (spiIds.includes(0)) issues.push(`${prefix} 的 SPI 0 被 Flash 占用，不能作为用户 SPI`);
  }
  for (const boardId of supportedHardwareBoards) {
    if (!seen.has(boardId)) issues.push(`缺少板卡档案：${boardId}`);
  }
  return issues;
}
