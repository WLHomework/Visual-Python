import * as Blockly from "blockly/core";
import { boardPinChoices, getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureHardwareGlobal,
  ensureImport,
  hardwareColours,
  hardwareFunctionPlaceholder,
  hardwareGenerator,
  hardwareSectionLabel,
  numberShadow,
  pinTarget,
  provideHardwareFunction,
  pythonOrder,
} from "./shared";

const definitions = [
  {
    type: "hardware_ds18b20_temperature",
    message0: "DS18B20 温度 引脚 %1 第 %2 个传感器",
    args0: [
      { type: "field_dropdown", name: "PIN", options: [["（请先选择硬件板卡）", ""]] },
      { type: "input_value", name: "INDEX", check: "Number" },
    ],
    inputsInline: true,
    output: "Number",
    colour: hardwareColours.sensor,
    tooltip: "读取单总线上的 DS18B20 温度。数据脚需要 4.7 kΩ 上拉到 3.3 V；一次转换约需 750 毫秒。总线上没有设备或读取失败时返回 -127（DS18B20 的上电复位值）。",
    extensions: ["hardware_board_pin"],
  },
];

/**
 * 单总线按引脚缓存 DS18X20 对象：同一个引脚反复读取时不会重新扫描总线。
 * 每次读取都要先启动转换并等待 750 毫秒，因此不要放在高频循环里无间隔调用。
 */
const ensureDs18b20Helper = (): string => {
  ensureImport("machine");
  ensureImport("onewire");
  ensureImport("ds18x20");
  ensureImport("time");
  ensureHardwareGlobal("hardware_ds18b20_sensors", "_ds18b20_sensors = {}");
  const placeholder = hardwareFunctionPlaceholder();
  return provideHardwareFunction("hardware_ds18b20_read", [
    `def ${placeholder}(pin, index):`,
    '  sensor = _ds18b20_sensors.get(pin)',
    "  if sensor is None:",
    "    sensor = ds18x20.DS18X20(onewire.OneWire(machine.Pin(pin)))",
    "    _ds18b20_sensors[pin] = sensor",
    "  roms = sensor.scan()",
    "  if not roms:",
    "    return -127.0",
    "  sensor.convert_temp()",
    "  time.sleep_ms(750)",
    "  if index < 1 or index > len(roms):",
    "    index = 1",
    "  try:",
    "    return sensor.read_temp(roms[index - 1])",
    "  except OSError:",
    "    return -127.0",
  ]);
};

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_ds18b20_temperature = (block, generator) => {
    const target = pinTarget(block, "digital-output");
    if (typeof target === "string") return ["0", pythonOrder.ATOMIC];
    const helper = ensureDs18b20Helper();
    const index = generator.valueToCode(block, "INDEX", pythonOrder.NONE) || "1";
    return [`${helper}(${target.pinId}, int(${index}))`, pythonOrder.FUNCTION_CALL];
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.p1Modules) return [];
  const pin = boardPinChoices(profile, "digital-output")[0]?.id ?? "";
  return [
    hardwareSectionLabel("单总线温度"),
    {
      kind: "block",
      type: "hardware_ds18b20_temperature",
      fields: { PIN: pin },
      inputs: { INDEX: numberShadow(1) },
    },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
