import * as Blockly from "blockly/core";
import { boardPinChoices, getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureDhtHelper,
  ensureImport,
  hardwareColours,
  hardwareGenerator,
  hardwareSectionLabel,
  pinTarget,
  pythonOrder,
} from "./shared";

const sensorOptions = [["DHT11", "DHT11"], ["DHT22", "DHT22"]];
const definitions = [
  {
    type: "hardware_dht_temperature",
    message0: "读取 %1 温度 引脚 %2",
    args0: [
      { type: "field_dropdown", name: "SENSOR", options: sensorOptions },
      { type: "field_dropdown", name: "PIN", options: [["请先选择硬件板卡", ""]] },
    ],
    output: "Number",
    colour: hardwareColours.analog,
    tooltip: "读取 DHT 温度（摄氏度）。传感器异常时返回 None；输出类型声明为 Number。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_dht_humidity",
    message0: "读取 %1 湿度 引脚 %2",
    args0: [
      { type: "field_dropdown", name: "SENSOR", options: sensorOptions },
      { type: "field_dropdown", name: "PIN", options: [["请先选择硬件板卡", ""]] },
    ],
    output: "Number",
    colour: hardwareColours.analog,
    tooltip: "读取 DHT 相对湿度（百分比）。传感器异常时返回 None；输出类型声明为 Number。",
    extensions: ["hardware_board_pin"],
  },
];

export function register(): void {
  defineHardwareBlocks(definitions);
  const generateRead = (block: Blockly.Block, index: 0 | 1): [string, number] => {
    const target = pinTarget(block, "digital-input");
    if (typeof target === "string") return ["None", pythonOrder.ATOMIC];
    ensureImport("machine");
    ensureImport("dht");
    const helper = ensureDhtHelper();
    const sensor = String(block.getFieldValue("SENSOR") || "DHT11");
    return [`${helper}(${target.pinId}, dht.${sensor})[${index}]`, pythonOrder.FUNCTION_CALL];
  };
  hardwareGenerator.forBlock.hardware_dht_temperature = (block) => generateRead(block, 0);
  hardwareGenerator.forBlock.hardware_dht_humidity = (block) => generateRead(block, 1);
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  const pin = boardPinChoices(profile, "digital-input")[0]?.id ?? "";
  return [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("DHT 温湿度"),
    { kind: "block", type: "hardware_dht_temperature", fields: { PIN: pin, SENSOR: "DHT11" } },
    { kind: "block", type: "hardware_dht_humidity", fields: { PIN: pin, SENSOR: "DHT11" } },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
