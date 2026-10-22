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
  pinTargetField,
  provideHardwareFunction,
  pythonOrder,
  unavailable,
} from "./shared";

const definitions = [
  {
    type: "hardware_rc522_uid",
    message0: "RFID 读卡 SPI %1 SCK %2 MOSI %3 MISO %4 CS %5 RST %6",
    args0: [
      { type: "field_dropdown", name: "SPI", options: [["1", "1"], ["2", "2"]] },
      { type: "field_dropdown", name: "SCK", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "MOSI", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "MISO", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "CS", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "RST", options: [["（请先选择硬件板卡）", ""]] },
    ],
    inputsInline: false,
    output: "String",
    colour: hardwareColours.communication,
    tooltip:
      "用 MFRC522 读卡器读取 ISO14443A 卡片的 4 字节 UID，返回大写十六进制（如 A1B2C3D4）；没有卡片或校验失败返回空字符串。模块使用 3.3 V 供电，CS 与 RST 接数字输出，SPI 时钟默认 1 MHz。",
    extensions: ["hardware_board_pin"],
  },
];

const pinFields = ["SCK", "MOSI", "MISO", "CS", "RST"] as const;

const ensureRc522Helper = (): string => {
  ensureImport("machine");
  ensureImport("rc522");
  const placeholder = hardwareFunctionPlaceholder();
  return provideHardwareFunction("hardware_rc522_read", [
    `def ${placeholder}(spi_id, sck, mosi, miso, cs, rst):`,
    '  sensor = globals().get("_rc522")',
    "  if sensor is None:",
    "    spi = machine.SPI(spi_id, baudrate=1000000, polarity=0, phase=0, sck=machine.Pin(sck), mosi=machine.Pin(mosi), miso=machine.Pin(miso))",
    "    sensor = rc522.RC522(spi, machine.Pin(cs, machine.Pin.OUT, value=1), machine.Pin(rst, machine.Pin.OUT, value=1))",
    '    globals()["_rc522"] = sensor',
    "  try:",
    "    return sensor.read_uid()",
    "  except OSError:",
    '    return ""',
  ]);
};

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_rc522_uid = (block) => {
    const profile = getActiveHardwareBoard();
    if (!profile) return ['""', pythonOrder.ATOMIC];
    const spiId = Number(block.getFieldValue("SPI") || 2);
    if (profile.spiIds?.length && !profile.spiIds.includes(spiId)) {
      return unavailable(`${profile.displayName} 上没有 SPI ${spiId}`);
    }
    const pins: string[] = [];
    for (const field of pinFields) {
      const target = pinTargetField(block, field === "MISO" ? "digital-input" : "digital-output", field);
      if (typeof target === "string") return ['""', pythonOrder.ATOMIC];
      pins.push(target.pinId);
    }
    if (new Set(pins).size < pinFields.length) return unavailable("RFID 的 SCK、MOSI、MISO、CS、RST 必须使用不同引脚");
    const helper = ensureRc522Helper();
    return [`${helper}(${spiId}, ${pins.join(", ")})`, pythonOrder.FUNCTION_CALL];
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.p2Modules) return [];
  const outputs = boardPinChoices(profile, "digital-output").map((pin) => pin.id);
  const inputs = boardPinChoices(profile, "digital-input").map((pin) => pin.id);
  const used = outputs.slice(0, 4);
  const input = inputs.find((id) => !used.includes(id)) ?? inputs[0] ?? "";
  return [
    hardwareSectionLabel("RFID 读卡"),
    {
      kind: "block",
      type: "hardware_rc522_uid",
      fields: {
        SPI: String(profile.spiIds?.[0] ?? 2),
        SCK: used[0] ?? "",
        MOSI: used[1] ?? "",
        MISO: input,
        CS: used[2] ?? "",
        RST: used[3] ?? "",
      },
    },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
