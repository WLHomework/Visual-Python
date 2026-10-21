import * as Blockly from "blockly/core";
import { boardPinChoices, getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureUartReadAllHelper,
  ensureUartReadLineHelper,
  ensureImport,
  getActiveHardwareBoard,
  hardwareColours,
  hardwareGenerator,
  hardwareSectionLabel,
  numberShadow,
  pinTargetField,
  pythonOrder,
  unavailable,
} from "./shared";

// UART0 在所有板卡上都接着 REPL（S3 是板载 USB 串口），只能用 1/2。
const uartOptions = [["串口 1", "1"], ["串口 2", "2"]];

const definitions = [
  {
    type: "hardware_uart_init",
    message0: "初始化串口 %1 波特率 %2 发送引脚 %3 接收引脚 %4",
    args0: [
      { type: "field_dropdown", name: "UART", options: uartOptions },
      { type: "input_value", name: "BAUD", check: "Number" },
      { type: "field_dropdown", name: "TX", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "RX", options: [["（请先选择硬件板卡）", ""]] },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.board,
    tooltip: "初始化串口（UART）。串口 0 被系统占用，只能选串口 1/2；发送和接收积木都使用最后初始化的串口。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_uart_write",
    message0: "串口发送文本 %1",
    args0: [{ type: "input_value", name: "TEXT" }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.board,
    tooltip: "通过串口发送文本，不会自动换行；请先用「初始化串口」积木。",
  },
  {
    type: "hardware_uart_read",
    message0: "串口读取 %1",
    args0: [
      { type: "field_dropdown", name: "MODE", options: [["一行文本", "line"], ["全部可用内容", "all"]] },
    ],
    output: "String",
    colour: hardwareColours.board,
    tooltip: "读取串口收到的内容；没有数据时返回空字符串，不会卡住。请先用「初始化串口」积木。",
  },
];

export function register(): void {
  defineHardwareBlocks(definitions);
  hardwareGenerator.forBlock.hardware_uart_init = (block, generator) => {
    const profile = getActiveHardwareBoard();
    if (!profile) return unavailable("请先选择硬件板卡");
    if (!profile.uartIds?.length) return unavailable(`${profile.displayName} 没有可用的串口`);
    const uartId = Number(block.getFieldValue("UART"));
    if (!profile.uartIds.includes(uartId)) return unavailable(`${profile.displayName} 上没有串口 ${uartId}`);
    const tx = pinTargetField(block, "digital-output", "TX");
    if (typeof tx === "string") return tx;
    const rx = pinTargetField(block, "digital-input", "RX");
    if (typeof rx === "string") return rx;
    if (tx.pinId === rx.pinId) return unavailable("串口的发送和接收引脚不能相同");
    ensureImport("machine");
    const baud = generator.valueToCode(block, "BAUD", pythonOrder.NONE) || "9600";
    return `_uart = machine.UART(${uartId}, baudrate=int(${baud}), tx=machine.Pin(${tx.pinId}), rx=machine.Pin(${rx.pinId}))\n`;
  };
  hardwareGenerator.forBlock.hardware_uart_write = (block, generator) => {
    const profile = getActiveHardwareBoard();
    if (!profile) return unavailable("请先选择硬件板卡");
    if (!profile.uartIds?.length) return unavailable(`${profile.displayName} 没有可用的串口`);
    const text = generator.valueToCode(block, "TEXT", pythonOrder.NONE) || '""';
    return `_uart.write(str(${text}))\n`;
  };
  hardwareGenerator.forBlock.hardware_uart_read = (block) => {
    const profile = getActiveHardwareBoard();
    if (!profile?.uartIds?.length) return ["None", pythonOrder.ATOMIC];
    const helper = block.getFieldValue("MODE") === "all" ? ensureUartReadAllHelper() : ensureUartReadLineHelper();
    return [`${helper}()`, pythonOrder.FUNCTION_CALL];
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.uartIds?.length) return [];
  // 跳过板载 LED 引脚，避免默认值占用板载 LED（例如 WROOM 的 GPIO2）。
  const outputs = boardPinChoices(profile, "digital-output").filter((pin) => !pin.builtinLed);
  const inputs = boardPinChoices(profile, "digital-input").filter((pin) => !pin.builtinLed);
  const tx = outputs[0]?.id ?? "";
  const rx = (inputs.find((pin) => pin.id !== tx) ?? inputs[0])?.id ?? "";
  return [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("串口通信"),
    {
      kind: "block",
      type: "hardware_uart_init",
      fields: { UART: String(profile.uartIds[0]), TX: tx, RX: rx },
      inputs: { BAUD: numberShadow(9600) },
    },
    { kind: "block", type: "hardware_uart_write", inputs: { TEXT: { shadow: { type: "text", fields: { TEXT: "Hello" } } } } },
    { kind: "block", type: "hardware_uart_read", fields: { MODE: "line" } },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
