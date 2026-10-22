import * as Blockly from "blockly/core";
import { boardPinChoices, getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureImport,
  getActiveHardwareBoard,
  hardwareColours,
  hardwareFunctionPlaceholder,
  hardwareGenerator,
  hardwareSectionLabel,
  numberShadow,
  numericInputValue,
  pinTargetField,
  provideHardwareFunction,
  pythonOrder,
  unavailable,
} from "./shared";

const spiOptions = [["SPI 1", "1"], ["SPI 2", "2"]];

const definitions = [
  {
    type: "hardware_spi_init",
    message0: "初始化 SPI 编号 %1 波特率 %2 SCK %3 MOSI %4 MISO %5",
    args0: [
      { type: "field_dropdown", name: "SPI", options: spiOptions },
      { type: "input_value", name: "BAUD", check: "Number" },
      { type: "field_dropdown", name: "SCK", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "MOSI", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "MISO", options: [["（请先选择硬件板卡）", ""]] },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.communication,
    tooltip:
      "初始化硬件 SPI。SCK/MOSI 必须是输出引脚，MISO 必须是输入引脚；初始化后「SPI 收发」积木都会使用最后初始化的这条总线。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_spi_transfer",
    message0: "SPI 收发字节 %1",
    args0: [{ type: "input_value", name: "VALUE", check: "Number" }],
    inputsInline: true,
    output: "Number",
    colour: hardwareColours.communication,
    tooltip: "同时发送并接收 1 个字节（0–255），返回接收到的字节；需要先「初始化 SPI」。",
  },
  {
    type: "hardware_spi_transfer_text",
    message0: "SPI 收发文本 %1 返回十六进制",
    args0: [{ type: "input_value", name: "TEXT", check: "String" }],
    inputsInline: true,
    output: "String",
    colour: hardwareColours.communication,
    tooltip: "把文本按 UTF-8 编码后发送，并返回等长接收数据的十六进制字符串；需要先「初始化 SPI」。",
  },
];

const literalProblem = (block: Blockly.Block, input: string, min: number, max: number, message: string): string | undefined => {
  const value = numericInputValue(block, input);
  if (value === undefined) return undefined;
  return Number.isInteger(value) && value >= min && value <= max ? undefined : message;
};

const ensureSpiTransferHelper = (): string =>
  provideHardwareFunction("hardware_spi_transfer_byte", [
    `def ${hardwareFunctionPlaceholder()}(value):`,
    '  spi = globals().get("_spi")',
    "  if spi is None:",
    "    return 0",
    "  tx = bytes([int(value) & 0xFF])",
    "  rx = bytearray(1)",
    "  spi.write_readinto(tx, rx)",
    "  return rx[0]",
  ]);

const ensureSpiTransferTextHelper = (): string =>
  provideHardwareFunction("hardware_spi_transfer_text", [
    `def ${hardwareFunctionPlaceholder()}(text):`,
    '  spi = globals().get("_spi")',
    "  if spi is None:",
    '    return ""',
    "  tx = str(text).encode()",
    "  rx = bytearray(len(tx))",
    "  if len(tx) == 0:",
    '    return ""',
    "  spi.write_readinto(tx, rx)",
    "  return rx.hex()",
  ]);

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_spi_init = (block, generator) => {
    const profile = getActiveHardwareBoard();
    if (!profile) return unavailable("请先选择硬件板卡");
    if (!profile.spiIds?.length) return unavailable(`${profile.displayName} 不支持 SPI 积木（仅 ESP32-S3）`);
    const spiId = Number(block.getFieldValue("SPI"));
    if (!profile.spiIds.includes(spiId)) return unavailable(`${profile.displayName} 上没有 SPI ${spiId}`);
    const baudProblem = literalProblem(block, "BAUD", 1000, 80000000, "SPI 波特率必须是 1000–80000000 之间的整数");
    if (baudProblem) return unavailable(baudProblem);
    const sck = pinTargetField(block, "digital-output", "SCK");
    if (typeof sck === "string") return sck;
    const mosi = pinTargetField(block, "digital-output", "MOSI");
    if (typeof mosi === "string") return mosi;
    const miso = pinTargetField(block, "digital-input", "MISO");
    if (typeof miso === "string") return miso;
    if (new Set([sck.pinId, mosi.pinId, miso.pinId]).size < 3) {
      return unavailable("SPI 的 SCK、MOSI 和 MISO 必须使用不同引脚");
    }
    ensureImport("machine");
    const baud = generator.valueToCode(block, "BAUD", pythonOrder.NONE) || "1000000";
    return `_spi = machine.SPI(${spiId}, baudrate=int(${baud}), sck=machine.Pin(${sck.pinId}), mosi=machine.Pin(${mosi.pinId}), miso=machine.Pin(${miso.pinId}))\n`;
  };

  hardwareGenerator.forBlock.hardware_spi_transfer = (block, generator) => {
    const profile = getActiveHardwareBoard();
    if (!profile?.spiIds?.length) return ["0", pythonOrder.ATOMIC];
    const problem = literalProblem(block, "VALUE", 0, 0xFF, "SPI 发送字节必须在 0–255 之间");
    if (problem) return ["0", pythonOrder.ATOMIC];
    const value = generator.valueToCode(block, "VALUE", pythonOrder.NONE) || "0";
    return [`${ensureSpiTransferHelper()}(${value})`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_spi_transfer_text = (block, generator) => {
    const profile = getActiveHardwareBoard();
    if (!profile?.spiIds?.length) return ['""', pythonOrder.ATOMIC];
    const text = generator.valueToCode(block, "TEXT", pythonOrder.NONE) || '""';
    return [`${ensureSpiTransferTextHelper()}(${text})`, pythonOrder.FUNCTION_CALL];
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.spiIds?.length) return [];
  const outputs = boardPinChoices(profile, "digital-output").filter((pin) => !pin.builtinLed);
  const inputs = boardPinChoices(profile, "digital-input").filter((pin) => !pin.builtinLed);
  const used = new Set<string>();
  // ESP32-S3 的 SPI2 IOMUX 默认引脚是 SCK 12 / MOSI 11 / MISO 13；其他板卡按可用引脚回退。
  const takePin = (choices: typeof outputs, preferred: readonly string[]): string => {
    const match =
      choices.find((pin) => preferred.includes(pin.id) && !used.has(pin.id)) ??
      choices.find((pin) => !used.has(pin.id));
    if (!match) return "";
    used.add(match.id);
    return match.id;
  };
  const sck = takePin(outputs, ["12"]);
  const mosi = takePin(outputs, ["11"]);
  const miso = takePin(inputs, ["13"]);
  return [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("SPI 通信"),
    {
      kind: "block",
      type: "hardware_spi_init",
      fields: { SPI: String(profile.spiIds[0]), SCK: sck, MOSI: mosi, MISO: miso },
      inputs: { BAUD: numberShadow(1000000) },
    },
    { kind: "block", type: "hardware_spi_transfer", inputs: { VALUE: numberShadow(0) } },
    {
      kind: "block",
      type: "hardware_spi_transfer_text",
      inputs: { TEXT: { shadow: { type: "text", fields: { TEXT: "Hello" } } } },
    },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
