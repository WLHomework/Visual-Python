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
  numberShadow,
  pythonOrder,
  unavailable,
} from "./shared";

const definitions = [
  {
    type: "hardware_mqtt_connect",
    message0: "连接 MQTT 服务器 %1 端口 %2 客户端 ID %3 用户名 %4 密码 %5",
    args0: [
      { type: "input_value", name: "SERVER", check: "String" },
      { type: "input_value", name: "PORT", check: "Number" },
      { type: "input_value", name: "CLIENT_ID", check: "String" },
      { type: "input_value", name: "USER", check: "String" },
      { type: "input_value", name: "PASSWORD", check: "String" },
    ],
    inputsInline: false,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.network,
    tooltip:
      "连接未加密的 MQTT 服务器（默认端口 1883），需要先连接 Wi-Fi。用户名和密码会明文写入 .vpy 工程文件和设备上的 main.py；客户端 ID 要唯一。",
  },
  {
    type: "hardware_mqtt_publish",
    message0: "MQTT 发布 主题 %1 消息 %2",
    args0: [
      { type: "input_value", name: "TOPIC", check: "String" },
      { type: "input_value", name: "MESSAGE", check: "String" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.network,
    tooltip: "向已连接的 MQTT 服务器发布一条文本消息。",
  },
  {
    type: "hardware_mqtt_subscribe",
    message0: "MQTT 订阅 主题 %1",
    args0: [{ type: "input_value", name: "TOPIC", check: "String" }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.network,
    tooltip: "订阅一个主题。收到消息后用「等待 MQTT 消息」积木读取内容。",
  },
  {
    type: "hardware_mqtt_wait",
    message0: "等待 MQTT 消息 最多 %1 毫秒",
    args0: [{ type: "input_value", name: "TIMEOUT", check: "Number" }],
    inputsInline: true,
    output: "String",
    colour: hardwareColours.network,
    tooltip:
      "处理收到的 MQTT 消息并返回一条消息内容；超时返回空字符串。多个消息按到达顺序返回，读取后「最近 MQTT 主题」会同步为这条消息的主题。",
  },
  {
    type: "hardware_mqtt_last_topic",
    message0: "最近 MQTT 主题",
    output: "String",
    colour: hardwareColours.network,
    tooltip: "返回最近一次由「等待 MQTT 消息」取出的主题；还没取出消息时为空字符串。",
  },
  {
    type: "hardware_mqtt_connected",
    message0: "MQTT 已连接",
    output: "Boolean",
    colour: hardwareColours.network,
    tooltip: "检查 MQTT 客户端是否仍持有连接；未连接、连接失败或 socket 已失效时返回假。",
  },
  {
    type: "hardware_mqtt_disconnect",
    message0: "断开 MQTT",
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.network,
    tooltip: "断开 MQTT 连接并清空未读消息和最近主题；未连接时不会抛未捕获异常。",
  },
];

const advancedGuard = (): string | undefined => {
  const profile = getActiveHardwareBoard();
  if (!profile) return "请先选择硬件板卡";
  if (!profile.advancedWireless) return `${profile.displayName} 不支持 MQTT 积木（仅 ESP32-S3）`;
  return undefined;
};

const internals = () => hardwareGenerator as unknown as {
  definitions_: Record<string, string>;
  FUNCTION_NAME_PLACEHOLDER_: string;
  provideFunction_(name: string, code: string[]): string;
};

const ensureMqttState = (): void => {
  ensureImport("umqtt.simple");
  internals().definitions_.hardware_mqtt = [
    "_mqtt = None",
    "_mqtt_messages = []",
    '_mqtt_last_topic = ""',
    "def _mqtt_text(value):",
    "  try:",
    "    return value.decode()",
    "  except (AttributeError, UnicodeError):",
    "    return str(value)",
    "def _mqtt_on_message(topic, msg):",
    "  _mqtt_messages.append((_mqtt_text(topic), _mqtt_text(msg)))",
  ].join("\n");
};

const ensureWaitHelper = (): string =>
  internals().provideFunction_("hardware_mqtt_wait", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(timeout_ms):`,
    "  global _mqtt, _mqtt_last_topic",
    "  if _mqtt is None:",
    '    return ""',
    "  start = time.ticks_ms()",
    "  while not _mqtt_messages and time.ticks_diff(time.ticks_ms(), start) < timeout_ms:",
    "    try:",
    "      _mqtt.check_msg()",
    "    except (OSError, AttributeError):",
    "      _mqtt = None",
    '      return ""',
    "    time.sleep_ms(20)",
    "  if _mqtt_messages:",
    "    item = _mqtt_messages.pop(0)",
    "    _mqtt_last_topic = item[0]",
    "    return item[1]",
    '  return ""',
  ]);

const ensurePublishHelper = (): string =>
  internals().provideFunction_("hardware_mqtt_publish", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(topic, message):`,
    "  if _mqtt is None:",
    "    return",
    "  try:",
    "    _mqtt.publish(str(topic).encode(), str(message).encode())",
    "  except (OSError, AttributeError):",
    "    pass",
  ]);

const ensureSubscribeHelper = (): string =>
  internals().provideFunction_("hardware_mqtt_subscribe", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(topic):`,
    "  if _mqtt is None:",
    "    return",
    "  try:",
    "    _mqtt.subscribe(str(topic).encode())",
    "  except (OSError, AttributeError):",
    "    pass",
  ]);

/** 断开连接并清空队列；未连接或 socket 已失效时都静默处理。 */
const ensureDisconnectHelper = (): string =>
  internals().provideFunction_("hardware_mqtt_disconnect", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}():`,
    "  global _mqtt, _mqtt_messages, _mqtt_last_topic",
    "  if _mqtt is not None:",
    "    try:",
    "      _mqtt.disconnect()",
    "    except (OSError, AttributeError):",
    "      pass",
    "  _mqtt = None",
    "  _mqtt_messages = []",
    '  _mqtt_last_topic = ""',
  ]);

const ensureConnectedHelper = (): string =>
  internals().provideFunction_("hardware_mqtt_connected", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}():`,
    "  if _mqtt is None:",
    "    return False",
    "  try:",
    "    return _mqtt.sock is not None",
    "  except AttributeError:",
    "    return False",
  ]);

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_mqtt_connect = (block, generator) => {
    const problem = advancedGuard();
    if (problem) return unavailable(problem);
    ensureMqttState();
    const server = generator.valueToCode(block, "SERVER", pythonOrder.NONE) || '""';
    const port = generator.valueToCode(block, "PORT", pythonOrder.NONE) || "1883";
    const clientId = generator.valueToCode(block, "CLIENT_ID", pythonOrder.NONE) || '"visual-python-s3"';
    const user = generator.valueToCode(block, "USER", pythonOrder.NONE) || '""';
    const password = generator.valueToCode(block, "PASSWORD", pythonOrder.NONE) || '""';
    // 连接失败时清空 `_mqtt`，后续发布/订阅/等待积木会安全跳过。
    return [
      "try:",
      `  _mqtt = umqtt.simple.MQTTClient(str(${clientId}), str(${server}), port=int(${port}), user=(str(${user}) or None), password=str(${password}))`,
      "  _mqtt.set_callback(_mqtt_on_message)",
      "  _mqtt.connect()",
      "except (OSError, ValueError):",
      "  _mqtt = None",
      "",
    ].join("\n");
  };

  hardwareGenerator.forBlock.hardware_mqtt_publish = (block, generator) => {
    const problem = advancedGuard();
    if (problem) return unavailable(problem);
    ensureMqttState();
    const topic = generator.valueToCode(block, "TOPIC", pythonOrder.NONE) || '""';
    const message = generator.valueToCode(block, "MESSAGE", pythonOrder.NONE) || '""';
    return `${ensurePublishHelper()}(${topic}, ${message})\n`;
  };

  hardwareGenerator.forBlock.hardware_mqtt_subscribe = (block, generator) => {
    const problem = advancedGuard();
    if (problem) return unavailable(problem);
    ensureMqttState();
    const topic = generator.valueToCode(block, "TOPIC", pythonOrder.NONE) || '""';
    return `${ensureSubscribeHelper()}(${topic})\n`;
  };

  hardwareGenerator.forBlock.hardware_mqtt_wait = (block, generator) => {
    if (advancedGuard()) return ['""', pythonOrder.ATOMIC];
    ensureMqttState();
    ensureImport("time");
    const timeout = generator.valueToCode(block, "TIMEOUT", pythonOrder.NONE) || "1000";
    return [`${ensureWaitHelper()}(int(${timeout}))`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_mqtt_last_topic = () => {
    if (advancedGuard()) return ['""', pythonOrder.ATOMIC];
    ensureMqttState();
    return ["_mqtt_last_topic", pythonOrder.ATOMIC];
  };

  hardwareGenerator.forBlock.hardware_mqtt_disconnect = () => {
    const problem = advancedGuard();
    if (problem) return unavailable(problem);
    ensureMqttState();
    return `${ensureDisconnectHelper()}()\n`;
  };

  hardwareGenerator.forBlock.hardware_mqtt_connected = () => {
    if (advancedGuard()) return ["False", pythonOrder.ATOMIC];
    ensureMqttState();
    return [`${ensureConnectedHelper()}()`, pythonOrder.FUNCTION_CALL];
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.advancedWireless) return [];
  const text = (value: string) => ({ shadow: { type: "text", fields: { TEXT: value } } });
  const contents: unknown[] = [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("MQTT"),
    {
      kind: "block",
      type: "hardware_mqtt_connect",
      inputs: {
        SERVER: text("192.168.1.100"),
        PORT: numberShadow(1883),
        CLIENT_ID: text("visual-python-s3"),
        USER: text(""),
        PASSWORD: text(""),
      },
    },
    {
      kind: "block",
      type: "hardware_mqtt_publish",
      inputs: { TOPIC: text("visual-python/test"), MESSAGE: text("hello") },
    },
    { kind: "block", type: "hardware_mqtt_subscribe", inputs: { TOPIC: text("visual-python/test") } },
    { kind: "block", type: "hardware_mqtt_wait", inputs: { TIMEOUT: numberShadow(1000) } },
    { kind: "block", type: "hardware_mqtt_last_topic" },
  ];
  if (profile.p2Modules) contents.push({ kind: "block", type: "hardware_mqtt_connected" });
  contents.push({ kind: "block", type: "hardware_mqtt_disconnect" });
  return contents as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
