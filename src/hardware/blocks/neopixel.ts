import * as Blockly from "blockly/core";
import { boardPinChoices, getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureImport,
  hardwareColours,
  hardwareGenerator,
  hardwareSectionLabel,
  numberShadow,
  pinTarget,
  pythonOrder,
} from "./shared";

const definitions = [
  {
    type: "hardware_neopixel_init",
    message0: "初始化 NeoPixel 引脚 %1 灯珠数 %2",
    args0: [
      { type: "field_dropdown", name: "PIN", options: [["请先选择硬件板卡", ""]] },
      { type: "input_value", name: "COUNT", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.board,
    tooltip: "初始化一条 NeoPixel 灯带，请先运行此积木再使用其他设置积木。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_neopixel_set_pixel",
    message0: "设置 NeoPixel 第 %1 颗灯珠 RGB(%2, %3, %4)",
    args0: [
      { type: "input_value", name: "INDEX", check: "Number" },
      { type: "input_value", name: "R", check: "Number" },
      { type: "input_value", name: "G", check: "Number" },
      { type: "input_value", name: "B", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.board,
    tooltip: "设置指定灯珠的颜色，RGB 值会限制在 0 到 255，请先初始化 NeoPixel。",
  },
  {
    type: "hardware_neopixel_clear",
    message0: "NeoPixel 灯全部熄灭",
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.board,
    tooltip: "将所有灯珠待刷新的颜色设置为黑色。",
  },
  {
    type: "hardware_neopixel_write",
    message0: "鍒锋柊 NeoPixel 鏄剧ず",
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.board,
    tooltip: "灏嗙紦瀛樼殑 NeoPixel 棰滆壊鍐欏叆灯带并显示出来。",
  },
];

const colorValue = (value: string) => `int(max(0, min(255, ${value})))`;

export function register(): void {
  defineHardwareBlocks(definitions);
  hardwareGenerator.forBlock.hardware_neopixel_init = (block, generator) => {
    const target = pinTarget(block, "digital-output");
    if (typeof target === "string") return target;
    ensureImport("machine");
    ensureImport("neopixel");
    const count = generator.valueToCode(block, "COUNT", pythonOrder.NONE) || "1";
    return `_neopixel = neopixel.NeoPixel(machine.Pin(${target.pinId}), int(max(1, ${count})))\n`;
  };
  hardwareGenerator.forBlock.hardware_neopixel_set_pixel = (block, generator) => {
    const index = generator.valueToCode(block, "INDEX", pythonOrder.NONE) || "0";
    const red = generator.valueToCode(block, "R", pythonOrder.NONE) || "0";
    const green = generator.valueToCode(block, "G", pythonOrder.NONE) || "0";
    const blue = generator.valueToCode(block, "B", pythonOrder.NONE) || "0";
    return `_neopixel[int(${index})] = (${colorValue(red)}, ${colorValue(green)}, ${colorValue(blue)})\n`;
  };
  hardwareGenerator.forBlock.hardware_neopixel_clear = () => "_neopixel.fill((0, 0, 0))\n";
  hardwareGenerator.forBlock.hardware_neopixel_write = () => "_neopixel.write()\n";
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  const pin = boardPinChoices(profile, "digital-output")[0]?.id ?? "";
  return [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("NeoPixel 灯带"),
    { kind: "block", type: "hardware_neopixel_init", fields: { PIN: pin }, inputs: { COUNT: numberShadow(8) } },
    {
      kind: "block",
      type: "hardware_neopixel_set_pixel",
      inputs: { INDEX: numberShadow(0), R: numberShadow(255), G: numberShadow(255), B: numberShadow(255) },
    },
    { kind: "block", type: "hardware_neopixel_clear" },
    { kind: "block", type: "hardware_neopixel_write" },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
