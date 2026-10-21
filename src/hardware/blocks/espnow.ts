import * as Blockly from "blockly/core";
import { getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureImport,
  ensureWlan,
  getActiveHardwareBoard,
  hardwareColours,
  hardwareGenerator,
  hardwareSectionLabel,
  numberShadow,
  pythonOrder,
  unavailable,
} from "./shared";

const definitions = [
  {
    type: "hardware_espnow_init",
    message0: "初始化 ESP-NOW",
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.communication,
    tooltip:
      "打开 Wi-Fi 接口并启用 ESP-NOW，不需要连接路由器。通信双方必须使用相同的 2.4 GHz 信道；发送前会自动登记对端 MAC。",
  },
  {
    type: "hardware_espnow_mac",
    message0: "ESP-NOW 本机 MAC",
    output: "String",
    colour: hardwareColours.communication,
    tooltip: "返回本机 Wi-Fi 接口的 MAC 地址，把它填到另一块板卡的「ESP-NOW 发送」积木里。",
  },
  {
    type: "hardware_espnow_send",
    message0: "ESP-NOW 发送文本 %1 到 MAC %2",
    args0: [
      { type: "input_value", name: "TEXT", check: "String" },
      { type: "input_value", name: "MAC", check: "String" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.communication,
    tooltip:
      "向指定 MAC 发送文本，首次发送会自动登记对端。MAC 写成 aa:bb:cc:dd:ee:ff；ESP32-S3 固件最多发送 1470 字节。",
  },
  {
    type: "hardware_espnow_receive",
    message0: "接收 ESP-NOW 消息 最多 %1 毫秒",
    args0: [{ type: "input_value", name: "TIMEOUT", check: "Number" }],
    inputsInline: true,
    output: "String",
    colour: hardwareColours.communication,
    tooltip: "等待一条消息并返回文本；超时返回空字符串。非 UTF-8 内容返回十六进制。",
  },
  {
    type: "hardware_espnow_last_mac",
    message0: "最近 ESP-NOW 发送者 MAC",
    output: "String",
    colour: hardwareColours.communication,
    tooltip: "返回最近一次收到的 ESP-NOW 消息的发送者 MAC；还没收到消息时为空字符串。",
  },
];

const advancedGuard = (): string | undefined => {
  const profile = getActiveHardwareBoard();
  if (!profile) return "请先选择硬件板卡";
  if (!profile.advancedWireless) return `${profile.displayName} 不支持 ESP-NOW 积木（仅 ESP32-S3）`;
  return undefined;
};

const internals = () => hardwareGenerator as unknown as {
  definitions_: Record<string, string>;
  FUNCTION_NAME_PLACEHOLDER_: string;
  provideFunction_(name: string, code: string[]): string;
};

const ensureEspnow = (): void => {
  ensureImport("espnow");
  ensureWlan();
  internals().definitions_.hardware_espnow = '_espnow = None\n_espnow_last_mac = ""';
};

const ensureStartHelper = (): string =>
  internals().provideFunction_("hardware_espnow_start", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}():`,
    "  global _espnow",
    "  _wlan.active(True)",
    "  if _espnow is None:",
    "    _espnow = espnow.ESPNow()",
    "  if not _espnow.active():",
    "    _espnow.active(True)",
  ]);

const ensureMacBytesHelper = (): string =>
  internals().provideFunction_("hardware_espnow_mac_bytes", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(mac):`,
    '  parts = str(mac).replace("-", ":").split(":")',
    "  if len(parts) != 6:",
    '    raise ValueError("MAC 地址应为 6 组十六进制")',
    "  result = bytearray(6)",
    "  for index in range(6):",
    "    result[index] = int(parts[index], 16)",
    "  return bytes(result)",
  ]);

const ensureLocalMacHelper = (startHelper: string): string =>
  internals().provideFunction_("hardware_espnow_local_mac", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}():`,
    `  ${startHelper}()`,
    "  mac = _wlan.config(\"mac\")",
    '  return "%02x:%02x:%02x:%02x:%02x:%02x" % (mac[0], mac[1], mac[2], mac[3], mac[4], mac[5])',
  ]);

const ensureSendHelper = (startHelper: string, macBytesHelper: string): string =>
  internals().provideFunction_("hardware_espnow_send", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(mac, text):`,
    `  ${startHelper}()`,
    `  peer = ${macBytesHelper}(mac)`,
    "  try:",
    "    _espnow.add_peer(peer)",
    "  except OSError:",
    "    pass",
    "  _espnow.send(peer, str(text), False)",
  ]);

const ensureReceiveHelper = (startHelper: string): string =>
  internals().provideFunction_("hardware_espnow_receive", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(timeout_ms):`,
    "  global _espnow_last_mac",
    `  ${startHelper}()`,
    "  mac, msg = _espnow.recv(int(timeout_ms))",
    "  if mac is None:",
    '    return ""',
    '  _espnow_last_mac = "%02x:%02x:%02x:%02x:%02x:%02x" % (mac[0], mac[1], mac[2], mac[3], mac[4], mac[5])',
    "  try:",
    "    return msg.decode()",
    "  except UnicodeError:",
    "    return msg.hex()",
  ]);

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_espnow_init = () => {
    const problem = advancedGuard();
    if (problem) return unavailable(problem);
    ensureEspnow();
    return `${ensureStartHelper()}()\n`;
  };

  hardwareGenerator.forBlock.hardware_espnow_mac = () => {
    if (advancedGuard()) return ['""', pythonOrder.ATOMIC];
    ensureEspnow();
    const start = ensureStartHelper();
    return [`${ensureLocalMacHelper(start)}()`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_espnow_send = (block, generator) => {
    const problem = advancedGuard();
    if (problem) return unavailable(problem);
    ensureEspnow();
    const start = ensureStartHelper();
    const macBytes = ensureMacBytesHelper();
    const text = generator.valueToCode(block, "TEXT", pythonOrder.NONE) || '""';
    const mac = generator.valueToCode(block, "MAC", pythonOrder.NONE) || '""';
    return `${ensureSendHelper(start, macBytes)}(${mac}, ${text})\n`;
  };

  hardwareGenerator.forBlock.hardware_espnow_receive = (block, generator) => {
    if (advancedGuard()) return ['""', pythonOrder.ATOMIC];
    ensureEspnow();
    const start = ensureStartHelper();
    const timeout = generator.valueToCode(block, "TIMEOUT", pythonOrder.NONE) || "1000";
    return [`${ensureReceiveHelper(start)}(int(${timeout}))`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_espnow_last_mac = () => {
    if (advancedGuard()) return ['""', pythonOrder.ATOMIC];
    ensureEspnow();
    return ["_espnow_last_mac", pythonOrder.ATOMIC];
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.advancedWireless) return [];
  return [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("ESP-NOW"),
    { kind: "block", type: "hardware_espnow_init" },
    { kind: "block", type: "hardware_espnow_mac" },
    {
      kind: "block",
      type: "hardware_espnow_send",
      inputs: {
        TEXT: { shadow: { type: "text", fields: { TEXT: "Hello" } } },
        MAC: { shadow: { type: "text", fields: { TEXT: "aa:bb:cc:dd:ee:ff" } } },
      },
    },
    { kind: "block", type: "hardware_espnow_receive", inputs: { TIMEOUT: numberShadow(1000) } },
    { kind: "block", type: "hardware_espnow_last_mac" },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
