import * as Blockly from "blockly/core";
import { getBoardProfile } from "../boardProfiles";
import type { BoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureI2cBus,
  ensureImport,
  getActiveHardwareBoard,
  hardwareColours,
  hardwareFunctionPlaceholder,
  hardwareGenerator,
  hardwareSectionLabel,
  provideHardwareFunction,
  pythonOrder,
} from "./shared";

const definitions = [
  {
    type: "hardware_bh1750_lux",
    message0: "BH1750 光照 地址 %1 (lux)",
    args0: [
      { type: "field_dropdown", name: "ADDRESS", options: [["0x23", "0x23"], ["0x5C", "0x5C"]] },
    ],
    output: "Number",
    colour: hardwareColours.sensor,
    tooltip: "读取 BH1750 环境光照，单位为 lux。传感器使用连续高分辨率测量；首次读取会等待约 180 毫秒。ADDR 引脚接地时地址为 0x23，接高电平时为 0x5C。",
  },
];

/**
 * 按地址缓存传感器对象：循环里反复读取时不会每次都重新上电和等待测量。
 * 如果用户切换地址，则重新创建对象。
 */
const ensureBh1750Helper = (profile: BoardProfile): string => {
  ensureImport("bh1750");
  const bus = ensureI2cBus(profile);
  const placeholder = hardwareFunctionPlaceholder();
  return provideHardwareFunction("hardware_bh1750_read", [
    `def ${placeholder}(address):`,
    '  if globals().get("_bh1750_address", -1) != address:',
    `    globals()["_bh1750"] = bh1750.BH1750(${bus}(), address=address)`,
    '    globals()["_bh1750_address"] = address',
    '  return globals()["_bh1750"].read_lux()',
  ]);
};

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_bh1750_lux = (block) => {
    const profile = getActiveHardwareBoard();
    if (!profile) return ["0", pythonOrder.ATOMIC];
    const address = String(block.getFieldValue("ADDRESS") || "0x23");
    const helper = ensureBh1750Helper(profile);
    return [`${helper}(${address})`, pythonOrder.FUNCTION_CALL];
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.p0Modules) return [];
  return [
    hardwareSectionLabel("I2C 传感器"),
    {
      kind: "block",
      type: "hardware_bh1750_lux",
      fields: { ADDRESS: "0x23" },
    },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
