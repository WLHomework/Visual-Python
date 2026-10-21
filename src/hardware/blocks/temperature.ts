import * as Blockly from "blockly/core";
import { getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureImport,
  getActiveHardwareBoard,
  hardwareColours,
  hardwareGenerator,
  hardwareSectionLabel,
  pythonOrder,
} from "./shared";

const definitions = [
  {
    type: "hardware_mcu_temperature",
    message0: "读取芯片温度（℃）",
    output: "Number",
    colour: hardwareColours.analog,
    tooltip: "读取芯片内部温度，返回整数摄氏度。数值是芯片自身发热后的温度，通常比室温高，不是环境温度。",
  },
];

export function register(): void {
  defineHardwareBlocks(definitions);
  hardwareGenerator.forBlock.hardware_mcu_temperature = () => {
    const profile = getActiveHardwareBoard();
    // 经典 ESP32 固件只有 esp32.raw_temperature()（未校准的原始值），不生成会报错的代码。
    if (!profile?.mcuTemperature) return ["None", pythonOrder.ATOMIC];
    ensureImport("esp32");
    return ["esp32.mcu_temperature()", pythonOrder.FUNCTION_CALL];
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.mcuTemperature) return [];
  return [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("芯片温度"),
    { kind: "block", type: "hardware_mcu_temperature" },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
